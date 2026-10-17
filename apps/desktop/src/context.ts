import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { contextRequestSchema, contextResponseSchema, type ContextFile, type ContextRequest, type ContextResponse, type ContextSnapshot, type NexusAuthState } from '@nexus-ai/contracts';
import type { LocalBindingStorage } from './local-bindings.js';
import { codexSessionKey } from './codex-storage.ts';
import { observeRepository } from './context-git.ts';

type Authorization = { userId: string } | { ok: false; code: string; message: string };
interface Dependencies {
  userData: string;
  auth: { getState(): Promise<NexusAuthState>; authorizeRepository(projectId: string, repositoryId: string): Promise<Authorization> };
  bindings: Pick<LocalBindingStorage, 'get'>;
  pickFiles(rootPath: string): Promise<string[]>;
  storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
}
interface Selection { id: string; path: string }
interface Stored { version: 1; files: Selection[]; draft: string; updatedAt: string }
interface Scope { userId: string; projectId: string; repositoryId: string; cwd: string; key: string; generation: number }
type ErrorCode = Exclude<ContextResponse, { ok: true }>['code'];
class ContextError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) { super(message); this.code = code; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const inside = (cwd: string, filename: string) => {
  const relative = path.relative(cwd, filename);
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
};
const invalidFile = () => new ContextError('invalid_request', 'Choose UTF-8 text files inside the linked folder, excluding secrets and generated dependencies. Each file must be at most 64 KiB.');

function allowedRelative(relative: string): boolean {
  if (!relative || relative.length > 500 || path.isAbsolute(relative) || relative.includes('\0') || relative.includes(':')) return false;
  const parts = relative.replaceAll('\\', '/').split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || [...part].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))) return false;
  const blockedDirectories = new Set(['.git', 'node_modules', '.ssh', '.aws', '.azure', '.kube', '.codex', '.nexus', '.gnupg', 'secrets', 'credentials']);
  if (parts.some(part => blockedDirectories.has(part.toLowerCase()))) return false;
  const name = parts.at(-1)!.toLowerCase();
  if (/^(?:\.?env)(?:$|[._-])/.test(name)) return false;
  const sourceFile = /\.(?:tsx?|jsx?|mjs|cjs|rs|py|go|java|kt|swift|c|h|cpp|hpp|cs|rb|php|vue|svelte)$/.test(name);
  if (/^(?:auth|credentials?|tokens?|secrets?)(?:$|[._-])/.test(name) && !sourceFile) return false;
  if (['.npmrc', '.pypirc', '.netrc', '.git-credentials', '.gitconfig', 'id_rsa', 'id_ed25519', 'id_dsa', 'id_ecdsa', 'authorized_keys', 'known_hosts'].includes(name)) return false;
  return !/\.(?:pem|key|p12|pfx|keystore|jks|ppk|kdbx|sqlite|sqlite3|db|exe|dll|so|dylib|zip|gz|png|jpe?g|webp|gif|pdf|woff2?|ttf|ico)$/i.test(name);
}

/** Bounded descriptor reads with canonical containment and inode/metadata checks before and after I/O. */
async function readSelection(cwd: string, selection: Selection): Promise<{ metadata: ContextFile; text: string }> {
  if (!allowedRelative(selection.path)) throw invalidFile();
  const requested = path.resolve(cwd, selection.path);
  if (!inside(cwd, requested)) throw invalidFile();
  let descriptor: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const canonical = await realpath(requested);
    if (!inside(cwd, canonical) || !allowedRelative(path.relative(cwd, canonical))) throw invalidFile();
    const before = await lstat(canonical);
    if (!before.isFile() || before.size > 65536) throw invalidFile();
    descriptor = await open(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = await descriptor.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs) throw invalidFile();
    const buffer = Buffer.alloc(65537);
    let count = 0;
    while (count < buffer.length) {
      const result = await descriptor.read(buffer, count, buffer.length - count, count);
      if (result.bytesRead === 0) break;
      count += result.bytesRead;
    }
    if (count > 65536 || count !== opened.size) throw invalidFile();
    const after = await descriptor.stat();
    const finalPath = await realpath(requested);
    const final = await lstat(finalPath);
    if (finalPath !== canonical || !inside(cwd, finalPath) || !final.isFile() || final.dev !== opened.dev || final.ino !== opened.ino ||
        after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || final.size !== opened.size || final.mtimeMs !== opened.mtimeMs) throw invalidFile();
    const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, count));
    if ([...content].some(character => { const code = character.charCodeAt(0); return (code < 32 && ![9, 10, 13].includes(code)) || code === 127; }) ||
        /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(content)) throw invalidFile();
    return { metadata: { id: selection.id, path: selection.path.replaceAll('\\', '/'), bytes: count, modifiedAt: after.mtime.toISOString() }, text: content };
  } catch (error) {
    if (error instanceof ContextError) throw error;
    throw invalidFile();
  } finally { await descriptor?.close(); }
}

/** Local encrypted selection/draft service; file contents leave main only through explicit preview/send. */
export class DesktopContext {
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private account: string | null | undefined;
  private readonly observations = new Map<string, ContextSnapshot['repository']>();
  private readonly metadata = new Map<string, ContextFile[]>();
  private readonly dependencies: Dependencies;
  constructor(dependencies: Dependencies) { this.dependencies = dependencies; }

  nexusStateChanged(state: NexusAuthState): void {
    const account = state.status === 'signed_in' ? state.user?.id ?? null : null;
    if (account !== this.account) { this.generation++; this.account = account; this.observations.clear(); this.metadata.clear(); }
  }

  private async authorize(projectId: string, repositoryId: string): Promise<Scope> {
    const generation = this.generation;
    // authorizeRepository already refreshes Nexus and checks the current technical role.
    // Do not duplicate that HTTP refresh for every debounced draft write.
    const authorized = await this.dependencies.auth.authorizeRepository(projectId, repositoryId);
    if ('ok' in authorized) throw new ContextError(authorized.code === 'auth_required' ? 'auth_required' : 'forbidden', 'Your current project role cannot use local context.');
    if (generation !== this.generation || (this.account !== undefined && authorized.userId !== this.account)) throw new ContextError('auth_required', 'Your Nexus account changed. Reopen this project.');
    const binding = await this.dependencies.bindings.get(authorized.userId, projectId, repositoryId);
    if (!binding) throw new ContextError('invalid_request', 'Choose a local folder for this repository in Repos first.');
    let cwd: string;
    try { cwd = await realpath(binding.rootPath); if (!path.isAbsolute(cwd) || !(await stat(cwd)).isDirectory()) throw new Error('Missing folder.'); }
    catch { throw new ContextError('invalid_request', 'The linked local folder is unavailable. Choose an existing folder in Repos.'); }
    return { userId: authorized.userId, projectId, repositoryId, cwd, key: `context:v1:${codexSessionKey(authorized.userId, projectId, repositoryId, cwd)}`, generation };
  }

  private async recheck(scope: Scope): Promise<void> {
    const fail = () => new ContextError('auth_required', 'Your account or local folder changed. Reopen this project.');
    if (scope.generation !== this.generation || (this.account !== undefined && this.account !== scope.userId)) throw fail();
    const binding = await this.dependencies.bindings.get(scope.userId, scope.projectId, scope.repositoryId);
    if (!binding || await realpath(binding.rootPath) !== scope.cwd || scope.generation !== this.generation) throw fail();
  }

  private async reauthorize(scope: Scope): Promise<void> {
    const current = await this.authorize(scope.projectId, scope.repositoryId);
    if (current.userId !== scope.userId || current.key !== scope.key || current.generation !== scope.generation) throw new ContextError('auth_required', 'Your account or local folder changed. Reopen this project.');
  }

  private async load(scope: Scope): Promise<Stored> {
    const raw = await this.dependencies.storage.getItem(scope.key);
    if (raw === null) return { version: 1, files: [], draft: '', updatedAt: new Date().toISOString() };
    if (raw.length > 262144) throw new Error('Invalid context storage.');
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid context storage.');
    const record = value as Record<string, unknown>;
    if (record['version'] !== 1 || !Array.isArray(record['files']) || record['files'].length > 8 || typeof record['draft'] !== 'string' || record['draft'].length > 32000 ||
        typeof record['updatedAt'] !== 'string' || !Number.isFinite(Date.parse(record['updatedAt']))) throw new Error('Invalid context storage.');
    const ids = new Set<string>();
    for (const item of record['files']) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !uuid.test(item.id) || ids.has(item.id) || typeof item.path !== 'string' || !allowedRelative(item.path)) throw new Error('Invalid context selection.');
      ids.add(item.id);
    }
    return record as unknown as Stored;
  }

  private async save(scope: Scope, stored: Stored): Promise<void> {
    await this.recheck(scope);
    stored.updatedAt = new Date().toISOString();
    await this.dependencies.storage.setItem(scope.key, JSON.stringify(stored));
    await this.recheck(scope);
  }

  private async readFiles(scope: Scope, stored: Stored, prune: boolean): Promise<{ metadata: ContextFile; text: string }[]> {
    const results: { metadata: ContextFile; text: string }[] = [];
    let bytes = 0;
    for (const file of stored.files) {
      try {
        const result = await readSelection(scope.cwd, file);
        bytes += result.metadata.bytes;
        if (bytes > 262144) throw invalidFile();
        results.push(result);
      } catch (error) { if (!prune) throw error; }
    }
    if (prune && results.length !== stored.files.length) {
      stored.files = stored.files.filter(file => results.some(result => result.metadata.id === file.id));
      await this.save(scope, stored);
    }
    return results;
  }

  request(input: ContextRequest): Promise<ContextResponse> {
    const parsed = contextRequestSchema.safeParse(input);
    if (!parsed.success) return Promise.resolve({ ok: false, code: 'invalid_request', message: 'Choose a valid context operation.' });
    // Capture before enqueue: a queued draft cannot cross an account transition.
    const generation = this.generation;
    const queuedUser = this.account;
    const queuedFolder = queuedUser ? this.dependencies.bindings.get(queuedUser, parsed.data.projectId, parsed.data.repositoryId)
      .then(async binding => binding ? await realpath(binding.rootPath) : null).catch(() => null) : Promise.resolve(undefined);
    const pending = this.queue.then(async (): Promise<ContextResponse> => {
      if (generation !== this.generation) throw new ContextError('auth_required', 'Your Nexus account changed. Reopen this project.');
      const request = parsed.data;
      const scope = await this.authorize(request.projectId, request.repositoryId);
      const originalFolder = await queuedFolder;
      if (originalFolder !== undefined && (queuedUser !== scope.userId || originalFolder !== scope.cwd)) throw new ContextError('invalid_request', 'The local folder changed while this operation was queued. Reopen the project context.');
      const stored = await this.load(scope);
      let preview: { fileId: string; text: string } | null = null;
      if (request.operation === 'pickFiles') {
        const paths = await this.dependencies.pickFiles(scope.cwd);
        await this.reauthorize(scope);
        if (paths.length > 8) throw new ContextError('invalid_request', 'Choose at most 8 files, with at most 256 KiB of text in total.');
        const files = [...stored.files];
        for (const filename of paths) {
          if (!path.isAbsolute(filename) || !inside(scope.cwd, filename)) throw invalidFile();
          const relative = path.relative(scope.cwd, filename);
          if (!files.some(file => file.path === relative)) files.push({ id: randomUUID(), path: relative });
        }
        if (files.length > 8) throw new ContextError('invalid_request', 'Remove a selected file before adding more than 8 files.');
        await this.readFiles(scope, { ...stored, files }, false);
        stored.files = files;
        await this.save(scope, stored);
      } else if (request.operation === 'removeFile') {
        if (!stored.files.some(file => file.id === request.fileId)) throw new ContextError('invalid_request', 'This file is not selected for the current repository.');
        stored.files = stored.files.filter(file => file.id !== request.fileId);
        await this.save(scope, stored);
      } else if (request.operation === 'saveDraft') { stored.draft = request.text; await this.save(scope, stored); }
      // A draft write does not read selected disk contents or spawn Git. Its snapshot uses the last validated metadata.
      const files = request.operation === 'saveDraft' ? null : await this.readFiles(scope, stored, request.operation !== 'readFile');
      if (files) this.metadata.set(scope.key, files.map(file => file.metadata));
      if (request.operation === 'readFile') {
        const selected = files?.find(file => file.metadata.id === request.fileId);
        if (!selected) throw new ContextError('invalid_request', 'This file is not selected for the current repository.');
        preview = { fileId: request.fileId, text: selected.text };
        await this.reauthorize(scope);
      }
      if (request.operation !== 'saveDraft' && (!this.observations.has(scope.key) || request.operation === 'get' || request.operation === 'pickFiles')) this.observations.set(scope.key, await observeRepository(scope.cwd));
      await this.recheck(scope);
      return contextResponseSchema.parse({ ok: true, context: { projectId: scope.projectId, repositoryId: scope.repositoryId, folderLabel: path.basename(scope.cwd).slice(0, 500),
        files: this.metadata.get(scope.key) ?? [], repository: this.observations.get(scope.key) ?? { isGit: false, branch: null, head: null, dirty: null, ahead: null, behind: null, observedAt: new Date().toISOString() },
        draft: stored.draft, updatedAt: stored.updatedAt }, preview });
    }).catch((error: unknown): ContextResponse => error instanceof ContextError ? { ok: false, code: error.code, message: error.message }
      : { ok: false, code: 'unavailable', message: 'Local context is unavailable. Check the linked folder and OS secure storage, then retry.' });
    this.queue = pending;
    return pending;
  }

  async resolveForSend(userId: string, projectId: string, repositoryId: string, cwd: string, attachmentIds: string[]): Promise<{ name: string; text: string }[]> {
    await this.queue;
    if (attachmentIds.length > 8 || new Set(attachmentIds).size !== attachmentIds.length || attachmentIds.some(id => !uuid.test(id))) throw invalidFile();
    const scope = await this.authorize(projectId, repositoryId);
    if (scope.userId !== userId || scope.cwd !== cwd) throw new ContextError('forbidden', 'The selected files do not belong to this repository binding.');
    const stored = await this.load(scope);
    const files = attachmentIds.map(id => stored.files.find(file => file.id === id));
    if (files.some(file => !file)) throw new ContextError('invalid_request', 'A selected file is no longer available. Refresh local context.');
    const results = await this.readFiles(scope, { ...stored, files: files as Selection[] }, false);
    await this.reauthorize(scope);
    return results.map(file => ({ name: file.metadata.path, text: file.text }));
  }
}

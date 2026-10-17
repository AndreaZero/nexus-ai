import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { workspaceRequestSchema, workspaceResponseSchema, type NexusAuthState, type WorkspaceFile, type WorkspaceRequest, type WorkspaceResponse, type WorkspaceSnapshot } from '@nexus-ai/contracts';
import type { LocalBindingStorage } from './local-bindings.js';
import { codexSessionKey } from './codex-storage.ts';
import { gitRecords, workspaceGit } from './workspace-git.ts';
import { unifiedDiff } from './workspace-diff.ts';

type Authorization = { userId: string } | { ok: false; code: string; message: string };
interface Dependencies {
  auth: { getState(): Promise<NexusAuthState>; authorizeRepository(projectId: string, repositoryId: string): Promise<Authorization> };
  bindings: Pick<LocalBindingStorage, 'get'>;
  openExternal(url: string): Promise<void>;
}
interface Scope { userId: string; projectId: string; repositoryId: string; cwd: string; key: string; generation: number }
interface Snapshot { value: WorkspaceSnapshot; files: Map<string, string> }
type ErrorCode = Exclude<WorkspaceResponse, { ok: true }>['code'];
class WorkspaceError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) { super(message); this.code = code; }
}
const inside = (root: string, target: string) => {
  const relative = path.relative(root, target);
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
};
const invalidFile = () => new WorkspaceError('invalid_request', 'This file is unavailable or excluded from local changes. Refresh the changes and choose an existing text file.');
const decoder = () => new TextDecoder('utf-8', { fatal: true });

function allowedRelative(relative: string): boolean {
  if (!relative || relative.length > 2000 || path.isAbsolute(relative) || relative.includes('\0') || relative.includes(':') || relative.includes('\\')) return false;
  const parts = relative.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part))) return false;
  const blocked = new Set(['.git', 'node_modules', '.ssh', '.aws', '.azure', '.kube', '.codex', '.nexus', '.gnupg', 'secrets', 'credentials']);
  if (parts.some(part => blocked.has(part.toLowerCase()))) return false;
  const name = parts.at(-1)!.toLowerCase();
  if (/^(?:\.?env)(?:$|[._-])/.test(name)) return false;
  const source = /\.(?:tsx?|jsx?|mjs|cjs|rs|py|go|java|kt|swift|c|h|cpp|hpp|cs|rb|php|vue|svelte)$/.test(name);
  if (/^(?:auth|credentials?|tokens?|secrets?)(?:$|[._-])/.test(name) && !source) return false;
  if (['.npmrc', '.pypirc', '.netrc', '.git-credentials', '.gitconfig', 'id_rsa', 'id_ed25519', 'id_dsa', 'id_ecdsa', 'authorized_keys', 'known_hosts'].includes(name)) return false;
  return !/\.(?:pem|key|p12|pfx|keystore|jks|ppk|kdbx|sqlite|sqlite3|db|exe|dll|so|dylib|zip|gz|png|jpe?g|webp|gif|pdf|woff2?|ttf|ico)$/i.test(name);
}

function decodeText(buffer: Buffer): string {
  const text = decoder().decode(buffer);
  if ([...text].some(character => { const code = character.charCodeAt(0); return (code < 32 && ![9, 10, 13].includes(code)) || code === 127; }) ||
      /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(text)) throw invalidFile();
  return text;
}

/** Reject every symlink component, including links whose target stays inside the root. */
async function safePath(cwd: string, relative: string, allowMissing: boolean): Promise<string | null> {
  if (!allowedRelative(relative)) throw invalidFile();
  const absolute = path.resolve(cwd, ...relative.split('/'));
  if (!inside(cwd, absolute)) throw invalidFile();
  let current = cwd;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw invalidFile();
    } catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw invalidFile();
    }
  }
  const canonical = await realpath(absolute);
  if (!inside(cwd, canonical) || canonical !== absolute) throw invalidFile();
  return canonical;
}

async function readWorkingText(cwd: string, relative: string): Promise<Buffer | null> {
  const filename = await safePath(cwd, relative, true);
  if (!filename) return null;
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const before = await lstat(filename);
    if (!before.isFile() || before.size > 65536) throw invalidFile();
    file = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = await file.stat();
    if (!opened.isFile() || opened.size !== before.size || opened.dev !== before.dev || opened.ino !== before.ino || opened.mtimeMs !== before.mtimeMs) throw invalidFile();
    const buffer = Buffer.alloc(65537);
    let bytes = 0;
    while (bytes < buffer.length) {
      const read = await file.read(buffer, bytes, buffer.length - bytes, bytes);
      if (!read.bytesRead) break;
      bytes += read.bytesRead;
    }
    const after = await file.stat();
    const finalPath = await safePath(cwd, relative, false);
    const final = finalPath ? await lstat(finalPath) : null;
    if (bytes !== opened.size || bytes > 65536 || !final || final.dev !== opened.dev || final.ino !== opened.ino || final.size !== opened.size ||
      final.mtimeMs !== opened.mtimeMs || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) throw invalidFile();
    const result = buffer.subarray(0, bytes);
    decodeText(result);
    return result;
  } finally { await file?.close(); }
}

export function validatedPreview(value: string | null): string | null {
  if (value === null) return null;
  if (value.length > 2000 || value.includes('\\') || [...value].some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) throw new WorkspaceError('invalid_request', 'Use an HTTPS preview URL, or HTTP on localhost, without credentials.');
  let url: URL;
  try { url = new URL(value); } catch { throw new WorkspaceError('invalid_request', 'Enter a complete preview URL.'); }
  if (url.username || url.password || !url.hostname || !(url.protocol === 'https:' || (url.protocol === 'http:' &&
    /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(value)))) {
    throw new WorkspaceError('invalid_request', 'Use an HTTPS preview URL, or HTTP on localhost, without credentials.');
  }
  return url.href;
}

/** Local-only, bounded changes and explicit OS opens; no paths or commands accepted from renderer. */
export class DesktopWorkspace {
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private account: string | null | undefined;
  private readonly snapshots = new Map<string, Snapshot>();
  private readonly previews = new Map<string, string>();
  private readonly dependencies: Dependencies;
  constructor(dependencies: Dependencies) { this.dependencies = dependencies; }

  nexusStateChanged(state: NexusAuthState): void {
    const account = state.status === 'signed_in' ? state.user?.id ?? null : null;
    if (account !== this.account) { this.generation++; this.account = account; this.snapshots.clear(); this.previews.clear(); }
  }

  private async authorize(projectId: string, repositoryId: string): Promise<Scope> {
    const generation = this.generation;
    const authorized = await this.dependencies.auth.authorizeRepository(projectId, repositoryId);
    if ('ok' in authorized) throw new WorkspaceError(authorized.code === 'auth_required' ? 'auth_required' : 'forbidden', 'Your current project role cannot use local changes or approvals.');
    if (generation !== this.generation || (this.account !== undefined && this.account !== authorized.userId)) throw new WorkspaceError('auth_required', 'Your Nexus account changed. Reopen this project.');
    const binding = await this.dependencies.bindings.get(authorized.userId, projectId, repositoryId);
    if (!binding) throw new WorkspaceError('invalid_request', 'Link a local folder in Repos first.');
    let cwd: string;
    try { cwd = await realpath(binding.rootPath); if (!path.isAbsolute(cwd) || !(await stat(cwd)).isDirectory()) throw invalidFile(); }
    catch { throw new WorkspaceError('invalid_request', 'The linked local folder is unavailable. Choose an existing folder in Repos.'); }
    return { userId: authorized.userId, projectId, repositoryId, cwd, key: codexSessionKey(authorized.userId, projectId, repositoryId, cwd), generation };
  }

  private async reauthorize(scope: Scope): Promise<void> {
    const current = await this.authorize(scope.projectId, scope.repositoryId);
    if (current.generation !== scope.generation || current.userId !== scope.userId || current.cwd !== scope.cwd) throw new WorkspaceError('auth_required', 'Your account or linked folder changed. Refresh the project.');
  }

  private blank(scope: Scope): WorkspaceSnapshot {
    return { projectId: scope.projectId, repositoryId: scope.repositoryId, isGit: false, files: [], truncated: false, observedAt: new Date().toISOString(), previewUrl: this.previews.get(scope.key) ?? null };
  }

  private async changes(scope: Scope): Promise<Snapshot> {
    const value = this.blank(scope);
    const files = new Map<string, string>();
    const git = await workspaceGit(scope.cwd);
    if (!git) return { value, files };
    const top = await git.run(['rev-parse', '--show-toplevel'], 8192);
    if (!top) return { value, files };
    let gitRoot: string;
    try { gitRoot = await realpath(decoder().decode(top).replace(/\r?\n$/, '')); } catch { return { value, files }; }
    if (gitRoot !== scope.cwd) throw new WorkspaceError('invalid_request', 'Link the Git repository root in Repos to review changes. A nested folder cannot expose the parent repository.');
    value.isGit = true;
    const head = await git.run(['rev-parse', '--verify', 'HEAD'], 256);
    const baseline = head ? await git.run(['ls-tree', '-r', '-z', '--full-tree', 'HEAD']) : Buffer.alloc(0);
    const tracked = await git.run(['ls-files', '--stage', '-z']);
    const untracked = await git.run(['ls-files', '--others', '--exclude-standard', '-z']);
    if (!baseline || !tracked || !untracked) throw new WorkspaceError('unavailable', 'The repository listing exceeds the local review limit or cannot be read. Narrow the working tree and retry.');
    const base = new Map<string, { oid: string; mode: string }>();
    for (const record of gitRecords(baseline)) {
      const match = /^(\d{6}) blob ([a-f0-9]{40,64})\t([\s\S]+)$/.exec(record);
      if (match) base.set(match[3]!, { oid: match[2]!, mode: match[1]! });
    }
    const excluded = new Set<string>();
    const names = new Set(base.keys());
    for (const record of gitRecords(tracked)) {
      const match = /^(\d{6}) [a-f0-9]{40,64} ([0-3])\t([\s\S]+)$/.exec(record);
      if (!match) continue;
      if (match[1] === '120000' || match[1] === '160000' || match[2] !== '0') excluded.add(match[3]!);
      names.add(match[3]!);
    }
    for (const name of gitRecords(untracked)) names.add(name);
    let total = 0;
    let scannedBytes = 0;
    let examined = 0;
    for (const name of names) {
      if (++examined > 10000) { value.truncated = true; break; }
      const previous = base.get(name);
      if (!allowedRelative(name) || excluded.has(name) || (previous && previous.mode !== '100644' && previous.mode !== '100755')) continue;
      let next: Buffer | null;
      try { next = await readWorkingText(scope.cwd, name); } catch { continue; }
      scannedBytes += next?.length ?? 0;
      if (scannedBytes > 16777216) { value.truncated = true; break; }
      if (!previous && !next) continue;
      if (previous && next) {
        const oid = createHash(previous.oid.length === 64 ? 'sha256' : 'sha1').update(`blob ${next.length}\0`).update(next).digest('hex');
        if (oid === previous.oid) continue;
      }
      if (value.files.length >= 50) { value.truncated = true; break; }
      let before = '';
      if (previous) {
        const blob = await git.run(['cat-file', 'blob', previous.oid], 65536);
        if (!blob) { value.truncated = true; continue; }
        try { before = decodeText(blob); } catch { continue; }
      }
      let after: string;
      try { after = next ? decodeText(next) : ''; } catch { continue; }
      const kind = !previous ? 'add' : !next ? 'delete' : 'update';
      const diff = unifiedDiff(name, before, after, kind);
      const remaining = 262144 - total;
      const buffer = Buffer.from(diff.diff);
      if (buffer.length > remaining) { value.truncated = true; break; }
      total += buffer.length;
      const item: WorkspaceFile = { id: randomUUID(), path: name, oldPath: null, kind, ...diff };
      value.files.push(item);
      if (next) files.set(item.id, name);
      value.truncated ||= diff.truncated;
    }
    return { value, files };
  }

  request(input: WorkspaceRequest): Promise<WorkspaceResponse> {
    const parsed = workspaceRequestSchema.safeParse(input);
    if (!parsed.success) return Promise.resolve({ ok: false, code: 'invalid_request', message: 'Choose a valid local workspace operation.' });
    const generation = this.generation;
    const queuedUser = this.account;
    const queuedFolder = queuedUser ? this.dependencies.bindings.get(queuedUser, parsed.data.projectId, parsed.data.repositoryId)
      .then(async binding => binding ? await realpath(binding.rootPath) : null).catch(() => null) : Promise.resolve(undefined);
    const pending = this.queue.then(async (): Promise<WorkspaceResponse> => {
      if (generation !== this.generation) throw new WorkspaceError('auth_required', 'Your account changed. Reopen this project.');
      const request = parsed.data;
      const scope = await this.authorize(request.projectId, request.repositoryId);
      const originalFolder = await queuedFolder;
      if (originalFolder !== undefined && (queuedUser !== scope.userId || originalFolder !== scope.cwd)) throw new WorkspaceError('invalid_request', 'The linked folder changed while this operation was queued.');
      let snapshot = this.snapshots.get(scope.key);
      if (request.operation === 'getChanges') { snapshot = await this.changes(scope); }
      else if (request.operation === 'setPreview') {
        const url = validatedPreview(request.url);
        await this.reauthorize(scope);
        if (url) this.previews.set(scope.key, url); else this.previews.delete(scope.key);
      } else if (request.operation === 'openPreview') {
        const preview = this.previews.get(scope.key);
        if (!preview) throw new WorkspaceError('invalid_request', 'Configure a preview URL first.');
        const url = validatedPreview(preview);
        await this.reauthorize(scope);
        try { await this.dependencies.openExternal(url!); } catch { throw new WorkspaceError('unavailable', 'The preview could not be opened. Check the system browser and retry.'); }
      } else if (request.operation === 'openEditor') {
        let filename = scope.cwd;
        if (request.fileId) {
          const relative = snapshot?.files.get(request.fileId);
          if (!relative) throw invalidFile();
          filename = (await safePath(scope.cwd, relative, false))!;
          if (!(await stat(filename)).isFile()) throw invalidFile();
        }
        await this.reauthorize(scope);
        if (request.fileId) {
          // Authorization may await the server: revalidate the opaque file afterwards as well.
          const relative = snapshot?.files.get(request.fileId);
          if (!relative) throw invalidFile();
          filename = (await safePath(scope.cwd, relative, false))!;
          if (!(await stat(filename)).isFile()) throw invalidFile();
        }
        if (scope.generation !== this.generation || (this.account !== undefined && this.account !== scope.userId)) throw new WorkspaceError('auth_required', 'Your account changed. Reopen this project.');
        // VS Code's documented file URI is fixed; a filename cannot supply its own command or query.
        const encoded = filename.replaceAll('\\', '/').split('/').map(part => encodeURIComponent(part)).join('/').replace(/^([A-Za-z])%3A\//, '$1:/');
        const url = `vscode://file/${encoded.replace(/^\//, '')}${request.fileId ? '' : '/'}`;
        try { await this.dependencies.openExternal(url); } catch { throw new WorkspaceError('unavailable', 'VS Code could not be opened. Install VS Code and register its vscode:// protocol, then retry.'); }
      }
      await this.reauthorize(scope);
      snapshot ??= { value: this.blank(scope), files: new Map() };
      snapshot.value = { ...snapshot.value, previewUrl: this.previews.get(scope.key) ?? null };
      // Snapshot UUIDs are deliberately replaced by each explicit refresh.
      this.snapshots.set(scope.key, snapshot);
      if (this.snapshots.size > 64) this.snapshots.delete(this.snapshots.keys().next().value!);
      if (this.previews.size > 64) this.previews.delete(this.previews.keys().next().value!);
      return workspaceResponseSchema.parse({ ok: true, snapshot: snapshot.value });
    }).catch((error: unknown): WorkspaceResponse => error instanceof WorkspaceError ? { ok: false, code: error.code, message: error.message }
      : { ok: false, code: 'unavailable', message: 'Local changes are unavailable. Check the linked folder and local Git installation, then retry.' });
    this.queue = pending;
    return pending;
  }
}

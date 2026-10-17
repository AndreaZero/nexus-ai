import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { gitRequestSchema, gitResponseSchema, type GitRequest, type GitResponse, type GitSnapshot, type NexusAuthState } from '@nexus-ai/contracts';
import type { LocalBindingStorage } from './local-bindings.js';
import { allowedRelative, readWorkingText, type DesktopWorkspace } from './workspace.ts';
import { gitRecords } from './workspace-git.ts';
import { GitError, githubRemote, openGit, type GitRunner } from './git-runner.ts';

interface Dependencies {
  authorize(projectId: string, repositoryId: string): Promise<{ userId: string; remoteUrl: string } | null>;
  credential(projectId: string, repositoryId: string): Promise<string | null>;
  bindings: Pick<LocalBindingStorage, 'get'>;
  workspace: Pick<DesktopWorkspace, 'request'>;
}
interface Scope { userId: string; projectId: string; repositoryId: string; cwd: string; remoteUrl: string; generation: number; key: string }
interface TreeEntry { mode: string; oid: string }
interface Inspection { value: GitSnapshot; fingerprint: string; entries: Map<string, TreeEntry>; files: Map<string, string>; index: Buffer | null; remoteUrl: string }
const sha = /^[a-f0-9]{40,64}$/;
const text = (value: Buffer | null): string => value?.toString('utf8').trim() ?? '';
const hash = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');
const samePath = (first: string, second: string) => process.platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second;
async function optionalRead(filename: string): Promise<Buffer | null> { try { return await readFile(filename); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } }

/** Explicit Git actions on the authorized local binding. No renderer paths or credentials. */
export class DesktopGit {
  private readonly dependencies: Dependencies;
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private account: string | null | undefined;
  private readonly snapshots = new Map<string, Inspection>();
  constructor(dependencies: Dependencies) { this.dependencies = dependencies; }

  nexusStateChanged(state: NexusAuthState): void {
    const account = state.status === 'signed_in' ? state.user?.id ?? null : null;
    if (account !== this.account) { this.account = account; this.generation++; this.snapshots.clear(); }
  }
  invalidate(): void { this.generation++; this.snapshots.clear(); }

  private async authorize(projectId: string, repositoryId: string): Promise<Scope> {
    const generation = this.generation;
    const access = await this.dependencies.authorize(projectId, repositoryId);
    if (!access) throw new GitError('forbidden', 'Your current account cannot manage this project repository.');
    if (generation !== this.generation || (this.account !== undefined && this.account !== access.userId)) throw new GitError('auth_required', 'Your Nexus account changed. Reopen this project.');
    const binding = await this.dependencies.bindings.get(access.userId, projectId, repositoryId);
    if (!binding) throw new GitError('invalid_request', 'Link this repository root to a local folder in Repos.');
    const cwd = await realpath(binding.rootPath);
    if (!(await stat(cwd)).isDirectory()) throw new GitError('invalid_request', 'The linked local repository folder is unavailable.');
    if (generation !== this.generation || (this.account !== undefined && this.account !== access.userId)) throw new GitError('auth_required', 'Your Nexus account changed. Reopen this project.');
    return { ...access, projectId, repositoryId, cwd, generation, key: `${access.userId}/${projectId}/${repositoryId}/${cwd}` };
  }
  private async reauthorize(scope: Scope): Promise<void> {
    const next = await this.authorize(scope.projectId, scope.repositoryId);
    if (next.generation !== scope.generation || next.userId !== scope.userId || !samePath(next.cwd, scope.cwd) || next.remoteUrl !== scope.remoteUrl) throw new GitError('auth_required', 'Your account, repository or local folder changed. Refresh before continuing.');
  }

  private async inspect(scope: Scope, git: GitRunner | null): Promise<Inspection> {
    const value: GitSnapshot = { projectId: scope.projectId, repositoryId: scope.repositoryId, isGit: !!git, branch: null, head: null, branches: [], ahead: null, behind: null, dirty: false, conflicts: [], staged: false, changes: [], commits: [], truncated: false, observedAt: new Date().toISOString(), snapshotId: randomUUID() };
    const entries = new Map<string, TreeEntry>();
    const files = new Map<string, string>();
    if (!git) return { value, entries, files, fingerprint: '', index: null, remoteUrl: scope.remoteUrl };
    const top = text(await git.run(['rev-parse', '--show-toplevel']));
    if (!samePath(await realpath(top), scope.cwd) || text(await git.run(['rev-parse', '--is-bare-repository'])) !== 'false') throw new GitError('invalid_request', 'Choose the exact root of a regular Git working repository.');
    value.branch = text(await git.run(['symbolic-ref', '--quiet', '--short', 'HEAD'], { optional: true })) || null;
    if (value.branch && text(await git.run(['symbolic-ref', '--quiet', 'HEAD'])) !== `refs/heads/${value.branch}`) throw new GitError('invalid_request', 'HEAD must reference a local branch directly.');
    const head = text(await git.run(['rev-parse', '--verify', 'HEAD'], { optional: true }));
    value.head = sha.test(head) ? head : null;
    const headRecords = value.head ? await git.run(['ls-tree', '-r', '-z', '--full-tree', value.head]) : Buffer.alloc(0);
    const indexRecords = await git.run(['ls-files', '--stage', '-z']);
    const otherRecords = await git.run(['ls-files', '--others', '--exclude-standard', '-z']);
    const flags = gitRecords((await git.run(['ls-files', '-v', '-z']))!);
    if (flags.some(record => /^[a-zS]/.test(record))) throw new GitError('invalid_request', 'Sparse checkout and assume-unchanged or skip-worktree index entries are not supported. Restore a regular index using your local Git tools.');
    const names = new Set<string>();
    const staged = new Map<string, TreeEntry>();
    for (const record of gitRecords(headRecords!)) {
      const match = /^(\d{6}) (?:blob|commit) ([a-f0-9]{40,64})\t([\s\S]+)$/.exec(record);
      if (match) { entries.set(match[3]!, { mode: match[1]!, oid: match[2]! }); names.add(match[3]!); }
    }
    for (const record of gitRecords(indexRecords!)) {
      const match = /^(\d{6}) ([a-f0-9]{40,64}) ([0-3])\t([\s\S]+)$/.exec(record);
      if (!match) throw new GitError('invalid_request', 'The Git index cannot be safely inspected.');
      const name = match[4]!; names.add(name);
      if (match[3] !== '0') { if (value.conflicts.length < 100 && !value.conflicts.includes(name)) value.conflicts.push(name); }
      else staged.set(name, { mode: match[1]!, oid: match[2]! });
    }
    for (const name of gitRecords(otherRecords!)) names.add(name);
    value.staged = [...new Set([...entries.keys(), ...staged.keys()])].some(name => entries.get(name)?.mode !== staged.get(name)?.mode || entries.get(name)?.oid !== staged.get(name)?.oid);
    if (names.size > 10000) throw new GitError('invalid_request', 'This repository exceeds the 10,000-file local safety limit. Narrow its working tree before Git operations.');
    const fingerprint = createHash('sha256').update(value.head ?? '').update('\0').update(value.branch ?? '').update('\0').update(hash(indexRecords!)).update(hash(otherRecords!));
    let bytes = 0;
    for (const name of [...names].sort()) {
      // Git reports forward slashes even on Windows. Never follow symlinks or escape the bound root.
      if (!name || name.includes('\\') || name.includes('\0') || name.split('/').some(part => !part || part === '.' || part === '..') || path.isAbsolute(name)) throw new GitError('invalid_request', 'The repository contains unsupported file paths.');
      let cursor = scope.cwd; let info: Awaited<ReturnType<typeof lstat>> | null = null;
      for (const part of name.split('/')) {
        cursor = path.join(cursor, part);
        try { info = await lstat(cursor); if (info.isSymbolicLink()) throw new GitError('invalid_request', 'Git operations on symlinks or submodules are not supported.'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { info = null; break; } throw error; }
      }
      const base = entries.get(name);
      if (base && !['100644', '100755'].includes(base.mode)) throw new GitError('invalid_request', 'Git operations on symlinks or submodules are not supported.');
      fingerprint.update(name).update('\0');
      if (!info) { fingerprint.update('missing'); if (base) value.dirty = true; continue; }
      if (!info.isFile()) throw new GitError('invalid_request', 'The repository contains submodules or unsupported file types.');
      if (info.size > 16777216 || bytes + info.size > 67108864) throw new GitError('invalid_request', 'Git inspection is limited to 16 MiB per file and 64 MiB total. Review larger repositories using your local Git tools.');
      const content = await readFile(cursor); bytes += content.length;
      const after = await lstat(cursor);
      if (after.isSymbolicLink() || after.size !== info.size || after.mtimeMs !== info.mtimeMs || content.length !== info.size) throw new GitError('conflict', 'Files changed while Git was inspecting them. Refresh and retry.');
      fingerprint.update(hash(content));
      const oid = createHash(base?.oid.length === 64 ? 'sha256' : 'sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
      if (!base || base.oid !== oid || (process.platform !== 'win32' && (info.mode & 0o111 ? '100755' : '100644') !== base.mode)) value.dirty = true;
      if (name.split('/').at(-1) === '.gitattributes' && /(?:filter|working-tree-encoding)\s*=/.test(content.toString('utf8'))) throw new GitError('invalid_request', 'Remove executable filters or working-tree encodings before using Nexus Git operations.');
    }
    value.dirty ||= value.staged || value.conflicts.length > 0;
    const branches = text(await git.run(['for-each-ref', '--count=201', '--format=%(refname:short)', 'refs/heads/'])).split(/\r?\n/).filter(Boolean);
    value.truncated = branches.length > 200; value.branches = branches.slice(0, 200);
    if (value.branch && value.head) {
      const remoteRef = `refs/remotes/nexus/${value.branch}`;
      const counts = text(await git.run(['rev-list', '--left-right', '--count', `${value.head}...${remoteRef}`], { optional: true })).match(/^(\d+)\s+(\d+)$/);
      if (counts) { value.ahead = Number(counts[1]); value.behind = Number(counts[2]); }
    }
    if (value.head) {
      const history = gitRecords((await git.run(['log', '-z', '--max-count=30', '--format=%H%x00%s%x00%an%x00%aI', value.head]))!);
      for (let index = 0; index + 3 < history.length; index += 4) {
        const [commitSha, title, author, authoredAt] = history.slice(index, index + 4);
        if (!sha.test(commitSha!) || !Number.isFinite(Date.parse(authoredAt!))) continue;
        let url: string | null = null; try { url = `${githubRemote(scope.remoteUrl).replace(/\.git$/, '')}/commit/${commitSha}`; } catch { /* Local Git does not require a GitHub remote. */ }
        value.commits.push({ sha: commitSha!, title: title!.slice(0, 500), author: author!.slice(0, 200), authoredAt: new Date(authoredAt!).toISOString(), url });
      }
    }
    const workspace = await this.dependencies.workspace.request({ operation: 'getChanges', projectId: scope.projectId, repositoryId: scope.repositoryId });
    if (!workspace.ok) throw new GitError(workspace.code, workspace.message);
    value.changes = workspace.snapshot.files.map(file => ({id:file.id,path:file.path,kind:file.kind,additions:file.additions,deletions:file.deletions,diff:file.diff,truncated:file.truncated}));
    value.truncated ||= workspace.snapshot.truncated;
    for (const file of value.changes) files.set(file.id, file.path);
    const index = await optionalRead(path.join(git.directory, 'index'));
    fingerprint.update(hash(index ?? Buffer.alloc(0)));
    return { value, entries, files, index, fingerprint: fingerprint.digest('hex'), remoteUrl: scope.remoteUrl };
  }

  private async unchanged(scope: Scope, git: GitRunner, previous: Inspection): Promise<Inspection> {
    await this.reauthorize(scope);
    await openGit(scope.cwd);
    const next = await this.inspect(scope, git);
    if (next.fingerprint !== previous.fingerprint || next.remoteUrl !== previous.remoteUrl) throw new GitError('conflict', 'The branch, index, repository URL or working files changed after the preview. Refresh and review the latest diff.');
    return next;
  }

  private async commit(scope: Scope, git: GitRunner, previous: Inspection, request: Extract<GitRequest, { operation: 'commit' }>): Promise<void> {
    if (previous.value.truncated || previous.value.staged || previous.value.conflicts.length || !previous.value.branch) throw new GitError('conflict', 'Commit requires a complete preview, an attached branch and an index without staged changes or conflicts. Existing staged work is preserved.');
    const selected = [...new Set(request.fileIds)].map(id => {
      const name = previous.files.get(id); const change = previous.value.changes.find(file => file.id === id);
      if (!name || !change || change.truncated || !allowedRelative(name)) throw new GitError('invalid_request', 'Select current, complete text-file diffs from this preview.');
      return { name, change };
    });
    const content = new Map<string, Buffer | null>();
    for (const { name, change } of selected) {
      const value = await readWorkingText(scope.cwd, name);
      if ((change.kind === 'delete') !== (value === null)) throw new GitError('conflict', 'A selected file changed. Refresh its diff first.');
      content.set(name, value);
    }
    await this.unchanged(scope, git, previous);
    const lockPath = path.join(git.directory, 'index.lock');
    let lock: Awaited<ReturnType<typeof open>>;
    try { lock = await open(lockPath, 'wx', 0o600); } catch { throw new GitError('conflict', 'Another Git process holds the index lock. Wait for it to finish and refresh.'); }
    const temporary = path.join(git.directory, `nexus-index-${randomUUID()}`);
    const env = { GIT_INDEX_FILE: temporary };
    let committed: string | null = null;
    try {
      const current = await optionalRead(path.join(git.directory, 'index'));
      if ((current === null) !== (previous.index === null) || hash(current ?? '') !== hash(previous.index ?? '')) throw new GitError('conflict', 'The Git index changed before the commit. Refresh first.');
      await git.run(previous.value.head ? ['read-tree', previous.value.head] : ['read-tree', '--empty'], { env });
      const updates: Buffer[] = [];
      for (const { name } of selected) {
        const value = content.get(name)!;
        const oid = value === null ? '0'.repeat(previous.value.head?.length ?? 40) : text(await git.run(['hash-object', '-w', '--no-filters', '--stdin'], { input: value }));
        const mode = value === null ? '0' : previous.entries.get(name)?.mode ?? '100644';
        updates.push(Buffer.from(`${mode} ${oid}\t${name}\0`));
      }
      await git.run(['update-index', '-z', '--index-info'], { env, input: Buffer.concat(updates) });
      const tree = text(await git.run(['write-tree'], { env }));
      await this.unchanged(scope, git, previous);
      const author = { GIT_AUTHOR_NAME: request.authorName, GIT_AUTHOR_EMAIL: request.authorEmail, GIT_COMMITTER_NAME: request.authorName, GIT_COMMITTER_EMAIL: request.authorEmail };
      const commit = text(await git.run(['commit-tree', tree, ...(previous.value.head ? ['-p', previous.value.head] : [])], { env: author, input: `${request.message}\n` }));
      if (!sha.test(commit)) throw new GitError('unavailable', 'Git did not produce a valid commit.');
      await this.reauthorize(scope);
      if (hash((await optionalRead(path.join(git.directory, 'index'))) ?? '') !== hash(previous.index ?? '')) throw new GitError('conflict', 'The Git index changed before the commit.');
      await git.run(['update-ref', '-m', 'Nexus explicit commit', `refs/heads/${previous.value.branch}`, commit, previous.value.head ?? '0'.repeat(commit.length)]);
      committed = commit;
      await rename(temporary, path.join(git.directory, 'index'));
    } catch (error) {
      if (committed) {
        const rolledBack = await git.run(previous.value.head ? ['update-ref', `refs/heads/${previous.value.branch}`, previous.value.head, committed] : ['update-ref', '-d', `refs/heads/${previous.value.branch}`, committed], { optional: true });
        if (rolledBack === null) throw new GitError('uncertain', 'The commit was created but the index could not be updated. Inspect your local Git state before continuing.');
      }
      throw error;
    } finally { await lock.close(); await rm(lockPath, { force: true }); await rm(temporary, { force: true }); await rm(`${temporary}.lock`, { force: true }); }
  }

  request(input: GitRequest): Promise<GitResponse> {
    const parsed = gitRequestSchema.safeParse(input);
    if (!parsed.success) return Promise.resolve({ ok: false, code: 'invalid_request', message: 'Choose a valid Git operation.' });
    const generation = this.generation;
    const pending = this.queue.then(async (): Promise<GitResponse> => {
      if (generation !== this.generation) throw new GitError('auth_required', 'Your Nexus account changed. Reopen this project.');
      const request = parsed.data;
      const scope = await this.authorize(request.projectId, request.repositoryId);
      const git = await openGit(scope.cwd);
      if (request.operation !== 'snapshot') {
        const previous = this.snapshots.get(scope.key);
        if (!git || !previous || previous.value.snapshotId !== request.snapshotId) throw new GitError('conflict', 'Refresh the Git preview before this action.');
        await this.unchanged(scope, git, previous);
        this.snapshots.delete(scope.key);
        if (request.operation === 'commit') await this.commit(scope, git, previous, request);
        else if (request.operation === 'createBranch' || request.operation === 'switchBranch') {
          if (!previous.value.head || previous.value.dirty || previous.value.conflicts.length || previous.value.staged) throw new GitError('conflict', 'Branch actions require a clean working tree and an existing commit. Commit or resolve local changes explicitly first.');
          await git.run(['check-ref-format', '--branch', request.branch]);
          await this.unchanged(scope, git, previous);
          await git.run(request.operation === 'createBranch' ? ['branch', '--no-track', request.branch, previous.value.head] : ['switch', '--no-guess', '--no-recurse-submodules', '--no-overwrite-ignore', request.branch]);
        } else {
          if (!previous.value.branch || !previous.value.head || previous.value.conflicts.length || previous.value.staged) throw new GitError('conflict', 'Synchronization requires an attached branch without staged changes or conflicts.');
          if (request.operation === 'pull' && previous.value.dirty) throw new GitError('conflict', 'Fast-forward pull requires a clean working tree, including files excluded from the diff.');
          const url = githubRemote(scope.remoteUrl);
          const token = await this.dependencies.credential(scope.projectId, scope.repositoryId);
          if (!token) throw new GitError('not_connected', 'Connect this GitHub repository in Repos before synchronization.');
          if (!/^[A-Za-z0-9_]{20,500}$/.test(token)) throw new GitError('not_connected', 'Reconnect the repository with a valid GitHub token.');
          await this.unchanged(scope, git, previous);
          const branch = previous.value.branch;
          await git.run(['check-ref-format', '--branch', branch]);
          if (request.operation === 'push') await git.run(['push', '--porcelain', '--no-verify', '--no-follow-tags', '--recurse-submodules=no', url, `${previous.value.head}:refs/heads/${branch}`], { token, network: true });
          else {
            await git.run(['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', url, `refs/heads/${branch}:refs/remotes/nexus/${branch}`], { token, network: true });
            if (request.operation === 'pull') {
              await this.unchanged(scope, git, previous);
              const target = text(await git.run(['rev-parse', '--verify', `refs/remotes/nexus/${branch}`]));
              await git.run(['merge-base', '--is-ancestor', previous.value.head, target]);
              // FF-only Git merge with all hooks and signing disabled; no merge commit or force/reset.
              await git.run(['merge', '--ff-only', '--no-edit', '--no-stat', '--no-gpg-sign', '--no-overwrite-ignore', target]);
            }
          }
        }
      }
      await this.reauthorize(scope);
      const refreshedGit = await openGit(scope.cwd);
      const snapshot = await this.inspect(scope, refreshedGit);
      await this.reauthorize(scope);
      this.snapshots.set(scope.key, snapshot);
      if (this.snapshots.size > 64) this.snapshots.delete(this.snapshots.keys().next().value!);
      return gitResponseSchema.parse({ ok: true, snapshot: snapshot.value, notice: request.operation === 'snapshot' ? null : request.operation === 'createBranch' ? 'Branch created. Switch to it explicitly when ready.' : `Git ${request.operation} completed.` });
    }).catch((error: unknown): GitResponse => error instanceof GitError ? { ok: false, code: error.code, message: error.message } : { ok: false, code: 'unavailable', message: 'Git is unavailable. Check the linked repository, permissions and local Git installation, then refresh.' });
    this.queue = pending;
    return pending;
  }
}

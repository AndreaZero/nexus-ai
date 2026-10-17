import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { appendFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { GitRequest, GitResponse, NexusAuthState } from '@nexus-ai/contracts';
import { DesktopGit } from '../src/git.ts';
import { githubRemote } from '../src/git-runner.ts';
import { DesktopWorkspace } from '../src/workspace.ts';
import { resolveGitExecutable } from '../src/context-git.ts';

const projectId = '10b2333e-3207-45f4-81fc-301318ec6ef2';
const repositoryId = '2d743435-aab3-4dfe-8e35-b6a9d0283711';
const authState = (id: string): NexusAuthState => ({ status: 'signed_in', user: { id, name: 'Fixture', email: 'fixture@example.invalid', emailVerified: true, image: null }, expiresAt: '2099-01-01T00:00:00.000Z', persistent: true, message: null });
function success(response: GitResponse) { assert.equal(response.ok, true, response.ok ? '' : response.message); if (!response.ok) throw new Error('Expected success.'); return response.snapshot; }
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nexus-git-'));
  const root = path.join(directory, 'repo'); await mkdir(root);
  const executable = await resolveGitExecutable(root); assert.ok(executable);
  const git = (...args: string[]) => {
    const result = spawnSync(executable, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-C', root, ...args], { windowsHide: true, encoding: 'utf8' });
    assert.equal(result.status, 0, `Fixture Git failed: ${args[0]}`); return result.stdout.trim();
  };
  git('init', '-b', 'main'); git('config', 'core.autocrlf', 'false');
  let userId = 'git-account'; let allowed = true; let currentRoot = root; let remoteUrl = 'https://github.com/fixture/project';
  let beforeAuthorize: (() => Promise<void>) | undefined;
  const binding = async () => ({ projectId, repositoryId, deviceId: projectId, rootPath: currentRoot, label: 'Fixture', updatedAt: new Date().toISOString() });
  const workspace = new DesktopWorkspace({ auth: { getState: async () => authState(userId), authorizeRepository: async () => allowed ? { userId } : { ok: false, code: 'forbidden', message: 'Denied.' } }, bindings: { get: binding }, openExternal: async () => undefined });
  const service = new DesktopGit({ authorize: async () => { await beforeAuthorize?.(); return allowed ? { userId, remoteUrl } : null; }, credential: async () => null, bindings: { get: binding }, workspace });
  service.nexusStateChanged(authState(userId)); workspace.nexusStateChanged(authState(userId));
  const request = (operation: GitRequest['operation'], extra: object = {}) => service.request({ operation, projectId, repositoryId, ...extra } as GitRequest);
  return { root, directory, git, service, request,
    write: (name: string, body: string) => writeFile(path.join(root, name), body),
    seed: async () => { await writeFile(path.join(root, 'source.txt'), 'baseline\n'); git('add', '.'); git('commit', '-m', 'Initial fixture'); },
    commit: (snapshot: ReturnType<typeof success>, extra: object = {}) => request('commit', { snapshotId: snapshot.snapshotId, fileIds: snapshot.changes.map(file => file.id), authorName: 'Explicit Author', authorEmail: 'author@example.invalid', message: 'Selected changes', ...extra }),
    setAllowed: (value: boolean) => { allowed = value; },
    setAccount: (value: string) => { userId = value; service.nexusStateChanged(authState(userId)); workspace.nexusStateChanged(authState(userId)); },
    setRoot: (value: string) => { currentRoot = value; },
    setRemote: (value: string) => { remoteUrl = value; },
    onAuthorize: (value: (() => Promise<void>) | undefined) => { beforeAuthorize = value; },
    close: () => rm(directory, { recursive: true, force: true }) };
}

test('real snapshot and explicit selective commit preserve unselected files and index coherence without invoking hooks', async () => {
  const state = await fixture();
  try {
    await state.seed(); await state.write('source.txt', 'selected\n'); await state.write('other.txt', 'unselected\n');
    const hook = path.join(state.root, '.git', 'hooks', 'pre-commit');
    await writeFile(hook, '#!/bin/sh\nexit 1\n', { mode: 0o700 });
    const before = success(await state.request('snapshot'));
    assert.equal(before.branch, 'main'); assert.equal(before.dirty, true); assert.equal(before.commits[0]?.title, 'Initial fixture');
    assert.equal(JSON.stringify(before).includes(state.root), false);
    const source = before.changes.find(file => file.path === 'source.txt')!;
    const after = success(await state.commit(before, { fileIds: [source.id] }));
    assert.notEqual(after.head, before.head); assert.equal(after.staged, false); assert.equal(after.dirty, true);
    assert.deepEqual(after.changes.map(file => file.path), ['other.txt']);
    assert.equal(state.git('show', 'HEAD:source.txt'), 'selected');
    assert.equal(state.git('log', '-1', '--format=%an <%ae>'), 'Explicit Author <author@example.invalid>');
    assert.equal(state.git('diff', '--cached', '--name-only'), '');
  } finally { await state.close(); }
});

test('unborn repositories commit selected safe text, preserve excluded secrets and support explicit branch create/switch', async () => {
  const state = await fixture();
  try {
    await state.write('source.txt', 'new\n'); await state.write('.env', 'NEVER_SHARE=this-value\n');
    const before = success(await state.request('snapshot'));
    assert.equal(before.head, null); assert.deepEqual(before.changes.map(file => file.path), ['source.txt']);
    const after = success(await state.commit(before));
    assert.equal(state.git('ls-tree', '--name-only', 'HEAD'), 'source.txt');
    assert.equal(after.dirty, true, 'Untracked excluded files still make the whole repository dirty.');
    const rejected = await state.request('switchBranch', { snapshotId: after.snapshotId, branch: 'main' });
    assert.equal(rejected.ok, false);
    await rm(path.join(state.root, '.env'));
    const clean = success(await state.request('snapshot'));
    const created = success(await state.request('createBranch', { snapshotId: clean.snapshotId, branch: 'feature/work' }));
    assert.equal(created.branch, 'main'); assert.ok(created.branches.includes('feature/work'));
    const switched = success(await state.request('switchBranch', { snapshotId: created.snapshotId, branch: 'feature/work' }));
    assert.equal(switched.branch, 'feature/work');
  } finally { await state.close(); }
});

test('changed content and stale opaque IDs cannot commit an unseen revision', async () => {
  const state = await fixture();
  try {
    await state.seed(); await state.write('source.txt', 'preview\n');
    const before = success(await state.request('snapshot'));
    await state.write('source.txt', 'unseen\n');
    const rejected = await state.commit(before); assert.equal(rejected.ok, false); if (!rejected.ok) assert.equal(rejected.code, 'conflict');
    assert.equal(state.git('show', 'HEAD:source.txt'), 'baseline');
    const fresh = success(await state.request('snapshot'));
    const staleIds = await state.commit(fresh, { fileIds: before.changes.map(file => file.id) }); assert.equal(staleIds.ok, false);
    const invalid = await state.request('commit', { snapshotId: fresh.snapshotId, fileIds: [fresh.changes[0]!.id], message: 'x', authorName: 'bad\nname', authorEmail: 'fixture@example.invalid' }); assert.equal(invalid.ok, false);
  } finally { await state.close(); }
});

test('staged work is never overwritten and unresolved merge conflicts are visible and block writes', async () => {
  const state = await fixture();
  try {
    await state.seed(); await state.write('source.txt', 'staged\n'); state.git('add', 'source.txt'); await state.write('source.txt', 'working\n');
    const indexBefore = await readFile(path.join(state.root, '.git', 'index'));
    const before = success(await state.request('snapshot')); assert.equal(before.staged, true);
    assert.equal((await state.commit(before)).ok, false);
    assert.deepEqual(await readFile(path.join(state.root, '.git', 'index')), indexBefore);
    state.git('reset', '--hard', 'HEAD');
    const base = state.git('rev-parse', 'HEAD:source.txt');
    const conflict = spawnSync('git', ['-C', state.root, 'update-index', '--index-info'], { input: `0 ${'0'.repeat(40)}\tsource.txt\n100644 ${base} 1\tsource.txt\n100644 ${base} 2\tsource.txt\n100644 ${base} 3\tsource.txt\n`, windowsHide: true });
    assert.equal(conflict.status, 0);
    const conflicted = success(await state.request('snapshot')); assert.deepEqual(conflicted.conflicts, ['source.txt']);
    assert.equal((await state.request('createBranch', { snapshotId: conflicted.snapshotId, branch: 'blocked' })).ok, false);
  } finally { await state.close(); }
});

test('selected deletions produce actual Git deletions without touching other working changes', async () => {
  const state = await fixture();
  try {
    await state.seed(); await rm(path.join(state.root, 'source.txt')); await state.write('retain.txt', 'retain\n');
    const before = success(await state.request('snapshot'));
    success(await state.commit(before, { fileIds: [before.changes.find(file => file.kind === 'delete')!.id] }));
    assert.equal(state.git('ls-tree', '--name-only', 'HEAD'), ''); assert.equal(await readFile(path.join(state.root, 'retain.txt'), 'utf8'), 'retain\n');
  } finally { await state.close(); }
});

test('config includes, clean filters, hostile remote helpers and object alternates are rejected before Git execution', async () => {
  const state = await fixture();
  try {
    await state.seed(); const configPath = path.join(state.root, '.git', 'config'); const config = await readFile(configPath);
    for (const unsafe of ['[include]\npath = ../malicious\n', '[filter "evil"]\nclean = execute-evil\n', '[url "ext::evil"]\ninsteadOf = https://github.com/\n', '[core]\nfsmonitor = execute-evil\n']) {
      await writeFile(configPath, config); await appendFile(configPath, `\n${unsafe}`);
      const rejected = await state.request('snapshot'); assert.equal(rejected.ok, false); if (!rejected.ok) assert.equal(rejected.code, 'invalid_request');
    }
    await writeFile(configPath, config); await writeFile(path.join(state.root, '.git', 'objects', 'info', 'alternates'), '../../outside\n');
    assert.equal((await state.request('snapshot')).ok, false);
  } finally { await state.close(); }
});

test('GitHub synchronization uses only server metadata and requires explicit connection; no ambient credentials', async () => {
  const state = await fixture();
  try {
    await state.seed(); state.git('remote', 'add', 'origin', 'ext::malicious-helper');
    const before = success(await state.request('snapshot'));
    const response = await state.request('fetch', { snapshotId: before.snapshotId }); assert.equal(response.ok, false); if (!response.ok) assert.equal(response.code, 'not_connected');
    for (const url of ['https://github.com.evil.test/owner/repo', 'https://user:secret@github.com/owner/repo', 'https://github.com/owner/repo?token=private', 'file:///repository', 'https://github.com/owner/../repo']) assert.throws(() => githubRemote(url));
    assert.equal(githubRemote('https://github.com/owner/repo.git'), 'https://github.com/owner/repo.git');
    state.setRemote('https://evil.test/owner/repo');
    const malicious = success(await state.request('snapshot'));
    const rejected = await state.request('push', { snapshotId: malicious.snapshotId }); assert.equal(rejected.ok, false); if (!rejected.ok) assert.equal(rejected.code, 'invalid_request');
  } finally { await state.close(); }
});

test('account changes, revoked access and changed local bindings invalidate queued and reviewed actions', async () => {
  const state = await fixture();
  try {
    await state.seed(); await state.write('source.txt', 'changed\n'); const before = success(await state.request('snapshot'));
    state.setAccount('other-account'); assert.equal((await state.commit(before)).ok, false);
    state.setAllowed(false); const denied = await state.request('snapshot'); assert.equal(denied.ok, false); if (!denied.ok) assert.equal(denied.code, 'forbidden');
    state.setAllowed(true); const fresh = success(await state.request('snapshot'));
    const nested = path.join(state.root, 'nested'); await mkdir(nested); state.setRoot(nested);
    assert.equal((await state.commit(fresh)).ok, false);
    state.setRoot(state.root);
    let calls = 0;
    state.onAuthorize(async () => { if (++calls === 2) state.setAccount('changed-during-read'); });
    const changed = await state.request('snapshot'); assert.equal(changed.ok, false);
    assert.equal(state.git('show', 'HEAD:source.txt'), 'baseline');
  } finally { await state.close(); }
});

test('sparse index entries, executable attributes, pending locks and changed repository metadata cannot bypass the preview', async () => {
  const state = await fixture();
  try {
    await state.seed();
    state.git('update-index', '--skip-worktree', 'source.txt'); assert.equal((await state.request('snapshot')).ok, false);
    state.git('update-index', '--no-skip-worktree', 'source.txt');
    await state.write('.gitattributes', 'source.txt filter=malicious\n'); assert.equal((await state.request('snapshot')).ok, false);
    await rm(path.join(state.root, '.gitattributes')); await state.write('source.txt', 'reviewed\n');
    const before = success(await state.request('snapshot')); state.setRemote('https://github.com/fixture/different');
    const moved = await state.commit(before); assert.equal(moved.ok, false); if (!moved.ok) assert.equal(moved.code, 'conflict');
    const fresh = success(await state.request('snapshot')); const lock = path.join(state.root, '.git', 'index.lock');
    await writeFile(lock, 'other-process'); const rejected = await state.commit(fresh); assert.equal(rejected.ok, false);
    assert.equal(await readFile(lock, 'utf8'), 'other-process'); assert.equal(state.git('show', 'HEAD:source.txt'), 'baseline');
  } finally { await state.close(); }
});

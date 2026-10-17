import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { NexusAuthState, WorkspaceRequest, WorkspaceResponse } from '@nexus-ai/contracts';
import { DesktopWorkspace, validatedPreview } from '../src/workspace.ts';
import { resolveGitExecutable } from '../src/context-git.ts';
import { unifiedDiff } from '../src/workspace-diff.ts';

const projectId = 'd309dd11-6d7e-4bc1-bd49-292bc50c2f74';
const repositoryId = '02f71f6e-69b1-49b7-b6d8-df89167070b9';
const otherRepository = '9b5bbbc2-e8c6-4cac-a46a-b358bb44ed71';
const account = (id = 'account-a'): NexusAuthState => ({ status: 'signed_in', user: { id, name: 'Workspace test', email: 'test@example.invalid', emailVerified: true, image: null },
  expiresAt: '2099-01-01T00:00:00.000Z', persistent: true, message: null });
function success(response: WorkspaceResponse) {
  assert.equal(response.ok, true, response.ok ? '' : response.message);
  if (!response.ok) throw new Error('Expected workspace snapshot.');
  return response.snapshot;
}
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nexus-workspace-'));
  const root = path.join(directory, 'repo'); await mkdir(root);
  const executable = await resolveGitExecutable(root);
  assert.ok(executable, 'Native Git is needed for workspace fixtures.');
  const git = (...args: string[]) => {
    const result = spawnSync(executable, ['-c', 'user.name=Nexus Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-C', root, ...args], { windowsHide: true, encoding: 'utf8' });
    assert.equal(result.status, 0, `Git fixture failed: ${args[0]}`);
    return result.stdout;
  };
  git('init'); git('config', 'core.autocrlf', 'false');
  let currentRoot = root; let currentAccount = account(); let allowed = true;
  const opened: string[] = [];
  let beforeAuthorize: (() => Promise<void>) | undefined;
  let openFailure = false;
  const service = new DesktopWorkspace({
    auth: { getState: async () => currentAccount, authorizeRepository: async () => { await beforeAuthorize?.(); return allowed ? { userId: currentAccount.user!.id } : { ok: false, code: 'forbidden', message: 'Denied.' }; } },
    bindings: { get: async (userId, project, repository) => ({ projectId: project, repositoryId: repository, deviceId: projectId, rootPath: currentRoot, label: userId, updatedAt: '2026-10-17T00:00:00.000Z' }) },
    openExternal: async url => { if (openFailure) throw new Error('OS handler unavailable.'); opened.push(url); },
  });
  service.nexusStateChanged(currentAccount);
  return { directory, root, git, opened, service,
    request: (operation: WorkspaceRequest['operation'], extra: object = {}) => service.request({ operation, projectId, repositoryId, ...extra } as WorkspaceRequest),
    setRoot: (value: string) => { currentRoot = value; }, setAllowed: (value: boolean) => { allowed = value; },
    setAccount: (id: string) => { currentAccount = account(id); service.nexusStateChanged(currentAccount); },
    onAuthorize: (fn: (() => Promise<void>) | undefined) => { beforeAuthorize = fn; },
    failOpens: () => { openFailure = true; },
    close: () => rm(directory, { recursive: true, force: true }) };
}

test('real Git HEAD to working tree includes staged, unstaged, deleted and untracked files with bounded real diffs', async () => {
  const state = await fixture();
  try {
    await writeFile(path.join(state.root, 'source.ts'), 'line one\nline two\nline three\n');
    await writeFile(path.join(state.root, 'removed.txt'), 'deleted content\n');
    state.git('add', '.'); state.git('commit', '-m', 'fixture');
    await writeFile(path.join(state.root, 'source.ts'), 'line one\nstaged value\nline three\n'); state.git('add', 'source.ts');
    await writeFile(path.join(state.root, 'source.ts'), 'line one\nworking value\nline three\n');
    await rm(path.join(state.root, 'removed.txt'));
    await writeFile(path.join(state.root, 'new file #%.txt'), 'untracked content\n');
    const snapshot = success(await state.request('getChanges'));
    assert.equal(snapshot.isGit, true); assert.equal(snapshot.files.length, 3);
    const source = snapshot.files.find(file => file.path === 'source.ts')!;
    assert.equal(source.kind, 'update'); assert.equal(source.additions, 1); assert.equal(source.deletions, 1);
    assert.match(source.diff, /-line two\n\+working value/); assert.equal(source.diff.includes('staged value'), false);
    assert.equal(snapshot.files.find(file => file.path === 'removed.txt')!.kind, 'delete');
    const added = snapshot.files.find(file => file.kind === 'add')!;
    assert.equal(JSON.stringify(snapshot).includes(state.root), false);
    success(await state.request('openEditor', { fileId: added.id }));
    assert.match(state.opened[0]!, /^vscode:\/\/file\//); assert.match(state.opened[0]!, /new%20file%20%23%25\.txt$/);
    assert.equal((await state.request('openEditor', { fileId: snapshot.files.find(file => file.kind === 'delete')!.id })).ok, false);
    await state.request('getChanges'); assert.equal((await state.request('openEditor', { fileId: source.id })).ok, false, 'Old snapshot UUID is invalid.');
    assert.equal((await state.request('openEditor', { fileId: projectId, path: '../../outside' })).ok, false);
    success(await state.request('openEditor', { fileId: null })); assert.match(state.opened.at(-1)!, /\/$/);
  } finally { await state.close(); }
});

test('unborn repositories expose actual UTF-8 additions while secrets, binary, oversized files and private keys remain excluded', async () => {
  const state = await fixture();
  try {
    await writeFile(path.join(state.root, 'normal.txt'), 'real addition\n');
    await writeFile(path.join(state.root, '.env'), 'do-not-expose=private');
    await writeFile(path.join(state.root, 'credentials.json'), 'private credentials');
    await writeFile(path.join(state.root, 'binary.txt'), Buffer.from('binary\0payload'));
    await writeFile(path.join(state.root, 'invalid.txt'), Buffer.from([0xc3, 0x28]));
    await writeFile(path.join(state.root, 'large.txt'), Buffer.alloc(65537, 'a'));
    await writeFile(path.join(state.root, 'key.txt'), '-----BEGIN OPENSSH PRIVATE KEY-----\nprivate');
    const snapshot = success(await state.request('getChanges'));
    assert.deepEqual(snapshot.files.map(file => file.path), ['normal.txt']);
    assert.equal(snapshot.files[0]?.kind, 'add'); assert.match(snapshot.files[0]!.diff, /\+real addition/);
    assert.equal(JSON.stringify(snapshot).includes('do-not-expose'), false);
  } finally { await state.close(); }
});

test('Git review never runs malicious clean filters, textconv, external diff, hooks or fsmonitor', async () => {
  const state = await fixture();
  try {
    await writeFile(path.join(state.root, 'source.txt'), 'baseline\n'); state.git('add', '.'); state.git('commit', '-m', 'fixture');
    const marker = path.join(state.directory, 'command-ran');
    const command = `echo EXECUTED > "${marker.replaceAll('\\', '/')}"`;
    state.git('config', 'core.fsmonitor', command);
    state.git('config', 'diff.external', command);
    state.git('config', 'diff.hostile.textconv', command);
    state.git('config', 'filter.hostile.clean', command);
    state.git('config', 'filter.hostile.smudge', command);
    await writeFile(path.join(state.root, '.gitattributes'), '*.txt filter=hostile diff=hostile\n');
    await writeFile(path.join(state.root, 'source.txt'), 'changed\n');
    const snapshot = success(await state.request('getChanges'));
    assert.match(snapshot.files.find(file => file.path === 'source.txt')!.diff, /\+changed/);
    await assert.rejects(() => readFile(marker));
  } finally { await state.close(); }
});

test('scope, technical role, rebind and account changes invalidate IDs and prevent OS side effects', async () => {
  const state = await fixture();
  try {
    await writeFile(path.join(state.root, 'source.txt'), 'original\n');
    const item = success(await state.request('getChanges')).files[0]!;
    assert.equal((await state.request('openEditor', { repositoryId: otherRepository, fileId: item.id })).ok, false);
    state.setAllowed(false); assert.equal((await state.request('openEditor', { fileId: item.id })).ok, false); state.setAllowed(true);
    const moved = path.join(state.directory, 'other'); await mkdir(moved); state.setRoot(moved);
    assert.equal((await state.request('openEditor', { fileId: item.id })).ok, false); state.setRoot(state.root);
    state.setAccount('account-b'); assert.equal((await state.request('openEditor', { fileId: item.id })).ok, false);
    assert.equal(state.opened.length, 0);
    let release: () => void = () => undefined;
    let entered: () => void = () => undefined;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const releasedPromise = new Promise<void>(resolve => { release = resolve; });
    state.onAuthorize(async () => { entered(); await releasedPromise; });
    const pending = state.request('openEditor', { fileId: null }); await enteredPromise;
    const queued = state.request('openEditor', { fileId: null }); state.setAccount('account-c'); release();
    assert.equal((await pending).ok, false); assert.equal((await queued).ok, false); assert.equal(state.opened.length, 0);
  } finally { await state.close(); }
});

test('nested bindings cannot expose parent changes; symlink and junction paths never enter snapshots or editor opens', async context => {
  const state = await fixture();
  try {
    const nested = path.join(state.root, 'nested'); await mkdir(nested); state.setRoot(nested);
    const response = await state.request('getChanges'); assert.equal(response.ok, false); state.setRoot(state.root);
    const outside = path.join(state.directory, 'outside'); await mkdir(outside); await writeFile(path.join(outside, 'source.txt'), 'outside');
    try { await symlink(outside, path.join(state.root, 'link'), process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') { context.skip('OS denies symlink creation.'); return; } throw error; }
    const snapshot = success(await state.request('getChanges'));
    assert.equal(snapshot.files.some(file => file.path.startsWith('link/')), false);
    await rm(path.join(state.root, 'link'), { recursive: true, force: true });
    await mkdir(path.join(state.root, 'link')); await writeFile(path.join(state.root, 'link', 'source.txt'), 'inside\n');
    const before = success(await state.request('getChanges')); const file = before.files.find(item => item.path === 'link/source.txt')!;
    await rm(path.join(state.root, 'link'), { recursive: true });
    await symlink(outside, path.join(state.root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal((await state.request('openEditor', { fileId: file.id })).ok, false); assert.equal(state.opened.length, 0);
  } finally { await state.close(); }
});

test('preview URLs require explicit safe schemes and local HTTP; credentials and command schemes never reach OS', async () => {
  for (const url of ['javascript:alert(1)', 'file:///tmp/file', 'vscode://command/x', 'http://example.com', 'http://localhost.evil', 'https://user:password@example.com', 'https://example.com\n', 'http://localhost:99999', 'http://127.1:3000', 'http://0x7f000001:3000']) {
    assert.throws(() => validatedPreview(url), url);
  }
  const state = await fixture();
  try {
    assert.equal((await state.request('openPreview')).ok, false);
    success(await state.request('setPreview', { url: 'http://127.0.0.1:5173/preview?view=1#section' })); assert.equal(state.opened.length, 0);
    success(await state.request('openPreview')); assert.equal(state.opened[0], 'http://127.0.0.1:5173/preview?view=1#section');
    assert.equal((await state.request('setPreview', { url: 'https://user:password@example.com' })).ok, false);
    assert.equal(success(await state.request('getChanges')).previewUrl, 'http://127.0.0.1:5173/preview?view=1#section');
    assert.equal(success(await state.request('getChanges', { repositoryId: otherRepository })).previewUrl, null);
    state.setAccount('account-b'); assert.equal((await state.request('openPreview')).ok, false);
    success(await state.request('setPreview', { url: 'https://example.com/' })); state.failOpens();
    const failure = await state.request('openPreview'); assert.equal(failure.ok, false); if (!failure.ok) assert.equal(failure.code, 'unavailable');
    assert.equal(validatedPreview('http://[::1]:3000'), 'http://[::1]:3000/');
    success(await state.request('setPreview', { url: null })); assert.equal((await state.request('openPreview')).ok, false);
  } finally { await state.close(); }
});

test('diff line accounting, no-final-newline and byte truncation are bounded without invented test results', () => {
  const diff = unifiedDiff('real file.ts', 'a\nb\nc\n', 'a\nactual\nc\n', 'update');
  assert.equal(diff.additions, 1); assert.equal(diff.deletions, 1); assert.match(diff.diff, /@@ -1,3 \+1,3 @@/);
  assert.match(unifiedDiff('file', '', 'actual', 'add').diff, /No newline at end of file/);
  const bounded = unifiedDiff('file', 'a'.repeat(60000), 'b'.repeat(60000), 'update');
  assert.equal(bounded.truncated, true); assert.ok(Buffer.byteLength(bounded.diff) <= 65536);
});

test('file count and total emitted diff byte budgets remain bounded', async () => {
  const state = await fixture();
  try {
    for (let index = 0; index < 55; index++) await writeFile(path.join(state.root, `source-${index}.txt`), 'real\n');
    const snapshot = success(await state.request('getChanges'));
    assert.equal(snapshot.files.length, 50); assert.equal(snapshot.truncated, true);
    assert.ok(snapshot.files.reduce((sum, file) => sum + Buffer.byteLength(file.diff), 0) <= 262144);
  } finally { await state.close(); }
});

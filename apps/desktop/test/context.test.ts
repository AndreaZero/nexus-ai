import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type { ContextRequest, ContextResponse, NexusAuthState } from '@nexus-ai/contracts';
import { DesktopContext } from '../src/context.ts';
import { observeRepository, resolveGitExecutable } from '../src/context-git.ts';

const projectId = 'd309dd11-6d7e-4bc1-bd49-292bc50c2f74';
const repositoryId = '02f71f6e-69b1-49b7-b6d8-df89167070b9';
const otherRepository = '9b5bbbc2-e8c6-4cac-a46a-b358bb44ed71';
const account = (id = 'account-a'): NexusAuthState => ({ status: 'signed_in', user: { id, name: 'Context test', email: 'test@example.invalid', emailVerified: true, image: null },
  expiresAt: '2099-01-01T00:00:00.000Z', persistent: true, message: null });
function success(response: ContextResponse) {
  assert.equal(response.ok, true);
  if (!response.ok) throw new Error('Expected local context.');
  return response;
}
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nexus-context-'));
  const root = path.join(directory, 'repo');
  await mkdir(root);
  let currentRoot = root;
  let currentAccount = account();
  let allowed = true;
  let selection: string[] = [];
  let onPick: (() => void) | undefined;
  let onRead: (() => Promise<void>) | undefined;
  let authorizations = 0;
  const storage = new Map<string, string>();
  const service = new DesktopContext({ userData: directory,
    auth: { getState: async () => currentAccount, authorizeRepository: async () => { authorizations++; return allowed ? { userId: currentAccount.user!.id } : { ok: false, code: 'forbidden', message: 'Denied.' }; } },
    bindings: { get: async (userId, project, repository) => ({ projectId: project, repositoryId: repository, deviceId: projectId, rootPath: currentRoot, label: userId, updatedAt: '2026-10-17T00:00:00.000Z' }) },
    pickFiles: async () => { onPick?.(); return selection; },
    storage: { getItem: async key => { await onRead?.(); return storage.get(key) ?? null; }, setItem: async (key, value) => { storage.set(key, value); } },
  });
  service.nexusStateChanged(currentAccount);
  const request = (operation: ContextRequest['operation'], extra: Record<string, unknown> = {}) => service.request({ operation, projectId, repositoryId, ...extra } as ContextRequest);
  return { directory, root, storage, service, request, pick: (files: string[]) => { selection = files; },
    setAccount: (id: string) => { currentAccount = account(id); service.nexusStateChanged(currentAccount); }, setAllowed: (value: boolean) => { allowed = value; },
    setRoot: (value: string) => { currentRoot = value; }, onPick: (callback: () => void) => { onPick = callback; }, onRead: (callback: () => Promise<void>) => { onRead = callback; },
    authorizationCount: () => authorizations,
    close: () => rm(directory, { recursive: true, force: true }) };
}

test('selected text requires native paths, keeps opaque IDs and reveals content only on explicit preview/send', async () => {
  const fixtureState = await fixture();
  try {
    const file = path.join(fixtureState.root, 'README.md');
    const content = '# Actual local text\nA private project snapshot.';
    await writeFile(file, content);
    fixtureState.pick([file]);
    const selected = success(await fixtureState.request('pickFiles'));
    assert.equal(selected.context.files.length, 1);
    assert.equal(selected.context.files[0]?.path, 'README.md');
    assert.equal(selected.preview, null);
    assert.equal(JSON.stringify(selected).includes(content), false);
    assert.equal(JSON.stringify(selected).includes(fixtureState.root), false);
    const id = selected.context.files[0]!.id;
    assert.equal(success(await fixtureState.request('readFile', { fileId: id })).preview?.text, content);
    assert.deepEqual(await fixtureState.service.resolveForSend('account-a', projectId, repositoryId, await realpath(fixtureState.root), [id]), [{ name: 'README.md', text: content }]);
    assert.equal([...fixtureState.storage.values()].join().includes(content), false);
    assert.equal((await fixtureState.service.request({ operation: 'get', projectId, repositoryId, rootPath: 'arbitrary' } as ContextRequest)).ok, false);
    await fixtureState.request('removeFile', { fileId: id });
    assert.equal(success(await fixtureState.request('get')).context.files.length, 0);
    await assert.rejects(() => fixtureState.service.resolveForSend('account-a', projectId, repositoryId, fixtureState.root, [id]));
  } finally { await fixtureState.close(); }
});

test('context rejects secrets, binary/invalid UTF-8, oversized and out-of-root native selections', async () => {
  const state = await fixture();
  try {
    await mkdir(path.join(state.root, 'node_modules')); await mkdir(path.join(state.root, 'secrets'));
    const blocked = ['.env', '.env.local', 'env.production', 'auth.json', 'credentials.json', '.npmrc', 'private.key', 'node_modules/package.js', 'secrets/data.txt'];
    for (const name of blocked) {
      const filename = path.join(state.root, name); await writeFile(filename, 'secret'); state.pick([filename]);
      assert.equal((await state.request('pickFiles')).ok, false, name);
    }
    const contentFile = path.join(state.root, 'source.txt');
    for (const content of [Buffer.from([0xC3, 0x28]), Buffer.from('hello\0binary'), Buffer.alloc(65537, 'a'), Buffer.from('-----BEGIN OPENSSH PRIVATE KEY-----\nsecret')]) {
      await writeFile(contentFile, content); state.pick([contentFile]); assert.equal((await state.request('pickFiles')).ok, false);
    }
    const outside = path.join(state.directory, 'outside.txt'); await writeFile(outside, 'outside'); state.pick([outside]);
    assert.equal((await state.request('pickFiles')).ok, false);
    assert.equal(state.storage.size, 0);
    const source = path.join(state.root, 'auth.ts'); await writeFile(source, 'export function authorize() { return true; }'); state.pick([source]);
    assert.equal(success(await state.request('pickFiles')).context.files[0]?.path, 'auth.ts');
  } finally { await state.close(); }
});

test('text byte budgets and file-count limits are enforced before selection persists', async () => {
  const state = await fixture();
  try {
    const names: string[] = [];
    for (let i = 0; i < 9; i++) { const name = path.join(state.root, `file-${i}.txt`); names.push(name); await writeFile(name, 'é'.repeat(32768)); }
    state.pick(names.slice(0, 5)); assert.equal((await state.request('pickFiles')).ok, false); assert.equal(state.storage.size, 0);
    state.pick(names.slice(0, 4)); assert.equal(success(await state.request('pickFiles')).context.files.reduce((sum, file) => sum + file.bytes, 0), 262144);
    state.pick(names.slice(0, 9)); assert.equal((await state.request('pickFiles')).ok, false);
    assert.equal(success(await state.request('get')).context.files.length, 4);
  } finally { await state.close(); }
});

test('draft and file selections isolate account, project/repository and canonical binding; changed files revalidate', async () => {
  const state = await fixture();
  try {
    const file = path.join(state.root, 'source.ts'); await writeFile(file, 'export const original = true;'); state.pick([file]);
    const selected = success(await state.request('pickFiles')); const id = selected.context.files[0]!.id;
    await state.request('saveDraft', { text: 'Saved draft before closing.' });
    assert.equal(success(await state.request('get')).context.draft, 'Saved draft before closing.');
    assert.equal(success(await state.request('get', { repositoryId: otherRepository })).context.draft, '');
    await assert.rejects(async () => state.service.resolveForSend('account-a', projectId, otherRepository, await realpath(state.root), [id]));
    state.setAccount('account-b'); assert.equal(success(await state.request('get')).context.files.length, 0); assert.equal(success(await state.request('get')).context.draft, '');
    state.setAccount('account-a'); assert.equal(success(await state.request('get')).context.files.length, 1);
    const moved = path.join(state.directory, 'moved'); await mkdir(moved); state.setRoot(moved);
    assert.equal(success(await state.request('get')).context.draft, '');
    state.setRoot(state.root); await writeFile(file, 'changed content');
    assert.equal(success(await state.request('readFile', { fileId: id })).preview?.text, 'changed content');
    await writeFile(file, Buffer.from('now\0binary'));
    await assert.rejects(async () => state.service.resolveForSend('account-a', projectId, repositoryId, await realpath(state.root), [id]));
    assert.equal(success(await state.request('get')).context.files.length, 0);
    state.setAllowed(false); assert.equal((await state.request('get')).ok, false);
  } finally { await state.close(); }
});

test('account and binding changes while native dialog is open cannot persist its selection', async () => {
  for (const change of ['account', 'binding'] as const) {
    const state = await fixture();
    try {
      const file = path.join(state.root, 'source.ts'); await writeFile(file, 'source'); state.pick([file]);
      const moved = path.join(state.directory, 'new-root'); await mkdir(moved);
      state.onPick(() => { if (change === 'account') state.setAccount('account-b'); else state.setRoot(moved); });
      assert.equal((await state.request('pickFiles')).ok, false); assert.equal(state.storage.size, 0);
    } finally { await state.close(); }
  }
});

test('draft queued under a previous account is rejected before encrypted storage mutation', async () => {
  const state = await fixture();
  let release: () => void = () => undefined;
  let entered: () => void = () => undefined;
  const enteredStorage = new Promise<void>(resolve => { entered = resolve; });
  const releasedStorage = new Promise<void>(resolve => { release = resolve; });
  try {
    state.onRead(async () => { entered(); await releasedStorage; });
    const first = state.request('get'); await enteredStorage;
    const draft = state.request('saveDraft', { text: 'Never write under the next account.' });
    state.setAccount('account-b'); release();
    assert.equal((await first).ok, false); assert.equal((await draft).ok, false); assert.equal(state.storage.size, 0);
  } finally { release(); await state.close(); }
});

test('a draft performs one authoritative role check and does not reread selected file contents', async () => {
  const state = await fixture();
  try {
    const file = path.join(state.root, 'source.ts'); await writeFile(file, 'export const before = true;'); state.pick([file]);
    const selected = success(await state.request('pickFiles'));
    await writeFile(file, 'now\0binary');
    const before = state.authorizationCount();
    const saved = success(await state.request('saveDraft', { text: 'Preserve the composer without flooding auth.' }));
    assert.equal(state.authorizationCount() - before, 1);
    assert.deepEqual(saved.context.files, selected.context.files);
    assert.equal(saved.context.repository.observedAt, selected.context.repository.observedAt);
    assert.equal(saved.context.draft, 'Preserve the composer without flooding auth.');
    assert.equal(success(await state.request('get')).context.files.length, 0);
  } finally { await state.close(); }
});

test('directory symlinks/junctions cannot carry an outside file or secret target into context', async context => {
  const state = await fixture();
  try {
    const outside = path.join(state.directory, 'outside'); await mkdir(outside); await writeFile(path.join(outside, 'source.ts'), 'outside');
    try { await symlink(outside, path.join(state.root, 'link'), process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') { context.skip('OS denies symlink creation without privileges.'); return; } throw error; }
    state.pick([path.join(state.root, 'link', 'source.ts')]); assert.equal((await state.request('pickFiles')).ok, false);
    assert.equal(state.storage.size, 0);
  } finally { await state.close(); }
});

test('Git observations are actual local metadata and never invoke configured fsmonitor', async context => {
  const state = await fixture();
  try {
    assert.equal((await observeRepository(state.root)).isGit, false);
    if (spawnSync('git', ['--version'], { windowsHide: true }).status !== 0) { context.skip('Git is unavailable on this build host.'); return; }
    assert.equal(spawnSync('git', ['init', state.root], { windowsHide: true }).status, 0);
    const marker = path.join(state.directory, 'fsmonitor-ran');
    assert.equal(spawnSync('git', ['-C', state.root, 'config', 'core.fsmonitor', `echo ran > ${marker}`], { windowsHide: true }).status, 0);
    await writeFile(path.join(state.root, 'README.md'), '# Existing file');
    const observation = await observeRepository(state.root);
    assert.equal(observation.isGit, true); assert.equal(observation.dirty, true); assert.equal(observation.head, null); assert.equal(observation.ahead, null); assert.equal(observation.behind, null);
    await assert.rejects(() => readFile(marker));
  } finally { await state.close(); }
});

test('Git resolver ignores empty/relative PATH entries and repository-owned executables', async () => {
  const state = await fixture();
  try {
    const filename = path.join(state.root, process.platform === 'win32' ? 'git.exe' : 'git');
    await writeFile(filename, 'Never execute this repository-owned file.', { mode: 0o755 });
    assert.equal(await resolveGitExecutable(state.root, ['', '.', 'relative', state.root].join(path.delimiter)), null);
    const resolved = await resolveGitExecutable(state.root);
    if (resolved) assert.equal(path.relative(state.root, resolved).startsWith('..') || path.isAbsolute(path.relative(state.root, resolved)), true);
  } finally { await state.close(); }
});

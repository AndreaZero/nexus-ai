import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { LocalBindingRequest } from '@nexus-ai/contracts';
import { LocalBindingService, LocalBindingStorage } from '../src/local-bindings.ts';

const projectId = 'd309dd11-6d7e-4bc1-bd49-292bc50c2f74';
const repositoryId = '02f71f6e-69b1-49b7-b6d8-df89167070b9';
const request = (operation: LocalBindingRequest['operation']): LocalBindingRequest => ({ operation, projectId, repositoryId });

test('atomic local binding records persist a device UUID and isolate accounts with concurrent writes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nexus-bindings-'));
  const filename = path.join(directory, 'bindings.json');
  try {
    const storage = new LocalBindingStorage(filename);
    assert.equal(await storage.get('a', projectId, repositoryId), null);
    const [first, second] = await Promise.all([
      storage.set('a', projectId, repositoryId, path.join(directory, 'project-a')),
      storage.set('b', projectId, repositoryId, path.join(directory, 'project-b')),
    ]);
    assert.equal(first.deviceId, second.deviceId);
    const restarted = new LocalBindingStorage(filename);
    assert.deepEqual(await restarted.get('a', projectId, repositoryId), first);
    assert.deepEqual(await restarted.get('b', projectId, repositoryId), second);
    assert.equal(await restarted.get('stranger', projectId, repositoryId), null);
    assert.equal(await restarted.get('a', repositoryId, projectId), null);
    await restarted.remove('a', projectId, repositoryId);
    assert.equal(await restarted.get('a', projectId, repositoryId), null);
    assert.deepEqual(await restarted.get('b', projectId, repositoryId), second);
    assert.deepEqual(await readdir(directory), ['bindings.json']);
    await writeFile(filename, '{invalid');
    await assert.rejects(() => restarted.get('b', projectId, repositoryId), /cannot be read/);
    await assert.rejects(() => restarted.set('b', projectId, repositoryId, directory), /cannot be read/);
    assert.equal(await readFile(filename, 'utf8'), '{invalid');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('directory selection rechecks role and account after the native dialog; cancellation does not mutate', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nexus-bindings-'));
  const filename = path.join(directory, 'bindings.json');
  try {
    const storage = new LocalBindingStorage(filename);
    const original = await storage.set('a', projectId, repositoryId, path.join(directory, 'original'));
    const before = await readFile(filename, 'utf8');
    let account = 'a';
    let forbidden = false;
    let calls = 0;
    const authorize = async (project: string, repository: string) => {
      calls++;
      assert.equal(project, projectId); assert.equal(repository, repositoryId);
      return forbidden ? { ok: false, code: 'forbidden', message: 'Access revoked.' } as const : { userId: account };
    };
    const cancel = new LocalBindingService(storage, authorize, async () => null);
    assert.deepEqual(await cancel.request(request('select')), { ok: true, binding: original });
    assert.equal(calls, 2);
    assert.equal(await readFile(filename, 'utf8'), before);
    const changedAccount = new LocalBindingService(storage, authorize, async () => { account = 'b'; return directory; });
    const changed = await changedAccount.request(request('select'));
    assert.equal(changed.ok, false);
    if (!changed.ok) assert.equal(changed.code, 'auth_required');
    assert.equal(await readFile(filename, 'utf8'), before);
    account = 'a';
    const revoked = new LocalBindingService(storage, authorize, async () => { forbidden = true; return directory; });
    const denied = await revoked.request(request('select'));
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, 'forbidden');
    for (const operation of ['get', 'remove', 'select'] as const) assert.equal((await cancel.request(request(operation))).ok, false);
    assert.equal(await readFile(filename, 'utf8'), before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('binding boundary refuses renderer paths and only the authorized account receives a selection', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nexus-bindings-'));
  try {
    const storage = new LocalBindingStorage(path.join(directory, 'bindings.json'));
    let dialogs = 0;
    const service = new LocalBindingService(storage, async () => ({ userId: 'a' }), async () => { dialogs++; return directory; });
    assert.equal((await service.request({ ...request('select'), rootPath: directory } as LocalBindingRequest)).ok, false);
    assert.equal(dialogs, 0);
    const selected = await service.request(request('select'));
    assert.equal(selected.ok, true);
    if (selected.ok) assert.equal(selected.binding?.rootPath, directory);
    const other = new LocalBindingService(storage, async () => ({ userId: 'b' }), async () => directory);
    assert.deepEqual(await other.request(request('get')), { ok: true, binding: null });
    assert.deepEqual(await service.request(request('remove')), { ok: true, binding: null });
    assert.equal(await storage.get('a', projectId, repositoryId), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

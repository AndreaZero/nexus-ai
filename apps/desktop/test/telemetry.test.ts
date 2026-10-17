import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { NexusAuthState, TelemetryRequest, TelemetryResponse } from '@nexus-ai/contracts';
import { DesktopTelemetry } from '../src/telemetry.ts';

const projectId = 'd309dd11-6d7e-4bc1-bd49-292bc50c2f74';
const repositoryId = '02f71f6e-69b1-49b7-b6d8-df89167070b9';
const otherProject = '9b5bbbc2-e8c6-4cac-a46a-b358bb44ed71';
const account = (id = 'account-a'): NexusAuthState => ({ status: 'signed_in', user: { id, name: 'Telemetry QA', email: 'qa@example.invalid', emailVerified: true, image: null },
  expiresAt: '2099-01-01T00:00:00.000Z', persistent: true, message: null });
function success(response: TelemetryResponse) {
  assert.equal(response.ok, true);
  if (!response.ok) throw new Error('Expected local telemetry.');
  return response.state;
}
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nexus-telemetry-'));
  const roots = [path.join(directory, 'repo-a'), path.join(directory, 'repo-b')];
  await Promise.all(roots.map(root => mkdir(root)));
  let root = roots[0]!;
  let authState = account();
  let allowed = true;
  let authorizations = 0;
  let reads = 0;
  let clock = Date.parse('2026-10-17T00:00:00.000Z');
  let readDevice: (() => { cpu: { idle: number; total: number } | null; memoryTotalBytes: number; memoryFreeBytes: number }) | null = null;
  let onAuthorization: (() => Promise<void> | void) | null = null;
  const timers: { active: boolean; callback: () => Promise<void> }[] = [];
  const service = new DesktopTelemetry({
    auth: { getState: async () => authState, authorizeRepository: async () => {
      authorizations++; await onAuthorization?.();
      return allowed ? { userId: authState.user!.id } : { ok: false, code: 'forbidden', message: 'Denied.' };
    } },
    bindings: { get: async (_userId, project, repository) => ({ projectId: project, repositoryId: repository, deviceId: projectId,
      rootPath: root, label: 'QA repository', updatedAt: '2026-10-17T00:00:00.000Z' }) },
    now: () => clock,
    readDevice: () => {
      reads++;
      return readDevice ? readDevice() : { cpu: { idle: reads * 50, total: reads * 200 }, memoryTotalBytes: 1000, memoryFreeBytes: 400 };
    },
    schedule: (callback, intervalMs) => {
      assert.equal(intervalMs, 2000);
      const timer = { active: true, callback }; timers.push(timer);
      return () => { timer.active = false; };
    },
  });
  service.nexusStateChanged(authState);
  const request = (operation: TelemetryRequest['operation'] = 'getState', enabled = true, project = projectId): Promise<TelemetryResponse> => service.request(
    operation === 'setEnabled' ? { operation, projectId: project, repositoryId, enabled } : { operation, projectId: project, repositoryId });
  return { service, request, roots,
    tick: async () => { const timer = timers.find(item => item.active); assert.ok(timer, 'Expected a scheduled sample.'); timer.active = false; clock += 2000; await timer.callback(); },
    timerCount: () => timers.filter(timer => timer.active).length,
    authorizationCount: () => authorizations, readCount: () => reads,
    setRoot: (index: number) => { root = roots[index]!; }, setAllowed: (value: boolean) => { allowed = value; },
    setAccount: (state: NexusAuthState) => { authState = state; service.nexusStateChanged(state); },
    onAuthorization: (callback: (() => Promise<void> | void) | null) => { onAuthorization = callback; },
    setDevice: (callback: () => { cpu: { idle: number; total: number } | null; memoryTotalBytes: number; memoryFreeBytes: number }) => { readDevice = callback; },
    close: async () => { service.dispose(); await rm(directory, { recursive: true, force: true }); },
  };
}

test('device metrics are explicit, aggregate CPU deltas and local-only memory samples', async () => {
  const fixtureState = await fixture();
  try {
    const initial = success(await fixtureState.request());
    assert.equal(initial.enabled, false); assert.deepEqual(initial.samples, []); assert.equal(fixtureState.readCount(), 0); assert.equal(fixtureState.timerCount(), 0);
    const enabled = success(await fixtureState.request('setEnabled'));
    assert.equal(enabled.samples[0]?.cpuPercent, null); assert.equal(enabled.samples[0]?.memoryPercent, 60);
    assert.equal(enabled.samples[0]?.memoryUsedBytes, 600); assert.equal(enabled.samples[0]?.memoryTotalBytes, 1000);
    assert.equal(enabled.source, 'local_device'); assert.equal(enabled.networkBytesPerSecond, null); assert.match(enabled.notice!, /whole device/);
    const calls = fixtureState.authorizationCount();
    await fixtureState.tick();
    assert.equal(fixtureState.authorizationCount(), calls, 'Sampling must not poll server authorization.');
    const next = success(await fixtureState.request());
    assert.equal(next.samples.length, 2); assert.equal(next.samples[1]?.cpuPercent, 75);
    assert.equal(Date.parse(next.samples[1]!.at) - Date.parse(next.samples[0]!.at), 2000);
    assert.equal(JSON.stringify(next).includes(fixtureState.roots[0]!), false);
    const disabled = success(await fixtureState.request('setEnabled', false));
    assert.equal(disabled.enabled, false); assert.deepEqual(disabled.samples, []); assert.equal(fixtureState.timerCount(), 0);
  } finally { await fixtureState.close(); }
});

test('sampling retains at most 60 real samples and clears itself if overview stops refreshing authorization', async () => {
  const state = await fixture();
  try {
    await state.request('setEnabled');
    for (let index = 0; index < 65; index++) {
      if (index % 3 === 0) await state.request();
      await state.tick();
    }
    const bounded = success(await state.request());
    assert.equal(bounded.samples.length, 60); assert.equal(bounded.samples[0]?.cpuPercent, 75);
    const calls = state.authorizationCount();
    for (let index = 0; index < 5; index++) await state.tick();
    assert.equal(state.timerCount(), 0); assert.equal(state.authorizationCount(), calls);
    const inactive = success(await state.request());
    assert.equal(inactive.enabled, false); assert.equal(inactive.samples.length, 0); assert.match(inactive.notice!, /inactive/);
  } finally { await state.close(); }
});

test('role revocation and canonical binding changes stop sampling and require fresh explicit opt-in', async () => {
  const state = await fixture();
  try {
    await state.request('setEnabled'); state.setRoot(1);
    await state.tick(); assert.equal(state.timerCount(), 0);
    const rebound = success(await state.request());
    assert.equal(rebound.enabled, false); assert.equal(rebound.samples.length, 0);
    await state.request('setEnabled'); state.setAllowed(false);
    const denied = await state.request(); assert.equal(denied.ok, false);
    assert.equal(state.timerCount(), 0); state.setAllowed(true);
    assert.deepEqual(success(await state.request()).samples, []);
  } finally { await state.close(); }
});

test('account outage/logout and switching project never carry monitoring consent or samples', async () => {
  const state = await fixture();
  try {
    await state.request('setEnabled');
    const nextProject = success(await state.request('getState', true, otherProject));
    assert.equal(nextProject.enabled, false); assert.equal(nextProject.projectId, otherProject); assert.deepEqual(nextProject.samples, []);
    await state.request('setEnabled', true, otherProject);
    state.setAccount({ ...account(), status: 'unavailable' });
    assert.equal(state.timerCount(), 0); assert.equal((await state.request()).ok, false);
    state.setAccount(account('account-b'));
    const nextAccount = success(await state.request()); assert.equal(nextAccount.enabled, false); assert.deepEqual(nextAccount.samples, []);
    await state.request('setEnabled');
    state.setAccount({ status: 'signed_out', user: null, expiresAt: null, persistent: false, message: null });
    assert.equal(state.timerCount(), 0); assert.equal((await state.request()).ok, false);
  } finally { await state.close(); }
});

test('async account and binding races cannot enable monitoring for stale context', async () => {
  const state = await fixture();
  try {
    state.onAuthorization(() => { state.setRoot(1); });
    assert.equal((await state.request('setEnabled')).ok, false); assert.equal(state.readCount(), 0);
    state.onAuthorization(() => { state.setAccount(account('account-b')); });
    assert.equal((await state.request('setEnabled')).ok, false); assert.equal(state.readCount(), 0);
    state.onAuthorization(null);
    assert.equal(success(await state.request()).enabled, false);
  } finally { await state.close(); }
});

test('new context cancels in-flight authorization before any stale device sample', async () => {
  const state = await fixture();
  try {
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    state.onAuthorization(async () => { entered(); await blocked; });
    const oldRequest = state.request('setEnabled');
    await started;
    const newRequest = state.request('getState', true, otherProject);
    state.onAuthorization(null); release();
    assert.equal((await oldRequest).ok, false);
    const current = success(await newRequest); assert.equal(current.projectId, otherProject); assert.equal(current.enabled, false);
    assert.equal(state.readCount(), 0);
  } finally { await state.close(); }
});

test('unavailable CPU remains unknown, counter resets do not invent utilization, invalid counters fail closed', async () => {
  const state = await fixture();
  try {
    state.setDevice(() => ({ cpu: null, memoryTotalBytes: 1000, memoryFreeBytes: 500 }));
    assert.equal(success(await state.request('setEnabled')).samples[0]?.cpuPercent, null);
    state.setDevice(() => ({ cpu: { idle: 100, total: 200 }, memoryTotalBytes: 1000, memoryFreeBytes: 500 }));
    await state.tick();
    state.setDevice(() => ({ cpu: { idle: 5, total: 10 }, memoryTotalBytes: 1000, memoryFreeBytes: 500 }));
    await state.tick();
    assert.equal(success(await state.request()).samples.at(-1)?.cpuPercent, null);
    state.setDevice(() => ({ cpu: null, memoryTotalBytes: 0, memoryFreeBytes: 0 }));
    await state.tick();
    const unavailable = success(await state.request()); assert.equal(unavailable.enabled, false); assert.deepEqual(unavailable.samples, []);
    assert.equal(state.timerCount(), 0);
  } finally { await state.close(); }
});

test('unknown request fields, signed-out access and disposed service never collect data', async () => {
  const state = await fixture();
  try {
    assert.equal((await state.service.request({ operation: 'setEnabled', projectId, repositoryId, enabled: true, path: 'arbitrary' } as TelemetryRequest)).ok, false);
    state.service.dispose(); assert.equal((await state.request('setEnabled')).ok, false); assert.equal(state.readCount(), 0);
  } finally { await state.close(); }
});

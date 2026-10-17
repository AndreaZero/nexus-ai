import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountStateCoordinator } from '../src/auth/account-state.ts';
import { CodexStartup } from '../src/codex/startup.ts';

const snapshot = (status) => ({ state: { status, user: null, expiresAt: null, persistent: false, message: null }, configured: true, emailConfigured: false });
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  const applied = [];
  const loading = [];
  let failures = 0;
  const flow = new AccountStateCoordinator(value => applied.push(value.state.status), value => loading.push(value), () => ++failures);
  flow.activate();
  return { flow, applied, loading, failures: () => failures };
}

test('startup and focus share one read; a newer login event survives a stale read', async () => {
  const { flow, applied, loading } = setup();
  const read = deferred();
  let calls = 0;
  const load = () => { ++calls; return read.promise; };
  const first = flow.refresh(load);
  assert.equal(flow.refresh(load), first);
  await Promise.resolve();
  assert.equal(calls, 1);
  flow.accept(snapshot('signed_in'));
  read.resolve(snapshot('signed_out'));
  await first;
  assert.deepEqual(applied, ['signed_in']);
  assert.equal(loading.at(-1), false);
  await flow.refresh(async () => snapshot('signed_in'));
  assert.deepEqual(applied, ['signed_in', 'signed_in'], 'A completed read does not cache future checks.');
});

test('explicit sign out supersedes an older unavailable refresh', async () => {
  const { flow, applied, failures } = setup();
  const read = deferred();
  const first = flow.refresh(() => read.promise);
  await flow.perform(async () => snapshot('signed_out'));
  read.reject(new Error('old transport failure'));
  await first;
  assert.deepEqual(applied, ['signed_out']);
  assert.equal(failures(), 0);
});

test('StrictMode effect replay shares hydration and unmounted providers ignore results', async () => {
  const { flow, applied } = setup();
  const read = deferred();
  const pending = flow.refresh(() => read.promise);
  flow.deactivate();
  flow.activate();
  assert.equal(flow.refresh(() => { throw new Error('duplicate'); }), pending);
  read.resolve(snapshot('signed_in'));
  await pending;
  assert.deepEqual(applied, ['signed_in']);
  const next = deferred();
  const last = flow.refresh(() => next.promise);
  flow.deactivate();
  next.resolve(snapshot('signed_out'));
  await last;
  assert.deepEqual(applied, ['signed_in']);
});

test('a failed fresh read leaves one recoverable failure and no automatic retry loop', async () => {
  const { flow, failures, loading } = setup();
  let calls = 0;
  await flow.refresh(async () => { ++calls; throw new Error('offline'); });
  assert.equal(calls, 1);
  assert.equal(failures(), 1);
  assert.deepEqual(loading, [true, false]);
});

test('Codex restores once per account login and respects disconnect across project remounts', () => {
  const startup = new CodexStartup();
  assert.equal(startup.operation(null), 'getState');
  assert.equal(startup.operation('account-a'), 'connect');
  // StrictMode, project/role changes and focus must not undo a user disconnect,
  // repeat a failed connection, open an OAuth browser or submit a turn.
  assert.equal(startup.operation('account-a'), 'getState');
  assert.equal(startup.operation('account-a'), 'getState');
  assert.equal(startup.operation('account-b'), 'connect');
  assert.equal(startup.operation(null), 'getState');
  assert.equal(startup.operation('account-b'), 'connect');
});

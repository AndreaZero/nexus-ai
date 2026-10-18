import assert from 'node:assert/strict';
import test from 'node:test';
import { completionScope, deriveOnboarding, emptyOnboardingPreferences, onboardingStorageKey, readOnboardingPreferences, resolveOnboardingStep, saveOnboardingPreferences } from '../src/onboarding/state.ts';

const stamp = '2026-10-18T12:00:00.000Z';
function input() {
  return {
    account: { signedIn: true, verified: true, loading: false },
    collaboration: { ready: true, loading: false, error: '', workspaceId: 'workspace', project: { id: 'project', workspaceId: 'workspace', role: 'owner', repository: { id: 'repository', projectId: 'project', remoteUrl: 'https://github.com/example/project', defaultBranch: 'main' } } },
    desktop: true, platform: 'win32',
    codex: { enabled: true, error: '', bindingLoading: false, bindingError: '', binding: { projectId: 'project', repositoryId: 'repository', deviceId: 'device', updatedAt: stamp }, runtime: 'ready', accountPresent: true, model: { id: 'available-model' }, modelIds: ['available-model'], windowsSandbox: 'ready', session: null },
  };
}
function completedSession() {
  return { projectId: 'project', repositoryId: 'repository', bindingUpdatedAt: stamp, status: 'completed', messages: [{ id: 'answer', role: 'assistant', status: 'complete', text: 'The project contains a README.' }] };
}
function storage() {
  const items = new Map();
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => { items.set(key, value); }, items };
}

test('Onboarding reaches the composer only from verified current account, project, binding, model and Windows sandbox', () => {
  const value = input();
  assert.equal(deriveOnboarding(value).firstIncomplete, 'session');
  assert.equal(deriveOnboarding(value).completed, false);
  value.codex.windowsSandbox = 'unknown';
  assert.equal(deriveOnboarding(value).firstIncomplete, 'codex');
  assert.equal(deriveOnboarding(value).steps.find(step => step.id === 'session').available, false);
  for (const sandbox of ['running', 'failed', 'not_applicable']) {
    value.codex.windowsSandbox = sandbox;
    assert.equal(deriveOnboarding(value).steps.find(step => step.id === 'codex').complete, false);
  }
  value.platform = 'darwin';
  assert.equal(deriveOnboarding(value).steps.find(step => step.id === 'codex').complete, true);
  value.platform = null;
  assert.equal(deriveOnboarding(value).steps.find(step => step.id === 'codex').complete, false);
});

test('Only a nonempty complete assistant answer from a completed current session creates a receipt', () => {
  const value = input();
  value.codex.session = completedSession();
  assert.deepEqual(deriveOnboarding(value).observedReceipt, completionScope(value));
  assert.equal(deriveOnboarding(value).completed, true);
  for (const patch of [{ status: 'running' }, { status: 'failed' }, { status: 'interrupted' }, { projectId: 'another' }, { repositoryId: 'another' }, { messages: [{ role: 'user', status: 'complete', text: 'Question' }] }, { messages: [{ role: 'assistant', status: 'streaming', text: 'Partial answer' }] }, { messages: [{ role: 'assistant', status: 'complete', text: '  \n' }] }]) {
    value.codex.session = { ...completedSession(), ...patch };
    assert.equal(deriveOnboarding(value).completed, false);
    assert.equal(deriveOnboarding(value).observedReceipt, null);
  }
});

test('Historical response receipt is scoped to project, repository, device and binding timestamp', () => {
  const value = input();
  const receipt = completionScope(value);
  assert.equal(deriveOnboarding(value, receipt).completed, true);
  for (const patch of [{ projectId: 'another' }, { repositoryId: 'another' }, { deviceId: 'another' }, { bindingUpdatedAt: '2026-10-19T00:00:00.000Z' }]) {
    assert.equal(deriveOnboarding(value, { ...receipt, ...patch }).completed, false);
  }
  value.codex.binding.updatedAt = '2026-10-19T00:00:00.000Z';
  assert.equal(deriveOnboarding(value, receipt).completed, false);
});

test('Changing a folder cannot credit a completed response from the previous binding', () => {
  const value = input();
  value.codex.session = completedSession();
  const receipt = completionScope(value);
  assert.equal(deriveOnboarding(value).completed, true);
  value.codex.binding.updatedAt = '2026-10-19T00:00:00.000Z';
  assert.equal(deriveOnboarding(value, receipt).completed, false);
  assert.equal(deriveOnboarding(value, receipt).observedReceipt, null);
  value.codex.session.bindingUpdatedAt = value.codex.binding.updatedAt;
  assert.equal(deriveOnboarding(value, receipt).completed, true);
  delete value.codex.session.bindingUpdatedAt;
  assert.equal(deriveOnboarding(value, receipt).completed, false);
});

test('Stored completion cannot authorize a signed out, unverified, loading, revoked or failed scope', () => {
  const receipt = completionScope(input());
  for (const mutate of [
    value => { value.account.signedIn = false; }, value => { value.account.verified = false; }, value => { value.account.loading = true; },
    value => { value.collaboration.loading = true; }, value => { value.collaboration.ready = false; }, value => { value.collaboration.error = 'Unavailable'; },
    value => { value.collaboration.project = null; }, value => { value.collaboration.project.workspaceId = 'another'; },
    value => { value.codex.bindingLoading = true; }, value => { value.codex.bindingError = 'Folder unavailable'; }, value => { value.codex.binding = null; },
    value => { value.codex.error = 'Connection unavailable'; }, value => { value.codex.runtime = 'stopped'; }, value => { value.codex.accountPresent = false; },
    value => { value.codex.modelIds = []; }, value => { value.codex.enabled = false; },
  ]) {
    const value = input(); mutate(value);
    assert.equal(deriveOnboarding(value, receipt).completed, false);
  }
});

test('Browser and client/viewer journeys finish at the authorized project without local Codex requirements', () => {
  for (const role of ['owner', 'developer', 'client', 'viewer']) {
    const value = input(); value.desktop = false; value.platform = null; value.collaboration.project.role = role;
    value.codex.enabled = false; value.codex.binding = null; value.codex.runtime = 'stopped'; value.codex.accountPresent = false;
    const result = deriveOnboarding(value);
    assert.equal(result.mode, ['client', 'viewer'].includes(role) ? 'observer' : 'browser');
    assert.equal(result.completed, true);
    assert.equal(result.steps.slice(3).some(step => step.available || step.complete), false);
  }
  const value = input(); value.collaboration.project.role = 'viewer';
  assert.equal(deriveOnboarding(value).mode, 'observer');
  assert.equal(deriveOnboarding(value).steps.find(step => step.id === 'session').available, false);
});

test('Account and server authority isolate dismissal, selected step and completion receipt', () => {
  const local = storage();
  const key = onboardingStorageKey('https://one.example/', 'first-account');
  const preferences = { version: 1, dismissed: true, stepId: 'session', receipt: completionScope(input()) };
  assert.equal(saveOnboardingPreferences(local, key, preferences), true);
  assert.deepEqual(readOnboardingPreferences(local, key).preferences, preferences);
  for (const otherKey of [onboardingStorageKey('https://one.example/', 'second-account'), onboardingStorageKey('https://two.example/', 'first-account'), onboardingStorageKey('https://one.example/', null)]) {
    assert.notEqual(otherKey, key);
    assert.deepEqual(readOnboardingPreferences(local, otherKey).preferences, emptyOnboardingPreferences);
  }
});

test('Persistence whitelists UI booleans and scope identifiers, without paths, messages or credentials', () => {
  const local = storage();
  const receipt = { ...completionScope(input()), rootPath: 'private-path', text: 'private-conversation', token: 'private-token' };
  saveOnboardingPreferences(local, 'scope', { version: 1, dismissed: false, stepId: 'folder', receipt, secret: 'private-secret' });
  const serialized = local.items.get('scope');
  assert.equal(serialized.includes('private-'), false);
  assert.deepEqual(JSON.parse(serialized).receipt, completionScope(input()));
});

test('Unavailable, quota-limited, malformed and foreign-version storage degrade without blocking the guide', () => {
  for (const local of [null, { getItem() { throw new Error('Storage denied'); }, setItem() { throw new Error('Storage denied'); } }]) {
    assert.equal(readOnboardingPreferences(local, 'scope').available, false);
    assert.equal(saveOnboardingPreferences(local, 'scope', emptyOnboardingPreferences), false);
  }
  const local = storage(); local.items.set('scope', '{broken');
  assert.equal(readOnboardingPreferences(local, 'scope').available, true);
  assert.deepEqual(readOnboardingPreferences(local, 'scope').preferences, emptyOnboardingPreferences);
  local.items.set('scope', JSON.stringify({ version: 2, dismissed: true, stepId: 'session' }));
  assert.deepEqual(readOnboardingPreferences(local, 'scope').preferences, emptyOnboardingPreferences);
  assert.equal(saveOnboardingPreferences({ getItem: local.getItem, setItem() { throw new Error('Quota'); } }, 'scope', emptyOnboardingPreferences), false);
});

test('Invalid stored step and receipt are ignored and prerequisite revocation selects a reachable step', () => {
  const local = storage();
  local.items.set('scope', JSON.stringify({ version: 1, dismissed: true, stepId: 'malicious', receipt: { complete: true, projectId: 'project' } }));
  const result = readOnboardingPreferences(local, 'scope');
  assert.deepEqual(result.preferences, { ...emptyOnboardingPreferences, dismissed: true });
  const value = input(); value.codex.binding = null;
  const derived = deriveOnboarding(value);
  assert.equal(resolveOnboardingStep(derived.steps, 'session', derived.firstIncomplete), 'folder');
  assert.equal(resolveOnboardingStep(derived.steps, 'account', derived.firstIncomplete), 'account');
});

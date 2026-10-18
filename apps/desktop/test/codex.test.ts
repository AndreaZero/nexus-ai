import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CodexProcessError, type CodexProcess, type CodexNotification, type CodexServerRequest } from '@nexus-ai/codex-bridge';
import { codexRequestSchema, type CodexRequest, type CodexState, type NexusAuthState } from '@nexus-ai/contracts';
import { DesktopCodex, codexRuntimePath, officialCodexLoginUrl } from '../src/codex.ts';
import { CodexThreadStorage, codexAccountHome, codexSessionKey } from '../src/codex-storage.ts';
import { terminalText, testReport } from '../src/codex-report.ts';

const projectId = 'd309dd11-6d7e-4bc1-bd49-292bc50c2f74';
const repositoryId = '02f71f6e-69b1-49b7-b6d8-df89167070b9';
const secondRepository = '9b5bbbc2-e8c6-4cac-a46a-b358bb44ed71';
const nexusAccount = (id = 'nexus-a'): NexusAuthState => ({ status: 'signed_in', user: { id, name: 'Local test', email: 'test@example.invalid', emailVerified: true, image: null }, expiresAt: '2099-01-01T00:00:00.000Z', persistent: true, message: null });
const model = { id: 'catalog-model', model: 'official-model', displayName: 'Official model', description: 'A real catalog fixture', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'low' }] };

class RuntimeFixture {
  notification: (event: CodexNotification) => void = () => undefined;
  serverRequest: (event: CodexServerRequest) => void = () => undefined;
  exited: (reason: unknown) => void = () => undefined;
  calls: { method: string; params: unknown }[] = [];
  responses: { id: string | number; result: unknown }[] = [];
  rejections: (string | number)[] = [];
  disposed = false;
  failure: CodexProcessError | undefined;
  responseFailure = false;
  pauseCatalog: (() => Promise<void>) | undefined;
  pauseTurn: (() => Promise<void>) | undefined;
  pauseDispose: (() => Promise<void>) | undefined;
  count = 0;
  turnCount = 0;
  threads = new Map<string, unknown>();
  nextLoginUrl = 'https://auth.openai.com/authorize?client_id=test';
  async start() { if (this.failure) throw this.failure; }
  async dispose() { await this.pauseDispose?.(); this.disposed = true; }
  onNotification(callback: (event: CodexNotification) => void) { this.notification = callback; return () => undefined; }
  onServerRequest(callback: (event: CodexServerRequest) => void) { this.serverRequest = callback; return () => undefined; }
  onExit(callback: (reason: unknown) => void) { this.exited = callback; return () => undefined; }
  async respond(id: string | number, result: unknown) { this.responses.push({ id, result }); if (this.responseFailure) throw new Error('Transport closed'); }
  async reject(id: string | number) { this.rejections.push(id); }
  async request(method: string, params: unknown): Promise<unknown> {
    this.calls.push({ method, params });
    const data = params as Record<string, unknown> | undefined;
    if (method === 'account/read') return { account: { type: 'chatgpt', email: 'codex@example.invalid', planType: 'plus' }, requiresOpenaiAuth: true };
    if (method === 'model/list') { await this.pauseCatalog?.(); return { data: [model], nextCursor: null }; }
    if (method === 'account/login/start') {
      if (data?.['type'] === 'apiKey') return { type: 'apiKey' };
      return data?.['type'] === 'chatgptDeviceCode' ? { type: 'chatgptDeviceCode', loginId: 'login-1', verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST-CODE' }
        : { type: 'chatgpt', loginId: 'login-1', authUrl: this.nextLoginUrl };
    }
    if (method === 'thread/start') {
      const thread = { id: `thread-${++this.count}`, cwd: data?.['cwd'], modelProvider: 'openai', turns: [] };
      this.threads.set(thread.id, thread); return { thread };
    }
    if (method === 'thread/read' || method === 'thread/resume') return { thread: this.threads.get(String(data?.['threadId'])) };
    if (method === 'turn/start') { await this.pauseTurn?.(); return { turn: { id: `turn-${++this.turnCount}`, status: 'inProgress', items: [], error: null } }; }
    return {};
  }
  client() { return this as unknown as Pick<CodexProcess, 'start' | 'request' | 'onNotification' | 'onServerRequest' | 'respond' | 'reject' | 'onExit' | 'dispose'>; }
}

async function fixture() {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'nexus-codex-')));
  const folder = path.join(directory, 'repository');
  await mkdir(folder);
  let currentFolder = folder;
  let account = nexusAccount();
  let allowed = true;
  const runtime = new RuntimeFixture();
  const snapshots: CodexState[] = [];
  const browserUrls: string[] = [];
  const homes: string[] = [];
  let browserAvailable = true;
  let attachments: { name: string; text: string }[] = [];
  let attachmentFailure = false;
  const authCalls = { state: 0, repository: 0 };
  const service = new DesktopCodex({ userData: directory, executable: path.join(directory, 'codex.exe'), clientVersion: '0.5.0', platform: 'win32',
    auth: { getState: async () => { authCalls.state++; return account; },
      authorizeRepository: async () => { authCalls.repository++; return allowed ? { userId: account.user!.id } : { ok: false as const, code: 'forbidden', message: 'Denied' }; } },
    bindings: { get: async (userId, project, repository) => ({ projectId: project, repositoryId: repository, deviceId: projectId, rootPath: currentFolder, label: userId, updatedAt: '2026-10-17T00:00:00.000Z' }) },
    createProcess: options => { homes.push(options.home); return runtime.client(); }, publish: state => snapshots.push(structuredClone(state)), openExternal: async url => { if (!browserAvailable) throw new Error('Browser unavailable.'); browserUrls.push(url); },
    readAttachments: async () => { if (attachmentFailure) throw new Error('Attachment unavailable.'); return attachments; },
  });
  return { directory, folder, runtime, service, snapshots, browserUrls, homes, authCalls, setAccount: (value: NexusAuthState) => { account = value; service.nexusStateChanged(value); }, setAllowed: (value: boolean) => { allowed = value; }, setFolder: (value: string) => { currentFolder = value; }, setBrowserAvailable: (value: boolean) => { browserAvailable = value; },
    setAttachments: (files: { name: string; text: string }[]) => { attachments = files; }, setAttachmentFailure: () => { attachmentFailure = true; },
    close: async () => { await service.dispose(); await rm(directory, { recursive: true, force: true }); } };
}
const open: CodexRequest = { operation: 'openSession', projectId, repositoryId, model: 'official-model' };
const send: CodexRequest = { operation: 'send', projectId, repositoryId, model: 'official-model', effort: 'medium', text: 'Explain the existing files.', attachmentIds: [] };

test('native runtime paths, official login URLs and IPC inputs prevent arbitrary process/path injection', () => {
  assert.equal(codexRuntimePath(true, '/resources', '/app', 'linux'), path.join('/resources', 'codex/bin/codex'));
  assert.match(codexRuntimePath(false, '/resources', path.resolve('apps/desktop'), 'win32'), /\.nexus[\\/]runtime[\\/]codex[\\/]bin[\\/]codex\.exe$/);
  assert.equal(officialCodexLoginUrl('https://auth.openai.com/codex/device'), 'https://auth.openai.com/codex/device');
  for (const value of ['https://auth.openai.com.attacker.invalid/', 'http://auth.openai.com/', 'https://user:secret@chatgpt.com/', 'file:///C:/example', 'https://chatgpt.com:8443/']) assert.throws(() => officialCodexLoginUrl(value));
  for (const input of [{ operation: 'connect', executable: '/arbitrary' }, { ...send, cwd: '/arbitrary' }, { ...open, threadId: 'other' }, { operation: 'rpc', method: 'command/exec' }]) assert.equal(codexRequestSchema.safeParse(input).success, false);
});

test('runtime missing/version errors are recoverable and never echo provider secrets', async () => {
  for (const code of ['runtime_missing', 'runtime_version'] as const) {
    const test = await fixture();
    try {
      test.runtime.failure = new CodexProcessError(code);
      const result = await test.service.request({ operation: 'connect' });
      assert.equal(result.ok, false);
      assert.equal(result.state.runtime, code === 'runtime_missing' ? 'missing' : 'incompatible');
      assert.equal(test.runtime.disposed, true);
    } finally { await test.close(); }
  }
});

test('an asynchronous account switch invalidates the in-flight connect response and its catalog', async () => {
  const test = await fixture();
  let release: () => void = () => undefined;
  let entered: () => void = () => undefined;
  const catalogEntered = new Promise<void>(resolve => { entered = resolve; });
  const catalogReleased = new Promise<void>(resolve => { release = resolve; });
  try {
    test.runtime.pauseCatalog = async () => { entered(); await catalogReleased; };
    const connecting = test.service.request({ operation: 'connect' });
    await catalogEntered;
    test.setAccount(nexusAccount('nexus-b'));
    release();
    const result = await connecting;
    assert.equal(result.ok, false); assert.equal(result.state.account, null); assert.deepEqual(result.state.models, []); assert.equal(result.state.session, null);
    assert.equal(test.runtime.disposed, true);
  } finally { release(); await test.close(); }
});

test('Codex home is isolated by Nexus account; logout immediately clears and rejects late provider events', async () => {
  const test = await fixture();
  try {
    assert.equal((await test.service.request({ operation: 'connect' })).ok, true);
    assert.deepEqual(test.homes, [codexAccountHome(test.directory, 'nexus-a')]);
    assert.notEqual(codexAccountHome(test.directory, 'nexus-a'), codexAccountHome(test.directory, 'nexus-b'));
    await test.service.request(open);
    test.setAccount({ status: 'signed_out', user: null, expiresAt: null, persistent: false, message: null });
    test.runtime.notification({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', itemId: 'late', delta: 'private stale output' } });
    const result = await test.service.request({ operation: 'getState' });
    assert.equal(result.ok, false);
    assert.equal(result.state.runtime, 'stopped'); assert.equal(result.state.session, null); assert.equal(result.state.account, null);
    assert.equal(test.runtime.disposed, true);
    assert.equal(JSON.stringify(test.snapshots.at(-1)).includes('private stale output'), false);
  } finally { await test.close(); }
});

test('session execution reauthorizes repository, validates catalog/effort and defaults to read-only policies', async () => {
  const test = await fixture();
  try {
    await test.service.request({ operation: 'connect' });
    assert.equal((await test.service.request({ ...send, model: 'invented' })).ok, false);
    assert.equal((await test.service.request({ ...send, effort: 'invented' })).ok, false);
    assert.equal(test.runtime.calls.some(call => call.method === 'turn/start'), false);
    const result = await test.service.request(send);
    assert.equal(result.ok, true);
    const start = test.runtime.calls.find(call => call.method === 'thread/start')!.params as Record<string, unknown>;
    assert.equal(start['cwd'], await realpath(test.folder)); assert.equal(start['sandbox'], 'read-only'); assert.equal(start['approvalPolicy'], 'on-request'); assert.equal(start['modelProvider'], 'openai');
    const turn = test.runtime.calls.find(call => call.method === 'turn/start')!.params as Record<string, unknown>;
    assert.deepEqual(turn['sandboxPolicy'], { type: 'readOnly', networkAccess: false }); assert.equal(turn['approvalPolicy'], 'on-request');
    test.setAllowed(false);
    const denied = await test.service.request({ operation: 'getState' });
    assert.equal(denied.ok, false); assert.equal(denied.state.session, null); assert.equal(test.runtime.disposed, true);
  } finally { await test.close(); }
});

test('temporary Nexus loss interrupts once, declines approvals and preserves local runtime without replay', async () => {
  const f = await fixture();
  try {
    await f.service.request({ operation: 'connect' }); await f.service.request(open);
    const proof = await f.service.authorizeSharing(projectId, repositoryId, 'thread-1'); assert.equal(proof.cwd, await realpath(f.folder));
    await f.service.request(send);
    const turns = f.runtime.calls.filter(call => call.method === 'turn/start').length;
    const unavailable: NexusAuthState = { status: 'unavailable', user: null, expiresAt: null, persistent: false, message: 'Offline' };
    f.setAccount(unavailable); f.setAccount(unavailable);
    assert.equal(f.runtime.disposed, false);
    assert.equal(f.runtime.calls.filter(call => call.method === 'turn/interrupt').length, 1);
    const denied = await f.service.request(send); assert.equal(denied.ok, false); assert.equal(denied.state.session?.threadId, 'thread-1'); assert.equal(denied.state.policy, 'readOnly');
    f.runtime.serverRequest({ id: 901, method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'offline-command', command: 'node --version', cwd: f.folder, startedAtMs: Date.now() } });
    assert.deepEqual(f.runtime.responses.at(-1), { id: 901, result: { decision: 'decline' } });
    f.setAccount(nexusAccount()); await f.service.request({ operation: 'getState' });
    assert.equal(f.runtime.disposed, false); assert.equal(f.runtime.calls.filter(call => call.method === 'turn/start').length, turns);
    assert.equal(f.runtime.calls.filter(call => call.method === 'thread/start').length, 1);
    f.setFolder(path.dirname(f.folder));
    await assert.rejects(f.service.authorizeSharing(projectId, repositoryId, 'thread-1'));
  } finally { await f.close(); }
});

test('stream capture source proof checks current local binding without issuing account HTTP requests', async () => {
  const f = await fixture();
  try {
    await f.service.request({ operation: 'connect' }); await f.service.request(open);
    const before = { ...f.authCalls };
    for (let index = 0; index < 8; index++) await f.service.authorizeSharing(projectId, repositoryId, 'thread-1');
    assert.deepEqual(f.authCalls, before);
    await assert.rejects(f.service.authorizeSharing(projectId, secondRepository, 'thread-1'));
    f.setFolder(path.dirname(f.folder)); await assert.rejects(f.service.authorizeSharing(projectId, repositoryId, 'thread-1'));
    assert.deepEqual(f.authCalls, before);
  } finally { await f.close(); }
});

test('Nexus loss during turn/start interrupts its late turn identifier instead of replaying it after recovery', async () => {
  const f = await fixture();
  let release: () => void = () => undefined;
  let entered: () => void = () => undefined;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  try {
    await f.service.request({ operation: 'connect' }); await f.service.request(open);
    f.runtime.pauseTurn = async () => { entered(); await waiting; };
    const sending = f.service.request(send); await started;
    f.setAccount({ status: 'unavailable', user: null, expiresAt: null, persistent: false, message: 'Offline' });
    f.setAccount(nexusAccount()); release();
    const result = await sending; assert.equal(result.ok, false); assert.equal(result.state.session?.status, 'interrupted');
    assert.equal(f.runtime.calls.filter(call => call.method === 'turn/interrupt').length, 1);
    assert.equal(f.runtime.calls.filter(call => call.method === 'turn/start').length, 1); assert.equal(f.runtime.disposed, false);
  } finally { release(); await f.close(); }
});

test('a prompt queued before Nexus loss is cancelled even when the connection recovers before dispatch', async () => {
  const f = await fixture();
  let release: () => void = () => undefined;
  let entered: () => void = () => undefined;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  try {
    await f.service.request({ operation: 'connect' }); await f.service.request(open);
    f.runtime.pauseCatalog = async () => { entered(); await waiting; };
    const refreshing = f.service.request({ operation: 'refreshModels' }); await started;
    const sending = f.service.request(send);
    f.setAccount({ status: 'unavailable', user: null, expiresAt: null, persistent: false, message: 'Offline' });
    f.setAccount(nexusAccount()); release(); await refreshing;
    const result = await sending;
    assert.equal(result.ok, false); assert.match(result.state.notice!, /cancelled/);
    assert.equal(f.runtime.calls.some(call => call.method === 'turn/start'), false);
    assert.equal(f.runtime.disposed, false);
    assert.equal((await f.service.request(send)).ok, true);
    assert.equal(f.runtime.calls.filter(call => call.method === 'turn/start').length, 1);
  } finally { release(); await f.close(); }
});

test('crash declines pending execution and reconnect waits for the previous process cleanup without replay', async () => {
  const f = await fixture();
  let release: () => void = () => undefined;
  let entered: () => void = () => undefined;
  const disposing = new Promise<void>(resolve => { entered = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  try {
    await writable(f); f.runtime.serverRequest(approvalRequest(701, f.folder));
    const approval = (await f.service.request({ operation: 'getState' })).state.session!.approvals[0]!;
    f.runtime.pauseDispose = async () => { entered(); await waiting; };
    f.runtime.exited('controlled crash'); await disposing;
    const connecting = f.service.request({ operation: 'connect' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.homes.length, 1); assert.equal(f.snapshots.at(-1)?.runtime, 'error');
    assert.deepEqual(f.runtime.responses.at(-1), { id: 701, result: { decision: 'decline' } });
    release(); assert.equal((await connecting).ok, true); assert.equal(f.homes.length, 2);
    const stale = await f.service.request({ operation: 'resolveApproval', projectId, repositoryId, approvalId: approval.id, decision: 'acceptOnce' });
    assert.equal(stale.ok, false);
    assert.equal(f.runtime.calls.filter(call => call.method === 'turn/start').length, 1);
    assert.equal(f.runtime.responses.some(value => (value.result as { decision: string }).decision === 'accept'), false);
  } finally { release(); await f.close(); }
});

test('account change while a reconnect waits for cleanup cannot start a runtime for the previous account', async () => {
  const f = await fixture();
  let release: () => void = () => undefined;
  let entered: () => void = () => undefined;
  const disposing = new Promise<void>(resolve => { entered = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  try {
    await f.service.request({ operation: 'connect' });
    f.runtime.pauseDispose = async () => { entered(); await waiting; };
    f.runtime.exited('controlled crash'); await disposing;
    const connecting = f.service.request({ operation: 'connect' });
    await new Promise(resolve => setImmediate(resolve));
    f.setAccount(nexusAccount('nexus-b')); release();
    assert.equal((await connecting).ok, false); assert.equal(f.homes.length, 1);
    assert.equal((await f.service.request({ operation: 'connect' })).ok, true);
    assert.equal(f.homes[1], codexAccountHome(f.directory, 'nexus-b'));
  } finally { release(); await f.close(); }
});

test('thread mapping resumes only account/project/repository/canonical folder matches', async () => {
  const test = await fixture();
  try {
    await test.service.request({ operation: 'connect' });
    await test.service.request(open);
    await test.service.request(open);
    assert.equal(test.runtime.calls.filter(call => call.method === 'thread/start').length, 1);
    assert.equal(test.runtime.calls.filter(call => call.method === 'thread/resume').length, 1);
    assert.equal(test.runtime.calls.filter(call => call.method === 'thread/read').length, 1);
    await test.service.request({ ...open, repositoryId: secondRepository });
    assert.equal(test.runtime.calls.filter(call => call.method === 'thread/start').length, 2);
    const moved = path.join(test.directory, 'other'); await mkdir(moved); test.setFolder(moved);
    const changed = await test.service.request({ operation: 'getState' });
    assert.equal(changed.ok, false); assert.equal(changed.state.session, null); assert.equal(test.runtime.disposed, true);
    test.runtime.disposed = false;
    await test.service.request({ operation: 'connect' });
    await test.service.request(open);
    assert.equal(test.runtime.calls.filter(call => call.method === 'thread/start').length, 3);
  } finally { await test.close(); }
});

test('observable deltas stream with bounds, private reasoning is excluded, approval requests decline once and interruption is real', async () => {
  const test = await fixture();
  try {
    await test.service.request({ operation: 'connect' }); await test.service.request(send);
    const emit = (method: string, params: Record<string, unknown>) => test.runtime.notification({ method, params: { threadId: 'thread-1', turnId: 'turn-1', ...params } });
    emit('item/agentMessage/delta', { itemId: 'answer', delta: 'hello' });
    emit('item/agentMessage/delta', { itemId: 'answer', delta: ' world' });
    emit('item/completed', { item: { type: 'reasoning', id: 'private', content: ['must never be exposed'], summary: ['private summary'] } });
    test.runtime.serverRequest({ method: 'item/commandExecution/requestApproval', id: 1, params: { threadId: 'thread-1', itemId: 'command' } });
    test.runtime.serverRequest({ method: 'item/fileChange/requestApproval', id: 2, params: { threadId: 'thread-1', itemId: 'file' } });
    test.runtime.serverRequest({ method: 'item/tool/call', id: 3, params: {} });
    assert.deepEqual(test.runtime.responses, [{ id: 1, result: { decision: 'decline' } }, { id: 2, result: { decision: 'decline' } }]);
    assert.deepEqual(test.runtime.rejections, [3]);
    emit('item/agentMessage/delta', { itemId: 'large', delta: 'x'.repeat(200000) });
    await test.service.request({ operation: 'interrupt', projectId, repositoryId });
    assert.deepEqual(test.runtime.calls.find(call => call.method === 'turn/interrupt')!.params, { threadId: 'thread-1', turnId: 'turn-1' });
    emit('turn/completed', { turn: { id: 'turn-1', status: 'interrupted', items: [], error: null } });
    let result = await test.service.request({ operation: 'getState' });
    assert.equal(result.state.session?.status, 'interrupted');
    assert.equal(result.state.session?.messages.find(message => message.id === 'answer')?.text, 'hello world');
    assert.equal(result.state.session?.messages.find(message => message.id === 'answer')?.status, 'interrupted');
    assert.equal(JSON.stringify(result.state).includes('private summary'), false);
    assert.equal(result.state.session?.activities.every(activity => activity.status === 'blocked'), true);
    emit('item/agentMessage/delta', { itemId: 'large', delta: 'x'.repeat(200000) });
    result = await test.service.request({ operation: 'getState' });
    assert.equal(result.state.session?.messages.find(message => message.id === 'large')?.text.length, 131072);
  } finally { await test.close(); }
});

test('login uses official browser/device flow, explicit API key stays outside DTO, Windows setup is explicit', async () => {
  const test = await fixture();
  try {
    await test.service.request({ operation: 'connect' });
    const browser = await test.service.request({ operation: 'login', method: 'browser' });
    assert.equal(browser.state.login?.method, 'browser'); assert.equal(browser.state.login?.verificationUrl, null);
    assert.equal(test.browserUrls[0], test.runtime.nextLoginUrl);
    await test.service.request({ operation: 'cancelLogin' });
    const device = await test.service.request({ operation: 'login', method: 'device' });
    assert.equal(device.state.login?.userCode, 'TEST-CODE'); assert.equal(test.browserUrls[1], device.state.login?.verificationUrl);
    const key = 'sk-test_fixture_key_only_for_validation';
    const api = await test.service.request({ operation: 'loginApiKey', apiKey: key });
    assert.equal(JSON.stringify(api).includes(key), false); assert.equal(JSON.stringify(test.snapshots).includes(key), false);
    assert.equal(test.runtime.calls.some(call => call.method === 'windowsSandbox/setupStart'), false);
    await test.service.request({ operation: 'setupSandbox' });
    assert.equal((test.runtime.calls.find(call => call.method === 'windowsSandbox/setupStart')!.params as Record<string, unknown>)['mode'], 'unelevated');
    test.runtime.nextLoginUrl = 'https://attacker.invalid/';
    const refused = await test.service.request({ operation: 'login', method: 'browser' });
    assert.equal(refused.ok, false); assert.equal(test.browserUrls.length, 2);
  } finally { await test.close(); }
});

test('explicit attachments become separate turn inputs while streamed/resumed user text remains the typed prompt', async () => {
  const state = await fixture();
  try {
    await state.service.request({ operation: 'connect' });
    state.setAttachments([{ name: 'src/source.ts', text: 'export const selected = "snapshot";' }]);
    const result = await state.service.request({ ...send, attachmentIds: [repositoryId] });
    assert.equal(result.ok, true);
    const input = (state.runtime.calls.find(call => call.method === 'turn/start')!.params as { input: { type: string; text: string }[] }).input;
    assert.equal(input.length, 2); assert.equal(input[0]?.text, send.text); assert.match(input[1]!.text, /selected = "snapshot"/);
    state.runtime.notification({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { id: 'user-1', type: 'userMessage', content: input } } });
    const snapshot = await state.service.request({ operation: 'getState' });
    assert.equal(snapshot.state.session?.messages.length, 1); assert.equal(snapshot.state.session?.messages[0]?.text, send.text);
    assert.equal(JSON.stringify(snapshot.state).includes('export const selected'), false);
    state.runtime.notification({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed', items: [], error: null } } });
    state.setAttachmentFailure();
    const denied = await state.service.request({ ...send, attachmentIds: [repositoryId] });
    assert.equal(denied.ok, false); assert.equal(state.runtime.calls.filter(call => call.method === 'turn/start').length, 1);
  } finally { await state.close(); }
});

test('only current-thread exposed plan/token metrics update the session and a new turn clears the plan', async () => {
  const state = await fixture();
  try {
    await state.service.request({ operation: 'connect' }); await state.service.request(send);
    const emit = (method: string, params: Record<string, unknown>) => state.runtime.notification({ method, params: { threadId: 'thread-1', turnId: 'turn-1', ...params } });
    emit('turn/plan/updated', { explanation: 'Visible execution plan.', plan: [{ step: 'Read selected files', status: 'completed' }, { step: 'Explain implementation', status: 'inProgress' }] });
    emit('thread/tokenUsage/updated', { tokenUsage: { total: { totalTokens: 420, inputTokens: 300, cachedInputTokens: 100, cacheWriteInputTokens: 0, outputTokens: 120, reasoningOutputTokens: 20 }, last: {}, modelContextWindow: 200000 } });
    let snapshot = await state.service.request({ operation: 'getState' });
    assert.equal(snapshot.state.session?.plan.length, 2); assert.equal(snapshot.state.session?.planExplanation, 'Visible execution plan.');
    assert.deepEqual(snapshot.state.session?.usage, { totalTokens: 420, inputTokens: 300, cachedInputTokens: 100, outputTokens: 120, contextWindow: 200000 });
    assert.ok(snapshot.state.session?.startedAt);
    emit('turn/plan/updated', { threadId: 'other-thread', plan: [{ step: 'Wrong thread', status: 'pending' }] });
    emit('turn/plan/updated', { turnId: 'old-turn', plan: [{ step: 'Old turn', status: 'pending' }] });
    emit('thread/tokenUsage/updated', { tokenUsage: { total: { totalTokens: -1, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }, modelContextWindow: null } });
    emit('turn/completed', { turn: { id: 'turn-1', status: 'completed', items: [], error: null } });
    snapshot = await state.service.request({ operation: 'getState' });
    assert.equal(snapshot.state.session?.plan[0]?.step, 'Read selected files'); assert.equal(snapshot.state.session?.usage?.totalTokens, 420);
    await state.service.request(send); snapshot = await state.service.request({ operation: 'getState' });
    assert.deepEqual(snapshot.state.session?.plan, []); assert.equal(snapshot.state.session?.planExplanation, null);
  } finally { await state.close(); }
});

test('device code remains usable when the OS cannot launch a browser; browser OAuth cancels the failed launch', async () => {
  const test = await fixture();
  try {
    await test.service.request({ operation: 'connect' });
    test.setBrowserAvailable(false);
    const device = await test.service.request({ operation: 'login', method: 'device' });
    assert.equal(device.ok, true); assert.equal(device.state.login?.userCode, 'TEST-CODE');
    assert.equal(test.runtime.calls.some(call => call.method === 'account/login/cancel'), false);
    const browser = await test.service.request({ operation: 'login', method: 'browser' });
    assert.equal(browser.ok, false); assert.equal(browser.state.login, null);
    assert.equal(test.runtime.calls.filter(call => call.method === 'account/login/cancel').length, 2);
  } finally { await test.close(); }
});

test('mapping writes atomically, isolates identities and does not overwrite malformed files', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nexus-codex-map-'));
  const filename = path.join(directory, 'threads.json');
  try {
    const first = codexSessionKey('a', projectId, repositoryId, directory);
    const second = codexSessionKey('b', projectId, repositoryId, directory);
    const storage = new CodexThreadStorage(filename);
    await Promise.all([storage.set(first, 'thread-a'), storage.set(second, 'thread-b')]);
    assert.equal(await new CodexThreadStorage(filename).get(first), 'thread-a'); assert.equal(await storage.get(second), 'thread-b');
    assert.notEqual(first, codexSessionKey('a', projectId, repositoryId, path.join(directory, 'changed')));
    await writeFile(filename, '{invalid');
    await assert.rejects(() => storage.set(first, 'overwrite'), /cannot be read/);
    assert.equal(await readFile(filename, 'utf8'), '{invalid');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

const approvalRequest = (id: number, folder: string, overrides: Record<string, unknown> = {}): CodexServerRequest => ({
  id, method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: `command-${id}`,
    kind: 'command', startedAtMs: Date.now(), environmentId: null, command: 'node local-script.mjs', cwd: folder, ...overrides },
});
async function writable(state: Awaited<ReturnType<typeof fixture>>) {
  await state.service.request({ operation: 'connect' }); await state.service.request(open);
  const result = await state.service.request({ operation: 'setPolicy', projectId, repositoryId, policy: 'workspaceWrite' });
  assert.equal(result.ok, true); await state.service.request(send);
}

test('workspace writes require explicit idle choice, stay scoped and never enable full access or network', async () => {
  const state = await fixture();
  try {
    await writable(state);
    const turn = state.runtime.calls.find(call => call.method === 'turn/start')!.params as Record<string, unknown>;
    assert.deepEqual(turn['sandboxPolicy'], { type: 'workspaceWrite', writableRoots: [await realpath(state.folder)], networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true });
    const busy = await state.service.request({ operation: 'setPolicy', projectId, repositoryId, policy: 'readOnly' });
    assert.equal(busy.ok, false); assert.equal(busy.state.policy, 'workspaceWrite');
    state.runtime.notification({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed', items: [], error: null } } });
    const changed = await state.service.request({ ...open, repositoryId: secondRepository });
    assert.equal(changed.state.policy, 'readOnly');
    for (const input of [{ operation: 'setPolicy', projectId, repositoryId, policy: 'dangerFullAccess' }, { operation: 'resolveApproval', projectId, repositoryId, approvalId: repositoryId, decision: 'acceptForSession' }]) assert.equal(codexRequestSchema.safeParse(input).success, false);
  } finally { await state.close(); }
});

test('opaque execution approvals resolve exactly once and expire by declining without replay', async () => {
  const state = await fixture();
  try {
    await writable(state);
    state.runtime.serverRequest(approvalRequest(101, state.folder));
    let result = await state.service.request({ operation: 'getState' });
    const approval = result.state.session!.approvals[0]!;
    assert.match(approval.id, /^[0-9a-f-]{36}$/); assert.equal(approval.cwd, '.');
    assert.equal(JSON.stringify(result.state).includes('rpcId'), false);
    result = await state.service.request({ operation: 'resolveApproval', projectId, repositoryId, approvalId: approval.id, decision: 'acceptOnce' });
    assert.equal(result.ok, true); assert.deepEqual(state.runtime.responses, [{ id: 101, result: { decision: 'accept' } }]);
    assert.equal((await state.service.request({ operation: 'resolveApproval', projectId, repositoryId, approvalId: approval.id, decision: 'acceptOnce' })).ok, false);
    state.runtime.serverRequest(approvalRequest(101, state.folder));
    assert.equal(state.runtime.responses.length, 1);
    state.runtime.serverRequest(approvalRequest(102, state.folder, { startedAtMs: Date.now() - 109980 }));
    await new Promise(resolve => setTimeout(resolve, 45));
    result = await state.service.request({ operation: 'getState' });
    assert.equal(result.state.session?.approvals.length, 0); assert.deepEqual(state.runtime.responses.at(-1), { id: 102, result: { decision: 'decline' } });
  } finally { await state.close(); }
});

test('unsupported scopes, legacy callbacks, stale turns and request overflow never become approvals', async () => {
  const state = await fixture();
  try {
    await writable(state);
    const denied = [{ kind: 'writeStdin' }, { networkApprovalContext: { host: 'example.invalid' } }, { environmentId: 'remote' }, { turnId: 'old-turn' }, { cwd: state.directory }, { startedAtMs: Date.now() - 120000 }];
    denied.forEach((params, index) => state.runtime.serverRequest(approvalRequest(index, state.folder, params)));
    state.runtime.serverRequest({ method: 'item/fileChange/requestApproval', id: 10, params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'file', startedAtMs: Date.now(), grantRoot: state.folder } });
    state.runtime.serverRequest({ method: 'execCommandApproval', id: 11, params: {} });
    for (let index = 20; index < 41; index++) state.runtime.serverRequest(approvalRequest(index, state.folder));
    let result = await state.service.request({ operation: 'getState' });
    assert.equal(result.state.session?.approvals.length, 20);
    assert.deepEqual(state.runtime.responses.find(value => value.id === 11)?.result, { decision: 'denied' });
    assert.deepEqual(state.runtime.responses.find(value => value.id === 40)?.result, { decision: 'decline' });
    await state.service.request({ operation: 'interrupt', projectId, repositoryId });
    state.runtime.serverRequest(approvalRequest(80, state.folder));
    result = await state.service.request({ operation: 'getState' }); assert.equal(result.state.session?.approvals.length, 0);
    assert.equal(state.runtime.responses.filter(value => value.result && (value.result as { decision: string }).decision === 'accept').length, 0);
  } finally { await state.close(); }
});

test('an undeliverable decision is reported once without retrying or restoring the approval', async () => {
  const state = await fixture();
  try {
    await writable(state); state.runtime.serverRequest(approvalRequest(1, state.folder));
    const id = (await state.service.request({ operation: 'getState' })).state.session!.approvals[0]!.id;
    state.runtime.responseFailure = true;
    const result = await state.service.request({ operation: 'resolveApproval', projectId, repositoryId, approvalId: id, decision: 'acceptOnce' });
    assert.equal(result.ok, false); assert.equal(result.state.session?.approvals.length, 0);
    assert.match(result.state.notice!, /not retried/); assert.equal(state.runtime.responses.length, 1);
    await state.service.request({ operation: 'resolveApproval', projectId, repositoryId, approvalId: id, decision: 'acceptOnce' });
    assert.equal(state.runtime.responses.length, 1);
  } finally { await state.close(); }
});

test('file approvals without session grants are one-shot and terminal metrics still observe the latest completed turn', async () => {
  const state = await fixture();
  try {
    await writable(state);
    state.runtime.serverRequest({ id: 5, method: 'item/fileChange/requestApproval', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'patch', startedAtMs: Date.now(), grantRoot: null } });
    const current = await state.service.request({ operation: 'getState' });
    assert.equal(current.state.session?.approvals[0]?.kind, 'fileChange');
    const result = await state.service.request({ operation: 'resolveApproval', projectId, repositoryId, approvalId: current.state.session!.approvals[0]!.id, decision: 'decline' });
    assert.equal(result.ok, true); assert.deepEqual(state.runtime.responses, [{ id: 5, result: { decision: 'decline' } }]);
    state.runtime.notification({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed', items: [], error: null } } });
    state.runtime.notification({ method: 'thread/tokenUsage/updated', params: { threadId: 'thread-1', turnId: 'turn-1', tokenUsage: { total: { totalTokens: 12, inputTokens: 8, cachedInputTokens: 0, outputTokens: 4 }, modelContextWindow: null } } });
    assert.equal((await state.service.request({ operation: 'getState' })).state.session?.usage?.totalTokens, 12);
  } finally { await state.close(); }
});

test('revoked drivers and rebound folders cannot release a pending execution request', async () => {
  for (const change of ['role', 'folder', 'account'] as const) {
    const state = await fixture();
    try {
      await writable(state); state.runtime.serverRequest(approvalRequest(1, state.folder));
      const pending = (await state.service.request({ operation: 'getState' })).state.session!.approvals[0]!;
      if (change === 'role') state.setAllowed(false);
      if (change === 'folder') { const other = path.join(state.directory, 'moved'); await mkdir(other); state.setFolder(other); }
      if (change === 'account') state.setAccount(nexusAccount('other-user'));
      const result = await state.service.request({ operation: 'resolveApproval', projectId, repositoryId, approvalId: pending.id, decision: 'acceptOnce' });
      assert.equal(result.ok, false); assert.equal(result.state.policy, 'readOnly');
      assert.deepEqual(state.runtime.responses, [{ id: 1, result: { decision: 'decline' } }]);
    } finally { await state.close(); }
  }
});

test('current-turn output uses real exit status, reports and bounded relative diffs; late turns cannot revive state', async () => {
  const state = await fixture();
  try {
    await writable(state);
    const emit = (method: string, params: Record<string, unknown>) => state.runtime.notification({ method, params: { threadId: 'thread-1', turnId: 'turn-1', ...params } });
    emit('item/commandExecution/outputDelta', { itemId: 'cmd', delta: '\u001b[31mfirst\u001b[0m\r\n' });
    emit('item/completed', { item: { type: 'commandExecution', id: 'cmd', command: 'node --test', aggregatedOutput: 'TAP version 13\n1..2\n# tests 2\n# pass 1\n# fail 1\n# skipped 0\n# duration_ms 8.4', exitCode: 1, durationMs: 12, status: 'completed' } });
    emit('item/commandExecution/outputDelta', { itemId: 'huge', delta: 'x'.repeat(40000) });
    emit('turn/diff/updated', { diff: 'diff --git a/source.ts b/source.ts\n--- a/source.ts\n+++ b/source.ts\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/.env b/.env\n--- a/.env\n+++ b/.env\n+private-value\n' });
    emit('item/completed', { item: { type: 'fileChange', id: 'files', status: 'completed', changes: [{ path: path.join(state.folder, 'source.ts'), kind: { type: 'update', move_path: null }, diff: '-old\n+new' }, { path: path.join(state.directory, 'outside'), kind: { type: 'add' }, diff: '+outside' }] } });
    let result = await state.service.request({ operation: 'getState' });
    assert.equal(result.state.session?.activities.find(value => value.id === 'cmd')?.status, 'failed');
    assert.equal(result.state.session?.activities.find(value => value.id === 'cmd')?.exitCode, 1);
    assert.equal(result.state.session?.activities.find(value => value.id === 'huge')?.detail.length, 32768);
    assert.equal(result.state.session?.activities.find(value => value.id === 'huge')?.outputTruncated, true);
    assert.equal(result.state.session?.testReports[0]?.failed, 1);
    assert.equal(result.state.session?.fileChanges.length, 1); assert.equal(result.state.session?.fileChanges[0]?.path, 'source.ts');
    assert.match(result.state.session!.diff, /\+new/); assert.equal(result.state.session!.diff.includes('private-value'), false);
    emit('turn/completed', { turn: { id: 'turn-1', status: 'completed', items: [], error: null } });
    await state.service.request(send);
    emit('turn/started', { turn: { id: 'turn-1', status: 'inProgress', items: [], error: null } });
    emit('item/commandExecution/outputDelta', { itemId: 'stale', delta: 'old-turn output' });
    emit('turn/completed', { turn: { id: 'turn-1', status: 'failed', items: [], error: null } });
    result = await state.service.request({ operation: 'getState' });
    assert.equal(result.state.session?.turnId, 'turn-2'); assert.equal(result.state.session?.status, 'running');
    assert.equal(result.state.session?.activities.some(value => value.id === 'stale'), false);
    assert.equal(result.state.session?.testReports.length, 0); assert.equal(result.state.session?.diff, '');
  } finally { await state.close(); }
});

test('report recognition refuses arbitrary success, partial summaries, impossible counts and oversized output', () => {
  assert.equal(terminalText('\u001b]0;title\u0007\u001b[32mOK\u001b[0m\u0000'), 'OK');
  for (const value of ['all tests passed', 'TAP version 13\n1..2\n# tests 2\n# pass 2', 'TAP version 13\n1..2\n# tests 2\n# pass 5\n# fail 0\n# skipped 0', 'x'.repeat(32769)]) assert.equal(testReport('command', value), null);
  const report = testReport('command', JSON.stringify({ numTotalTests: 3, numPassedTests: 2, numFailedTests: 0, numPendingTests: 1, success: true, testResults: [] }));
  assert.equal(report?.format, 'jest-json'); assert.equal(report?.skipped, 1);
});

test('file acceptance requires all current item diffs, and aggregate diff content remains bounded', async () => {
  const state = await fixture();
  try {
    await writable(state);
    const ask = (rpcId: number, itemId: string) => state.runtime.serverRequest({ id: rpcId, method: 'item/fileChange/requestApproval', params: { threadId: 'thread-1', turnId: 'turn-1', itemId, startedAtMs: Date.now(), grantRoot: null } });
    const changes = (itemId: string, values: unknown[]) => state.runtime.notification({ method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { id: itemId, type: 'fileChange', status: 'inProgress', changes: values } } });
    const decide = async () => {
      const current = await state.service.request({ operation: 'getState' });
      return state.service.request({ operation: 'resolveApproval', projectId, repositoryId, approvalId: current.state.session!.approvals[0]!.id, decision: 'acceptOnce' });
    };
    ask(201, 'missing'); assert.equal((await decide()).ok, false);
    changes('full', [{ path: 'source.ts', kind: { type: 'update', move_path: null }, diff: '-old\n+new' }]);
    ask(202, 'full'); assert.equal((await decide()).ok, true);
    changes('filtered', [{ path: 'source.ts', kind: { type: 'update' }, diff: '-old\n+new' }, { path: '../outside.ts', kind: { type: 'add' }, diff: '+hidden' }]);
    ask(203, 'filtered'); assert.equal((await decide()).ok, false);
    changes('large', [{ path: 'large.ts', kind: { type: 'add' }, diff: 'x'.repeat(65537) }]);
    ask(204, 'large'); assert.equal((await decide()).ok, false);
    changes('budget', Array.from({ length: 50 }, (_, index) => ({ path: `file-${index}.ts`, kind: { type: 'add' }, diff: '界'.repeat(21000) })));
    let result = await state.service.request({ operation: 'getState' });
    assert.ok(result.state.session!.fileChanges.reduce((total, change) => total + Buffer.byteLength(change.diff), 0) <= 262144);
    assert.ok(result.state.session!.fileChanges.some(change => change.truncated));
    ask(205, 'budget'); assert.equal((await decide()).ok, false);
    result = await state.service.request({ operation: 'getState' }); assert.equal(result.state.session!.approvals.length, 0);
    assert.deepEqual(state.runtime.responses.map(value => ({ id: value.id, result: value.result })), [201, 202, 203, 204, 205].map(id => ({ id, result: { decision: id === 202 ? 'accept' : 'decline' } })));
  } finally { await state.close(); }
});

test('approval commands with invisible control or bidi characters are denied without altering a permitted command', async () => {
  const state = await fixture();
  try {
    await writable(state);
    ['node\u0000hidden', 'node\u001b[31mhidden', 'node\u007fhidden', 'node\u202ehidden', 'node\u2066hidden'].forEach((command, index) => state.runtime.serverRequest(approvalRequest(300 + index, state.folder, { command })));
    const command = 'node\tlocal.mjs\r\nnode second.mjs';
    state.runtime.serverRequest(approvalRequest(310, state.folder, { command }));
    const result = await state.service.request({ operation: 'getState' });
    assert.equal(result.state.session?.approvals.length, 1); assert.equal(result.state.session?.approvals[0]?.command, command);
    assert.equal(state.runtime.responses.length, 5); assert.ok(state.runtime.responses.every(value => (value.result as { decision: string }).decision === 'decline'));
  } finally { await state.close(); }
});

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { CODEX_VERSION, CodexProcess, CodexProcessError, isolatedEnvironment } from '../dist/src/process.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const isCode = (code) => (error) => error instanceof CodexProcessError && error.code === code;

async function fixture(t, settings = {}) {
  const home = await mkdtemp(join(tmpdir(), 'nexus-codex-bridge-'));
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), pid: 12345,
  });
  const frames = [];
  const sent = new EventEmitter();
  let input = '';
  let spawnCalls = 0;
  let terminated = 0;
  let spawnArgs;
  let spawnOptions;
  const output = (value) => child.stdout.write(`${JSON.stringify(value)}\n`);
  child.stdin.on('data', (data) => {
    input += data.toString();
    for (;;) {
      const index = input.indexOf('\n');
      if (index === -1) break;
      const line = input.slice(0, index);
      input = input.slice(index + 1);
      const value = JSON.parse(line);
      frames.push(value);
      sent.emit('frame', value);
      if (value.method === 'initialize' && !settings.noHandshake) {
        queueMicrotask(() => output({ id: value.id, result: { userAgent: 'fixture', codexHome: home, platformFamily: 'test', platformOs: 'test' } }));
      }
    }
  });
  const bridge = new CodexProcess({ executable: process.execPath, home, clientVersion: '0.5.0' }, {
    version: settings.versionCheck ?? (async () => settings.version ?? `codex-cli ${CODEX_VERSION}\n`),
    spawn: (_executable, args, options) => { spawnCalls++; spawnArgs = args; spawnOptions = options; return child; },
    terminate: async () => {
      terminated++;
      if (settings.closeDelay) setTimeout(() => child.emit('close', 0, null), settings.closeDelay);
      else queueMicrotask(() => child.emit('close', 0, null));
    },
    requestTimeoutMs: settings.timeout ?? 1_000,
  });
  t.after(async () => { await bridge.dispose(); await rm(home, { recursive: true, force: true }); });
  const nextFrame = (method) => new Promise((resolve) => {
    const listener = (frame) => {
      if (frame.method !== method) return;
      sent.off('frame', listener);
      resolve(frame);
    };
    sent.on('frame', listener);
  });
  return {
    bridge, child, frames, output, nextFrame,
    get spawnCalls() { return spawnCalls; }, get terminated() { return terminated; },
    get spawnArgs() { return spawnArgs; }, get spawnOptions() { return spawnOptions; }, home,
  };
}

test('pins runtime, isolates credentials and performs initialize/initialized before requests', async (t) => {
  const f = await fixture(t);
  await Promise.all([f.bridge.start(), f.bridge.start()]);
  assert.equal(f.spawnCalls, 1);
  assert.deepEqual(f.spawnArgs, ['app-server', '--listen', 'stdio://', '-c', 'cli_auth_credentials_store="keyring"', '-c', 'analytics.enabled=false', '-c', 'model_provider="openai"']);
  assert.equal(f.spawnOptions.cwd, f.home);
  assert.equal(f.spawnOptions.env.CODEX_HOME, f.home);
  assert.equal(f.spawnOptions.shell, false);
  assert.equal(f.spawnOptions.windowsHide, true);
  assert.equal(f.frames[0].method, 'initialize');
  assert.deepEqual(f.frames[0].params.capabilities, { experimentalApi: false, requestAttestation: false });
  assert.equal(f.frames[0].params.clientInfo.name, 'nexus_ai');
  assert.equal(f.frames[1].method, 'initialized');
  const frame = f.nextFrame('account/read');
  const result = f.bridge.request('account/read', { refreshToken: false });
  f.output({ id: (await frame).id, result: { account: null, requiresOpenaiAuth: true } });
  assert.deepEqual(await result, { account: null, requiresOpenaiAuth: true });
});

test('incompatible version fails before spawn and does not expose runtime output', async (t) => {
  const f = await fixture(t, { version: 'codex-cli 0.1.0 private-value' });
  await assert.rejects(f.bridge.start(), isCode('runtime_version'));
  assert.equal(f.spawnCalls, 0);
});

test('environment excludes app credentials, ambient API keys and runtime injection', () => {
  const env = isolatedEnvironment('/isolated', {
    PATH: '/bin', SystemRoot: 'C:\\Windows', DATABASE_URL: 'private', SMTP_PASSWORD: 'private',
    OPENAI_API_KEY: 'private', CODEX_API_KEY: 'private', CODEX_HOME: '/other-app',
    NODE_OPTIONS: '--require=untrusted', ELECTRON_RUN_AS_NODE: '1',
    DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/keyring', HTTPS_PROXY: 'http://proxy.local',
  });
  assert.deepEqual(env, {
    PATH: '/bin', SystemRoot: 'C:\\Windows', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/keyring',
    HTTPS_PROXY: 'http://proxy.local', CODEX_HOME: '/isolated',
  });
});

test('fragmented UTF-8, batched frames and concurrent out-of-order responses retain correlation', async (t) => {
  const f = await fixture(t);
  await f.bridge.start();
  const notifications = [];
  f.bridge.onNotification((value) => notifications.push(value));
  const firstFrame = f.nextFrame('account/read');
  const first = f.bridge.request('account/read', { refreshToken: false });
  const secondFrame = f.nextFrame('model/list');
  const second = f.bridge.request('model/list', {});
  const firstId = (await firstFrame).id;
  const secondId = (await secondFrame).id;
  const content = Buffer.from([
    JSON.stringify({ method: 'item/agentMessage/delta', params: { delta: 'città 🌙' } }),
    JSON.stringify({ id: secondId, result: { data: [], nextCursor: null } }),
    JSON.stringify({ id: firstId, result: { account: null, requiresOpenaiAuth: true } }),
    '',
  ].join('\n'));
  for (const byte of content) f.child.stdout.write(Buffer.from([byte]));
  assert.equal((await first).account, null);
  assert.deepEqual((await second).data, []);
  assert.equal(notifications[0].params.delta, 'città 🌙');
});

test('server requests are consumed once and unsupported requests fail closed without listeners', async (t) => {
  const f = await fixture(t);
  await f.bridge.start();
  f.output({ id: 'unsupported-1', method: 'future/request', params: {} });
  await tick();
  const denied = f.frames.find((value) => value.id === 'unsupported-1');
  assert.equal(denied.error.code, -32601);
  const incoming = [];
  f.bridge.onServerRequest((value) => incoming.push(value));
  f.output({ id: 999, method: 'item/commandExecution/requestApproval', params: { command: 'fixture' } });
  await f.bridge.respond(999, { decision: 'decline' });
  await assert.rejects(f.bridge.respond(999, { decision: 'accept' }), isCode('stale_request'));
  assert.equal(incoming.length, 1);
  assert.equal(f.frames.filter((value) => value.id === 999).length, 1);
});

test('malformed frame terminates the process and rejects pending operations safely', async (t) => {
  const f = await fixture(t);
  await f.bridge.start();
  const exits = [];
  f.bridge.onExit((value) => exits.push(value));
  const result = f.bridge.request('account/read', { refreshToken: false });
  const rejected = assert.rejects(result, isCode('protocol'));
  f.child.stderr.write('private-stderr-token');
  f.child.stdout.write('{private-broken-json\n');
  await rejected;
  assert.equal(f.terminated, 1);
  assert.equal(exits.length, 1);
  assert.equal(exits[0].includes('private'), false);
});

test('oversized unterminated frame is bounded and invalid UTF-8 fails closed', async (t) => {
  const f = await fixture(t);
  await f.bridge.start();
  f.child.stdout.write(Buffer.alloc(8 * 1024 * 1024 + 1, 97));
  assert.equal(f.terminated, 1);
  const other = await fixture(t);
  await other.bridge.start();
  other.child.stdout.write(Buffer.from([0xff, 10]));
  assert.equal(other.terminated, 1);
});

test('request timeout ignores late reply and permits a later independent request', async (t) => {
  const f = await fixture(t, { timeout: 150 });
  await f.bridge.start();
  const frame = f.nextFrame('account/read');
  const result = f.bridge.request('account/read', { refreshToken: false });
  const id = (await frame).id;
  await assert.rejects(result, isCode('timeout'));
  f.output({ id, result: { account: { type: 'apiKey' }, requiresOpenaiAuth: true } });
  const secondFrame = f.nextFrame('account/read');
  const second = f.bridge.request('account/read', { refreshToken: false });
  f.output({ id: (await secondFrame).id, result: { account: null, requiresOpenaiAuth: true } });
  assert.equal((await second).account, null);
});

test('startup timeout, crash and provider failures never expose raw messages', async (t) => {
  const startup = await fixture(t, { timeout: 100, noHandshake: true });
  await assert.rejects(startup.bridge.start(), isCode('timeout'));
  assert.equal(startup.terminated, 1);
  const f = await fixture(t);
  await f.bridge.start();
  const frame = f.nextFrame('account/read');
  const result = f.bridge.request('account/read', { refreshToken: false });
  f.output({ id: (await frame).id, error: { code: -32000, message: 'private-account-token' } });
  await assert.rejects(result, (error) => error.code === 'request_failed' && !error.message.includes('private'));
  const pending = f.bridge.request('account/read', { refreshToken: false });
  const rejected = assert.rejects(pending, isCode('runtime_exit'));
  f.child.emit('exit', 1, null);
  await rejected;
  await assert.rejects(f.bridge.request('model/list', {}), isCode('not_started'));
});

test('pending operations are bounded and disposal rejects pending requests without replay', async (t) => {
  const f = await fixture(t);
  await f.bridge.start();
  const pending = Array.from({ length: 128 }, () => f.bridge.request('model/list', {}));
  const results = Promise.allSettled(pending);
  await assert.rejects(f.bridge.request('model/list', {}), isCode('busy'));
  await f.bridge.dispose();
  assert.equal((await results).every((value) => value.status === 'rejected' && value.reason.code === 'disposed'), true);
  await assert.rejects(f.bridge.start(), isCode('disposed'));
  await f.bridge.dispose();
  assert.equal(f.terminated, 1);
});

test('dispose waits for close after the termination command has already returned', async (t) => {
  const f = await fixture(t, { closeDelay: 40 });
  await f.bridge.start();
  let finished = false;
  const disposing = f.bridge.dispose().then(() => { finished = true; });
  await tick();
  assert.equal(f.terminated, 1);
  assert.equal(finished, false);
  await disposing;
  assert.equal(finished, true);
});

test('dispose during version probe waits for it and prevents a late server spawn', async (t) => {
  let release;
  let probeStarted;
  const started = new Promise((resolve) => { probeStarted = resolve; });
  const version = new Promise((resolve) => { release = resolve; });
  const f = await fixture(t, { versionCheck: async () => { probeStarted(); return version; } });
  const startRejected = assert.rejects(f.bridge.start(), isCode('disposed'));
  await started;
  let finished = false;
  const disposing = f.bridge.dispose().then(() => { finished = true; });
  await tick();
  assert.equal(finished, false);
  release(`codex-cli ${CODEX_VERSION}\n`);
  await startRejected;
  await disposing;
  assert.equal(f.spawnCalls, 0);
});

test('dispose during handshake rejects startup and waits for the started child to close', async (t) => {
  const f = await fixture(t, { noHandshake: true, closeDelay: 40 });
  const initialized = f.nextFrame('initialize');
  const startRejected = assert.rejects(f.bridge.start(), isCode('disposed'));
  await initialized;
  await f.bridge.dispose();
  await startRejected;
  assert.equal(f.terminated, 1);
});

import { execFile, spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { CLIENT_METHODS } from './protocol.js';
import type { CodexMethod, CodexParams, CodexResponse, CodexResponses } from './protocol.js';

export const CODEX_VERSION = '0.159.2';
const MAX_LINE_BYTES = 8 * 1024 * 1024;
const MAX_QUEUED_BYTES = 16 * 1024 * 1024;
const MAX_PENDING = 128;
const MAX_SERVER_PENDING = 32;
const SERVER_REQUEST_TIMEOUT_MS = 120_000;

export type CodexErrorCode = 'runtime_missing' | 'runtime_version' | 'runtime_exit' | 'protocol' |
  'timeout' | 'busy' | 'disposed' | 'not_started' | 'request_failed' | 'stale_request';
const ERROR_MESSAGES: Record<CodexErrorCode, string> = {
  runtime_missing: 'Codex could not start. Reinstall the Nexus AI runtime.',
  runtime_version: `Nexus AI requires Codex ${CODEX_VERSION}. Rebuild or reinstall the application.`,
  runtime_exit: 'Codex stopped. Reconnect the local runtime before retrying.',
  protocol: 'Codex returned an invalid protocol message. Reconnect the local runtime.',
  timeout: 'Codex did not respond in time. Check the local runtime and retry.',
  busy: 'Codex has too many pending operations. Wait for the current operation.',
  disposed: 'The local Codex runtime has been closed.',
  not_started: 'Connect the local Codex runtime before retrying.',
  request_failed: 'Codex could not complete this operation. Check account access and local permissions.',
  stale_request: 'This Codex request has expired or was already answered.',
};

/** Errors never include provider messages, stderr, command lines, params or account tokens. */
export class CodexProcessError extends Error {
  constructor(readonly code: CodexErrorCode) { super(ERROR_MESSAGES[code]); this.name = 'CodexProcessError'; }
}
export interface CodexProcessOptions { executable: string; home: string; clientVersion: string }
export interface CodexNotification { method: string; params: unknown }
export interface CodexServerRequest extends CodexNotification { id: string | number }
interface Pending { resolve: (result: unknown) => void; reject: (error: CodexProcessError) => void; timer: NodeJS.Timeout }

/** Internal transport seam: fixtures exercise byte streams without launching inference. */
export interface ProcessDependencies {
  version: (executable: string, options: SpawnOptionsWithoutStdio) => Promise<string>;
  spawn: (executable: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;
  terminate: (child: ChildProcessWithoutNullStreams) => Promise<void>;
  requestTimeoutMs: number;
}

/** Inherit only OS/tool discovery, certificate, proxy and OS keyring settings. */
export function isolatedEnvironment(home: string, source = process.env): NodeJS.ProcessEnv {
  const allowed = new Set([
    'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'SYSTEMDRIVE', 'TEMP', 'TMP', 'TMPDIR',
    'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'USERNAME', 'USER', 'LOGNAME', 'APPDATA',
    'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'NUMBER_OF_PROCESSORS',
    'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TERM', 'COLORTERM',
    'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
    'XDG_CACHE_HOME', 'DISPLAY', 'WAYLAND_DISPLAY', 'GNOME_KEYRING_CONTROL', 'SSH_AUTH_SOCK',
    'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
    'NODE_EXTRA_CA_CERTS', 'CURL_CA_BUNDLE', 'REQUESTS_CA_BUNDLE',
  ]);
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined && allowed.has(name.toUpperCase())) env[name] = value;
  }
  env.CODEX_HOME = home;
  return env;
}

async function terminateTree(child: ChildProcessWithoutNullStreams): Promise<void> {
  const pid = child.pid;
  if (!pid) return;
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? 'C:\\Windows';
    await new Promise<void>((resolve) => {
      // Fixed executable, numeric PID and no shell: never targets another tree by name.
      execFile(join(systemRoot, 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'],
        { windowsHide: true, timeout: 5_000, maxBuffer: 16_384 }, () => resolve());
    });
  } else {
    try { process.kill(-pid, 'SIGTERM'); } catch { /* The process group may have exited. */ }
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    try { process.kill(-pid, 'SIGKILL'); } catch { /* Already terminated. */ }
  }
  try { child.kill('SIGKILL'); } catch { /* Already terminated. */ }
}

const dependencies: ProcessDependencies = {
  version: (executable, options) => new Promise<string>((resolve, reject) => {
    execFile(executable, ['--version'], { ...options, timeout: 8_000, maxBuffer: 16_384 }, (error, stdout) => {
      if (error) reject(new CodexProcessError('runtime_missing'));
      else resolve(String(stdout));
    });
  }),
  spawn: (executable, args, options) => spawn(executable, args, { ...options, stdio: ['pipe', 'pipe', 'pipe'] }),
  terminate: terminateTree,
  requestTimeoutMs: 30_000,
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function requestId(value: unknown): value is string | number {
  return (typeof value === 'number' && Number.isSafeInteger(value)) ||
    (typeof value === 'string' && value.length > 0 && value.length <= 128);
}

/** One isolated, version-pinned local process; this instance is never restarted implicitly. */
export class CodexProcess {
  private child: ChildProcessWithoutNullStreams | undefined;
  private startPromise: Promise<void> | undefined;
  private stopPromise: Promise<void> | undefined;
  private ready = false;
  private disposed = false;
  private failed = false;
  private childClosed = false;
  private nextId = 0;
  private input = Buffer.alloc(0);
  private stderr = Buffer.alloc(0);
  private queuedBytes = 0;
  private writes = Promise.resolve();
  private readonly pending = new Map<number, Pending>();
  private readonly serverPending = new Map<string | number, NodeJS.Timeout>();
  private readonly notifications = new Set<(value: CodexNotification) => void>();
  private readonly requests = new Set<(value: CodexServerRequest) => void>();
  private readonly exits = new Set<(reason: string) => void>();

  constructor(private readonly options: CodexProcessOptions, private readonly deps = dependencies) {}

  start(): Promise<void> {
    if (this.disposed) return Promise.reject(new CodexProcessError('disposed'));
    this.startPromise ??= this.initialize();
    return this.startPromise;
  }

  private async initialize(): Promise<void> {
    if (!isAbsolute(this.options.executable) || !isAbsolute(this.options.home)) throw new CodexProcessError('runtime_missing');
    try {
      await mkdir(this.options.home, { recursive: true, mode: 0o700 });
      if (this.disposed) throw new CodexProcessError('disposed');
      const options: SpawnOptionsWithoutStdio = {
        cwd: this.options.home, env: isolatedEnvironment(this.options.home), shell: false,
        windowsHide: true, detached: process.platform !== 'win32',
      };
      const version = await this.deps.version(this.options.executable, options);
      if (version.trim() !== `codex-cli ${CODEX_VERSION}`) throw new CodexProcessError('runtime_version');
      if (this.disposed) throw new CodexProcessError('disposed');
      const child = this.deps.spawn(this.options.executable, [
        'app-server', '--listen', 'stdio://', '-c', 'cli_auth_credentials_store="keyring"',
        '-c', 'analytics.enabled=false', '-c', 'model_provider="openai"',
      ], options);
      this.child = child;
      child.once('close', () => { this.childClosed = true; });
      child.stdout.on('data', (data: Buffer | string) => this.read(Buffer.isBuffer(data) ? data : Buffer.from(data)));
      child.stderr.on('data', (data: Buffer | string) => {
        // Only a bounded private tail is retained; never exposed, persisted or logged.
        this.stderr = Buffer.concat([this.stderr, Buffer.isBuffer(data) ? data : Buffer.from(data)]).subarray(-16_384);
      });
      child.on('error', () => this.fail('runtime_missing'));
      child.on('exit', () => this.fail('runtime_exit'));
      child.stdout.on('error', () => this.fail('protocol'));
      child.stdin.on('error', () => this.fail('runtime_exit'));
      await this.sendRequest('initialize', {
        clientInfo: { name: 'nexus_ai', title: 'Nexus AI', version: this.options.clientVersion },
        capabilities: { experimentalApi: false, requestAttestation: false },
      });
      await this.write({ method: 'initialized' });
      if (this.failed || this.disposed) throw new CodexProcessError('runtime_exit');
      this.ready = true;
    } catch (error) {
      const safeError = error instanceof CodexProcessError ? error : new CodexProcessError('runtime_missing');
      this.fail(safeError.code);
      throw safeError;
    }
  }

  request<M extends CodexMethod>(method: M, params: CodexParams<M>): Promise<CodexResponse<M>> {
    if (this.disposed) return Promise.reject(new CodexProcessError('disposed'));
    if (!this.ready || this.failed) return Promise.reject(new CodexProcessError('not_started'));
    if (!CLIENT_METHODS.has(method)) return Promise.reject(new CodexProcessError('protocol'));
    return this.sendRequest(method, params);
  }

  private sendRequest<M extends keyof CodexResponses>(method: M, params: CodexParams<M>): Promise<CodexResponse<M>> {
    if (this.pending.size >= MAX_PENDING) return Promise.reject(new CodexProcessError('busy'));
    const id = ++this.nextId;
    return new Promise<CodexResponse<M>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CodexProcessError('timeout'));
      }, this.deps.requestTimeoutMs);
      this.pending.set(id, { timer, resolve: (value) => resolve(value as CodexResponse<M>), reject });
      void this.write({ id, method, ...(params === undefined ? {} : { params }) }).catch((error: unknown) => {
        const operation = this.pending.get(id);
        if (!operation) return;
        clearTimeout(operation.timer);
        this.pending.delete(id);
        operation.reject(error instanceof CodexProcessError ? error : new CodexProcessError('runtime_exit'));
      });
    });
  }

  private write(message: unknown): Promise<void> {
    if (this.disposed || this.failed || !this.child || this.child.stdin.destroyed) return Promise.reject(new CodexProcessError('runtime_exit'));
    let data: Buffer;
    try { data = Buffer.from(`${JSON.stringify(message)}\n`); }
    catch { return Promise.reject(new CodexProcessError('protocol')); }
    if (data.length > MAX_LINE_BYTES || this.queuedBytes + data.length > MAX_QUEUED_BYTES) return Promise.reject(new CodexProcessError('busy'));
    this.queuedBytes += data.length;
    const operation = this.writes.then(() => new Promise<void>((resolve, reject) => {
      if (this.failed || this.disposed || !this.child || this.child.stdin.destroyed) { reject(new CodexProcessError('runtime_exit')); return; }
      // The write callback gates the next frame, including when the stream applies backpressure.
      this.child.stdin.write(data, (error) => error ? reject(new CodexProcessError('runtime_exit')) : resolve());
    }));
    const finished = operation.finally(() => { this.queuedBytes -= data.length; });
    this.writes = finished.catch(() => {});
    return finished;
  }

  private read(data: Buffer): void {
    if (this.failed || this.disposed) return;
    // Process complete lines before applying the bound: one chunk may contain many frames.
    let offset = 0;
    while (offset < data.length) {
      const newline = data.indexOf(10, offset);
      const end = newline === -1 ? data.length : newline;
      if (this.input.length + end - offset > MAX_LINE_BYTES) { this.fail('protocol'); return; }
      this.input = Buffer.concat([this.input, data.subarray(offset, end)]);
      if (newline === -1) return;
      const line = this.input;
      this.input = Buffer.alloc(0);
      offset = newline + 1;
      if (line.length === 0 || (line.length === 1 && line[0] === 13)) continue;
      try {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(line);
        const value: unknown = JSON.parse(decoded);
        if (!record(value) || (value.jsonrpc !== undefined && value.jsonrpc !== '2.0')) { this.fail('protocol'); return; }
        this.message(value);
        if (this.failed) return;
      } catch { this.fail('protocol'); return; }
    }
  }

  private message(value: Record<string, unknown>): void {
    if ('method' in value) {
      if (typeof value.method !== 'string' || !/^[A-Za-z][A-Za-z0-9_/-]{0,199}$/.test(value.method) || 'result' in value || 'error' in value) { this.fail('protocol'); return; }
      if (!('id' in value)) {
        for (const listener of this.notifications) { try { listener({ method: value.method, params: value.params }); } catch { /* A consumer cannot crash the transport. */ } }
        return;
      }
      if (!requestId(value.id) || this.serverPending.has(value.id)) { this.fail('protocol'); return; }
      const id = value.id;
      if (this.serverPending.size >= MAX_SERVER_PENDING) {
        void this.write({ id, error: { code: -32000, message: 'Too many pending local requests.' } }).catch(() => this.fail('runtime_exit'));
        return;
      }
      this.serverPending.set(id, setTimeout(() => { void this.reject(id).catch(() => {}); }, SERVER_REQUEST_TIMEOUT_MS));
      if (this.requests.size === 0) { void this.reject(id).catch(() => {}); return; }
      for (const listener of this.requests) {
        try { listener({ id, method: value.method, params: value.params }); }
        catch { void this.reject(id).catch(() => {}); }
      }
      return;
    }
    if (!requestId(value.id) || ('result' in value) === ('error' in value)) { this.fail('protocol'); return; }
    if ('error' in value && (!record(value.error) || !Number.isSafeInteger(value.error.code))) { this.fail('protocol'); return; }
    const pending = typeof value.id === 'number' ? this.pending.get(value.id) : undefined;
    if (!pending) return; // Late replies to timed-out requests are never reused.
    this.pending.delete(value.id as number);
    clearTimeout(pending.timer);
    if ('error' in value) pending.reject(new CodexProcessError('request_failed'));
    else pending.resolve(value.result);
  }

  respond(id: string | number, result: unknown): Promise<void> {
    const timer = this.serverPending.get(id);
    if (!timer) return Promise.reject(new CodexProcessError('stale_request'));
    clearTimeout(timer);
    this.serverPending.delete(id); // Consume before async IO: replay cannot approve twice.
    return this.write({ id, result });
  }

  reject(id: string | number, message?: string): Promise<void> {
    // Callers may supply context, but it must never be reflected to the provider or logs.
    void message;
    const timer = this.serverPending.get(id);
    if (!timer) return Promise.reject(new CodexProcessError('stale_request'));
    clearTimeout(timer);
    this.serverPending.delete(id);
    return this.write({ id, error: { code: -32601, message: 'This local Codex request was not approved or is unsupported.' } });
  }

  onNotification(listener: (value: CodexNotification) => void): () => void { this.notifications.add(listener); return () => { this.notifications.delete(listener); }; }
  onServerRequest(listener: (value: CodexServerRequest) => void): () => void { this.requests.add(listener); return () => { this.requests.delete(listener); }; }
  onExit(listener: (reason: string) => void): () => void { this.exits.add(listener); return () => { this.exits.delete(listener); }; }

  private fail(code: CodexErrorCode): void {
    if (this.failed || this.disposed) return;
    this.failed = true;
    this.ready = false;
    this.clear(new CodexProcessError(code));
    for (const listener of this.exits) { try { listener(ERROR_MESSAGES[code]); } catch { /* No secret or consumer exception escapes. */ } }
    void this.stop().catch(() => {});
  }

  private clear(error: CodexProcessError): void {
    for (const operation of this.pending.values()) { clearTimeout(operation.timer); operation.reject(error); }
    this.pending.clear();
    for (const timer of this.serverPending.values()) clearTimeout(timer);
    this.serverPending.clear();
    this.input = Buffer.alloc(0);
    this.stderr = Buffer.alloc(0);
  }

  private stop(): Promise<void> {
    this.stopPromise ??= (async () => {
      const child = this.child;
      if (!child) return;
      // Register before ending stdin or killing: Windows may release the cwd after taskkill
      // returns. Only close confirms that both the process and its stdio handles are done.
      const closed = this.childClosed ? Promise.resolve() : new Promise<void>((resolve, reject) => {
        const completed = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => {
          child.off('close', completed);
          reject(new CodexProcessError('timeout'));
        }, 6_000);
        child.once('close', completed);
      });
      // A slow taskkill may still be pending when the close deadline fires.
      void closed.catch(() => {});
      try {
        child.stdin.end();
        await this.deps.terminate(child).catch(() => {});
        await closed;
      } finally {
        child.stdout.destroy();
        child.stderr.destroy();
        child.stdin.destroy();
        this.stderr = Buffer.alloc(0);
      }
    })();
    return this.stopPromise;
  }

  async dispose(): Promise<void> {
    if (!this.disposed) {
      this.disposed = true;
      this.ready = false;
      this.clear(new CodexProcessError('disposed'));
      this.notifications.clear(); this.requests.clear(); this.exits.clear();
    }
    // The version probe also owns a native process. Its bounded execFile callback must
    // complete before disposal returns; initialize checks disposed before app-server spawn.
    await this.startPromise?.catch(() => {});
    await this.stop();
  }
}

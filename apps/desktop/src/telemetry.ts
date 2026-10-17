import { cpus, freemem, totalmem } from 'node:os';
import { realpath, stat } from 'node:fs/promises';
import {
  telemetryRequestSchema, telemetryResponseSchema, type NexusAuthState, type TelemetryRequest,
  type TelemetryResponse, type TelemetryState, type CollaborationResponse,
} from '@nexus-ai/contracts';
import type { LocalBindingStorage } from './local-bindings.js';

interface DeviceReading {
  cpu: { idle: number; total: number } | null;
  memoryTotalBytes: number;
  memoryFreeBytes: number;
}
interface Dependencies {
  auth: {
    getState(): Promise<NexusAuthState>;
    authorizeRepository(projectId: string, repositoryId: string): Promise<{ userId: string } | Exclude<CollaborationResponse, { ok: true }>>;
  };
  bindings: Pick<LocalBindingStorage, 'get'>;
  /** Deterministic native sampling/time seams for tests; never renderer parameters. */
  readDevice?: () => DeviceReading;
  now?: () => number;
  schedule?: (callback: () => Promise<void>, intervalMs: number) => () => void;
}
interface Scope {
  userId: string; projectId: string; repositoryId: string;
  cwd: string; deviceId: string; bindingUpdatedAt: string;
}
type Failure = Extract<TelemetryResponse, { ok: false }>;
const INTERVAL = 2000;
// Sampling stops if its consumer disappears; the timer never polls the account server.
const AUTHORIZATION_LEASE_MS = 10_000;
const LOCAL_NOTICE = 'CPU and memory describe this whole device, not Nexus alone. Samples stay local and are never shared. Network throughput is unavailable.';
const failure = (code: Failure['code'], message: string): Failure => ({ ok: false, code, message });

function nativeReading(): DeviceReading {
  const processors = cpus();
  const cpu = processors.length ? processors.reduce((sum, processor) => ({
    idle: sum.idle + processor.times.idle,
    total: sum.total + Object.values(processor.times).reduce((total, value) => total + value, 0),
  }), { idle: 0, total: 0 }) : null;
  return { cpu, memoryTotalBytes: totalmem(), memoryFreeBytes: freemem() };
}
function defaultSchedule(callback: () => Promise<void>, delay: number): () => void {
  const timer = setTimeout(() => { void callback(); }, delay);
  timer.unref();
  return () => clearTimeout(timer);
}
function sameScope(left: Scope | null, right: Scope): boolean {
  return left !== null && left.userId === right.userId && left.projectId === right.projectId &&
    left.repositoryId === right.repositoryId && left.cwd === right.cwd && left.deviceId === right.deviceId && left.bindingUpdatedAt === right.bindingUpdatedAt;
}

/** Aggregate local device metrics. No persistence, network transport, provider calls or implicit opt-in. */
export class DesktopTelemetry {
  private readonly dependencies: Dependencies;
  private readonly now: () => number;
  private readonly schedule: NonNullable<Dependencies['schedule']>;
  private account: { userId: string; expiresAt: number } | null = null;
  private authStatus: NexusAuthState['status'] | null = null;
  private scope: Scope | null = null;
  private generation = 0;
  private disposed = false;
  private enabled = false;
  private samples: TelemetryState['samples'] = [];
  private previousCpu: DeviceReading['cpu'] = null;
  private cancelTimer: (() => void) | null = null;
  private authorizedUntil = 0;
  private notice = LOCAL_NOTICE;
  private operations: Promise<unknown> = Promise.resolve();
  private requestedContext: string | null = null;

  constructor(dependencies: Dependencies) {
    this.dependencies = dependencies;
    this.now = dependencies.now ?? Date.now;
    this.schedule = dependencies.schedule ?? defaultSchedule;
  }

  private reset(notice = LOCAL_NOTICE): void {
    this.generation++;
    this.cancelTimer?.(); this.cancelTimer = null;
    this.enabled = false; this.samples = []; this.previousCpu = null; this.authorizedUntil = 0;
    this.scope = null; this.notice = notice;
  }

  nexusStateChanged(state: NexusAuthState): void {
    const account = state.status === 'signed_in' && state.user && state.expiresAt ? { userId: state.user.id, expiresAt: Date.parse(state.expiresAt) } : null;
    if (!account || this.authStatus !== 'signed_in' || this.account?.userId !== account.userId) this.reset();
    this.account = account;
    this.authStatus = state.status;
  }

  private current(generation: number, userId: string): boolean {
    return !this.disposed && generation === this.generation && this.authStatus === 'signed_in' &&
      this.account?.userId === userId && this.account.expiresAt > this.now();
  }

  private async bindingScope(userId: string, projectId: string, repositoryId: string): Promise<Scope | null> {
    const binding = await this.dependencies.bindings.get(userId, projectId, repositoryId);
    if (!binding || binding.projectId !== projectId || binding.repositoryId !== repositoryId) return null;
    try {
      const cwd = await realpath(binding.rootPath);
      if (!(await stat(cwd)).isDirectory()) return null;
      return { userId, projectId, repositoryId, cwd, deviceId: binding.deviceId, bindingUpdatedAt: binding.updatedAt };
    } catch { return null; }
  }

  private snapshot(projectId: string): TelemetryResponse {
    return telemetryResponseSchema.parse({ ok: true, state: {
      projectId, enabled: this.enabled, available: true, source: 'local_device', intervalMs: INTERVAL,
      samples: this.samples.map(sample => ({ ...sample })), networkBytesPerSecond: null, notice: this.notice,
    } });
  }

  async request(input: TelemetryRequest): Promise<TelemetryResponse> {
    const parsed = telemetryRequestSchema.safeParse(input);
    if (!parsed.success) return failure('invalid_request', 'The local device metrics request is invalid.');
    if (this.disposed) return failure('unavailable', 'Local device metrics are closed.');
    // A new context invalidates work already waiting on authorization or the filesystem.
    const context = `${parsed.data.projectId}:${parsed.data.repositoryId}`;
    if (this.requestedContext !== null && this.requestedContext !== context) this.reset();
    this.requestedContext = context;
    const generation = this.generation;
    const operation = this.operations.then(() => this.execute(parsed.data, generation)).catch(() => {
      if (generation === this.generation) this.reset('Local device metrics are unavailable. Enable monitoring to retry.');
      return failure('unavailable', 'Local device metrics are unavailable. Check the local repository and retry.');
    });
    this.operations = operation;
    return operation;
  }

  private async execute(request: TelemetryRequest, requestedGeneration: number): Promise<TelemetryResponse> {
    if (this.disposed || requestedGeneration !== this.generation) return failure('forbidden', 'The account or repository context changed. Retry in the current project.');
    const accountState = await this.dependencies.auth.getState();
    if (this.disposed || requestedGeneration !== this.generation) return failure('auth_required', 'Your Nexus account changed. Retry after signing in.');
    if (accountState.status !== 'signed_in' || !accountState.user || !accountState.expiresAt) {
      this.nexusStateChanged(accountState);
      return failure(accountState.status === 'unavailable' ? 'unavailable' : 'auth_required', 'Sign in to Nexus AI to access local device metrics.');
    }
    if (this.account?.userId !== accountState.user.id || this.authStatus !== 'signed_in') this.nexusStateChanged(accountState);
    else this.account.expiresAt = Date.parse(accountState.expiresAt);
    const generation = this.generation;
    const userId = accountState.user.id;
    if (!this.current(generation, userId)) { this.reset(); return failure('auth_required', 'Sign in to Nexus AI to access local device metrics.'); }
    const firstBinding = await this.bindingScope(userId, request.projectId, request.repositoryId);
    if (!this.current(generation, userId)) return failure('auth_required', 'Your Nexus account changed.');
    const authorized = await this.dependencies.auth.authorizeRepository(request.projectId, request.repositoryId);
    if (!this.current(generation, userId)) return failure('auth_required', 'Your Nexus account changed.');
    if ('ok' in authorized) {
      this.reset();
      return failure(authorized.code === 'auth_required' || authorized.code === 'unavailable' ? authorized.code : 'forbidden', 'Your current project role cannot access local device metrics.');
    }
    if (authorized.userId !== userId) { this.reset(); return failure('auth_required', 'Your Nexus account changed.'); }
    const currentBinding = await this.bindingScope(userId, request.projectId, request.repositoryId);
    if (!this.current(generation, userId)) return failure('auth_required', 'Your Nexus account changed.');
    if (!firstBinding || !currentBinding || !sameScope(firstBinding, currentBinding)) {
      this.reset();
      return failure('forbidden', 'Link the current local repository, then enable device metrics again.');
    }
    if (!sameScope(this.scope, currentBinding)) { this.reset(this.scope ? LOCAL_NOTICE : this.notice); this.scope = currentBinding; }
    this.authorizedUntil = this.now() + AUTHORIZATION_LEASE_MS;
    if (request.operation === 'setEnabled' && !request.enabled) {
      this.reset(); this.scope = currentBinding;
    } else if (request.operation === 'setEnabled' && request.enabled && !this.enabled) {
      this.enabled = true; this.notice = LOCAL_NOTICE;
      const sampleGeneration = this.generation;
      await this.sample(sampleGeneration);
      if (!this.current(sampleGeneration, userId) || !sameScope(this.scope, currentBinding)) return failure('forbidden', 'The account or repository context changed. Enable local device metrics in the current project.');
    }
    return this.snapshot(request.projectId);
  }

  private async sample(generation: number): Promise<void> {
    const scope = this.scope;
    if (generation !== this.generation || this.disposed) return;
    this.cancelTimer = null;
    if (!scope || !this.enabled) return;
    if (!this.current(generation, scope.userId)) { this.reset(); return; }
    if (this.now() >= this.authorizedUntil) { this.reset('Monitoring paused while the overview was inactive. Enable local device metrics to resume.'); return; }
    try {
      const binding = await this.bindingScope(scope.userId, scope.projectId, scope.repositoryId);
      if (!this.current(generation, scope.userId) || !this.enabled) { if (generation === this.generation) this.reset(); return; }
      if (!binding || !sameScope(scope, binding)) { this.reset('The local repository changed. Enable local device metrics in the current repository.'); return; }
      const reading = (this.dependencies.readDevice ?? nativeReading)();
      const total = reading.memoryTotalBytes;
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(reading.memoryFreeBytes) || reading.memoryFreeBytes < 0 || reading.memoryFreeBytes > total) throw new Error('Unavailable memory counters.');
      const cpu = reading.cpu;
      let cpuPercent: number | null = null;
      if (cpu && this.previousCpu) {
        const totalDelta = cpu.total - this.previousCpu.total;
        const idleDelta = cpu.idle - this.previousCpu.idle;
        if (Number.isFinite(totalDelta) && Number.isFinite(idleDelta) && totalDelta > 0 && idleDelta >= 0 && idleDelta <= totalDelta) cpuPercent = 100 * (1 - idleDelta / totalDelta);
      }
      this.previousCpu = cpu ? { ...cpu } : null;
      const memoryUsedBytes = total - reading.memoryFreeBytes;
      this.samples = [...this.samples, { at: new Date(this.now()).toISOString(), cpuPercent, memoryPercent: 100 * memoryUsedBytes / total, memoryUsedBytes, memoryTotalBytes: total }].slice(-60);
      this.cancelTimer = this.schedule(() => this.sample(generation), INTERVAL);
    } catch {
      if (this.current(generation, scope.userId)) this.reset('Local device metrics are unavailable. Enable monitoring to retry.');
    }
  }

  dispose(): void { this.disposed = true; this.reset(); this.account = null; }
}

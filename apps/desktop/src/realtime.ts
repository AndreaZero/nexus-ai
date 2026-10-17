import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import WebSocket from 'ws';
import { realtimeApiResponseSchema, realtimeRequestSchema, realtimeResponseSchema, realtimeServerFrameSchema, realtimeStateSchema,
  type CodexState, type NexusAuthState, type RealtimeApiRequest, type RealtimeApiResponse,
  type RealtimeClientFrame, type RealtimeRequest, type RealtimeResponse, type RealtimeServerFrame, type RealtimeState } from '@nexus-ai/contracts';
import { AUTH_SCHEME, publicServiceUrl } from './auth-config.ts';
import type { LocalBindingStorage } from './local-bindings.js';
import { loadRealtimeQueue, realtimeQueueSchema, realtimeStorageKey, saveRealtimeQueue, validRealtimeText, type RealtimeQueue } from './realtime-queue.ts';

type Authorization = { userId: string } | { ok: false; code: string; message: string };
type Session = { userId: string; cookie: string; server: string };
interface Dependencies {
  auth: { getState(): Promise<NexusAuthState>; authorizeRepository(projectId: string, repositoryId: string): Promise<Authorization>; realtimeSession(): Promise<Session | null> };
  bindings: Pick<LocalBindingStorage, 'get'>;
  storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
  publish(state: RealtimeState): void;
  verifySource?: (projectId: string, repositoryId: string, threadId: string) => Promise<{ userId: string; cwd: string }>;
  createSocket?: (url: string, headers: { Origin: string; Cookie: string }) => WebSocket;
  fetch?: typeof globalThis.fetch;
}
type Code = Exclude<RealtimeResponse, { ok: true }>['code'];
class RealtimeError extends Error {
  readonly code: Code;
  constructor(code: Code, message: string) { super(message); this.code = code; }
}
const initial = (): RealtimeState => ({ projectId: null, connection: 'idle', cursor: null, snapshot: null, presence: [], pending: 0,
  sharing: null, lastSyncedAt: null, notice: null });

/** Main-only transport: credentials and local queue never cross preload. There are no executable jobs. */
export class DesktopRealtime {
  private readonly dependencies: Dependencies;
  private state: RealtimeState = initial();
  private serial: Promise<unknown> = Promise.resolve();
  private userId: string | undefined;
  private generation = 0;
  private socket: WebSocket | undefined;
  private queue: RealtimeQueue | null = null;
  private observed: CodexState | null = null;
  private attempts = 0;
  private enabled = false;
  private disposed = false;
  private retryTimer: NodeJS.Timeout | undefined;
  private flushTimer: NodeJS.Timeout | undefined;
  private heartbeat: NodeJS.Timeout | undefined;
  private refreshTimer: NodeJS.Timeout | undefined;
  private captureTimer: NodeJS.Timeout | undefined;
  private observedPending: CodexState | null = null;
  private observeQueued = false;
  private lastHeartbeat = 0;
  private onlineAt = 0;
  private pendingFrames = 0;
  private lastDeliveredCursor: string | null = null;
  private awaitingSnapshot = true;
  private replayAllowed = true;
  private readonly connectionDevice = randomUUID();

  constructor(dependencies: Dependencies) { this.dependencies = dependencies; }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.serial.then(operation);
    this.serial = pending.catch(() => undefined);
    return pending;
  }
  private publish(): void { this.dependencies.publish(realtimeStateSchema.parse(structuredClone(this.state))); }
  private projection(): void {
    this.state.pending = this.queue?.jobs.length ?? 0;
    this.state.sharing = this.queue && this.state.connection !== 'denied' && !this.queue.stopRequested && !this.queue.jobs.some(job => job.change.type === 'stop') ? { shareId: this.queue.shareId, repositoryId: this.queue.repositoryId,
      messageIds: this.queue.selected.map(message => message.id), visibility: this.queue.visibility, title: this.queue.title } : null;
  }
  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.captureTimer) clearTimeout(this.captureTimer);
    this.captureTimer = undefined; this.observeQueued = false;
    this.retryTimer = this.flushTimer = this.refreshTimer = this.heartbeat = undefined;
  }
  private closeSocket(): void {
    const socket = this.socket; this.socket = undefined;
    this.lastDeliveredCursor = null;
    if (socket) { socket.close(); socket.terminate(); }
    this.state.presence = [];
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }
  nexusStateChanged(state: NexusAuthState): void {
    if (state.status === 'unavailable') {
      this.generation++; this.clearTimers();
      this.closeSocket(); this.state.connection = 'offline'; this.state.snapshot = null; this.state.presence = [];
      this.state.notice = 'Nexus is unavailable. Pending selected text is encrypted locally; local execution is not replayed.';
      this.publish(); this.scheduleRetry(); return;
    }
    if (state.status !== 'signed_in' || !state.user) {
      this.generation++; this.enabled = false; this.clearTimers(); this.closeSocket();
      this.userId = undefined; this.queue = null; this.observed = null; this.observedPending = null; this.state = initial(); this.publish(); return;
    }
    if (this.userId && state.user.id !== this.userId) {
      this.generation++; this.enabled = false; this.clearTimers(); this.closeSocket();
      this.queue = null; this.observed = null; this.observedPending = null; this.state = initial(); this.publish();
    }
    this.userId = state.user.id;
  }
  async dispose(): Promise<void> {
    this.disposed = true; this.enabled = false; this.generation++; this.clearTimers(); this.closeSocket();
    await this.serial; this.queue = null; this.observed = null;
  }
  request(input: RealtimeRequest): Promise<RealtimeResponse> {
    const parsed = realtimeRequestSchema.safeParse(input);
    if (!parsed.success) return Promise.resolve({ ok: false, code: 'invalid_request', message: 'Choose a valid realtime operation.', state: structuredClone(this.state) });
    const generation = this.generation;
    return this.enqueue(async () => {
      try {
        if (this.disposed || generation !== this.generation) throw new RealtimeError('auth_required', 'Your Nexus account changed. Reopen the project.');
        const share = await this.perform(parsed.data);
        return realtimeResponseSchema.parse({ ok: true, state: this.state, share: share ?? null });
      } catch (error) {
        const code = error instanceof RealtimeError ? error.code : 'unavailable';
        const message = error instanceof RealtimeError ? error.message : 'Realtime could not complete this operation. Retry when Nexus is available.';
        this.state.notice = message; this.publish();
        return realtimeResponseSchema.parse({ ok: false, code, message, state: this.state });
      }
    });
  }
  private async session(): Promise<Session> {
    const generation = this.generation;
    const session = await this.dependencies.auth.realtimeSession();
    if (!session || generation !== this.generation || (this.userId && session.userId !== this.userId)) throw new RealtimeError('auth_required', 'Reconnect your Nexus account before synchronizing.');
    publicServiceUrl(session.server); this.userId = session.userId;
    return session;
  }
  private async api(request: RealtimeApiRequest): Promise<RealtimeApiResponse> {
    const generation = this.generation;
    const session = await this.session();
    const response = await (this.dependencies.fetch ?? globalThis.fetch)(`${publicServiceUrl(session.server)}/api/realtime`, {
      method: 'POST', redirect: 'error', headers: { Origin: `${AUTH_SCHEME}:/`, Cookie: session.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(request), signal: AbortSignal.timeout(8000),
    });
    // Bound streaming responses rather than trusting Content-Length from an unavailable proxy.
    if (!response.body) throw new RealtimeError('unavailable', 'The realtime server returned no response.');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength;
        if (size > 1048576) { await reader.cancel(); throw new Error('Response too large.'); } chunks.push(next.value); }
    } finally { reader.releaseLock(); }
    if (generation !== this.generation) throw new RealtimeError('auth_required', 'Your Nexus account changed.');
    if (response.status === 401 || response.status === 403) this.deny(response.status === 401 ? 'auth_required' : 'forbidden');
    const parsed = realtimeApiResponseSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
    if (!parsed.success) throw new RealtimeError('unavailable', 'The realtime response was invalid. Retry after updating Nexus.');
    return parsed.data;
  }
  private fail(result: Extract<RealtimeApiResponse, { ok: false }>): never {
    if (result.code === 'auth_required' || result.code === 'forbidden') this.deny(result.code);
    throw new RealtimeError(result.code === 'not_found' ? 'invalid_request' : result.code, result.message);
  }
  private deny(code: 'auth_required' | 'forbidden' | 'invalid_request'): void {
    this.enabled = false; this.clearTimers(); this.closeSocket(); this.state.connection = 'denied'; this.state.snapshot = null;
    this.state.cursor = null; if (this.queue) this.queue.capturing = false; this.projection();
    this.state.notice = code === 'forbidden' ? 'Project access was revoked. Pending text will not be sent.' : 'Reconnect your Nexus account before synchronizing.';
    this.publish();
  }
  private async authorize(queue: RealtimeQueue): Promise<void> {
    const generation = this.generation;
    const result = await this.dependencies.auth.authorizeRepository(queue.projectId, queue.repositoryId);
    if ('ok' in result) {
      if (result.code === 'forbidden' || result.code === 'auth_required') this.deny(result.code);
      throw new RealtimeError(result.code === 'unavailable' ? 'unavailable' : 'forbidden', 'Your project role could not authorize this pending upload.');
    }
    const binding = await this.dependencies.bindings.get(result.userId, queue.projectId, queue.repositoryId);
    let canonical: string | undefined;
    if (binding) { try { canonical = await realpath(binding.rootPath); if (!(await stat(canonical)).isDirectory()) canonical = undefined; } catch { /* Fail closed on a moved/missing binding. */ } }
    if (generation !== this.generation || result.userId !== queue.userId || result.userId !== this.userId) throw new RealtimeError('auth_required', 'Your Nexus account changed.');
    if (!canonical || canonical !== queue.cwd || binding?.deviceId !== queue.deviceId) {
      queue.capturing = false; queue.blocked = true; await this.persist(queue);
      throw new RealtimeError('conflict', 'The local folder binding changed. Review and discard pending text before sharing again.');
    }
  }
  private async persist(queue: RealtimeQueue): Promise<void> {
    await saveRealtimeQueue(this.dependencies.storage, queue);
    if (queue === this.queue) { this.projection(); this.publish(); }
  }
  private async perform(request: RealtimeRequest) {
    if (request.operation === 'getState') return null;
    if (request.operation === 'disconnect') {
      this.enabled = false; this.clearTimers(); this.closeSocket(); this.state.connection = 'idle'; this.state.snapshot = null;
      if (this.queue) { this.queue.capturing = false; await this.persist(this.queue); }
      this.state.notice = 'Realtime disconnected. Live sharing is paused; use Stop sharing to end the accepted share.';
      this.publish(); return null;
    }
    if (request.operation === 'discardPending') {
      if (this.queue) { const current = this.queue;
        if (current.userId !== this.userId) throw new RealtimeError('auth_required', 'Reconnect the owner account before discarding this pending text.');
        await this.dependencies.storage.setItem(realtimeStorageKey(current.userId, current.projectId), ''); this.queue = null; }
      this.state.notice = 'Pending selected text discarded. An already accepted live share stays visible until stopped.';
      this.projection(); this.publish(); return null;
    }
    if (request.operation === 'connect') {
      const session = await this.session();
      if (this.state.projectId !== request.projectId) {
        this.generation++; this.clearTimers(); this.closeSocket();
        const switching = this.generation;
        if (this.queue) { this.queue.capturing = false; await this.persist(this.queue); }
        if (switching !== this.generation || session.userId !== this.userId) throw new RealtimeError('auth_required', 'Your Nexus account changed.');
        this.state = { ...initial(), projectId: request.projectId };
        this.queue = null;
        const restored = await loadRealtimeQueue(this.dependencies.storage, session.userId, request.projectId);
        if (switching !== this.generation || session.userId !== this.userId) throw new RealtimeError('auth_required', 'Your Nexus account changed.');
        this.queue = restored;
        this.replayAllowed = !this.queue?.jobs.length;
        if (this.queue) { this.queue.capturing = false; this.state.notice = 'Restored pending selected text. Sharing new deltas requires another explicit selection.'; this.projection(); }
      }
      this.enabled = true; this.attempts = 0; await this.connect(); return null;
    }
    if (request.operation === 'retry') {
      if (!this.state.projectId) throw new RealtimeError('invalid_request', 'Open a project before reconnecting.');
      this.enabled = true; this.replayAllowed = true; this.attempts = 0; this.clearTimers(); await this.connect(); return null;
    }
    if (request.operation === 'readShare') {
      if (request.projectId !== this.state.projectId) throw new RealtimeError('invalid_request', 'Open this project before reading its live share.');
      const result = await this.api(request); if (!result.ok) this.fail(result);
      if (result.kind !== 'share' || result.share.projectId !== request.projectId || result.share.id !== request.shareId) throw new RealtimeError('unavailable', 'The requested live share could not be verified.');
      return result.share;
    }
    if (request.operation === 'stopSharing') {
      if (!this.queue) return null;
      // Freeze the latest observed selection before stopping, including a large delta still waiting in the coalescer.
      // Bound the drain to the selected-text budget; new messages and subsequent provider updates remain excluded.
      const final = this.observed;
      if (final && this.queue.capturing) {
        try {
          for (let index = 0; index < 10 && this.queue?.capturing; index++) {
            const before: RealtimeQueue | null = this.queue; await this.capture(final, false);
            if (this.queue === before) break;
          }
        } catch { if (this.queue) this.queue.capturing = false; }
      }
      if (!this.queue) return null;
      const next = structuredClone(this.queue); next.capturing = false; next.stopRequested = true;
      if (next.jobs.some(job => job.change.type === 'stop')) next.stopRequested = false;
      else if (next.jobs.length < 100) {
        next.jobs.push({ batchId: randomUUID(), change: { type: 'stop', shareId: next.shareId, deviceId: next.deviceId } }); next.stopRequested = false;
      }
      realtimeQueueSchema.parse(next); this.queue = next; await this.persist(next); this.scheduleFlush(); return null;
    }
    if (request.projectId !== this.state.projectId || this.state.connection !== 'online') throw new RealtimeError('unavailable', 'Connect this project before starting live sharing.');
    const generation = this.generation;
    if (this.queue && (this.queue.capturing || this.queue.jobs.length || !this.queue.jobs.some(job => job.change.type === 'stop'))) throw new RealtimeError('conflict', 'Stop the current share and synchronize or discard pending text before starting another.');
    const session = this.observed?.session;
    if (!session || session.projectId !== request.projectId || session.repositoryId !== request.repositoryId || !session.threadId ||
      !request.messages.every(message => session.messages.some(actual => actual.id === message.id && actual.role === message.role &&
        actual.text.startsWith(message.text) && (actual.status === message.status || message.status === 'streaming') &&
        (actual.text === message.text || message.status === 'streaming')))) throw new RealtimeError('invalid_request', 'The selected messages changed. Review the current session and confirm a new selection.');
    const account = await this.session();
    const binding = await this.dependencies.bindings.get(account.userId, request.projectId, request.repositoryId);
    if (!binding) throw new RealtimeError('invalid_request', 'Link the current repository before sharing.');
    const queue: RealtimeQueue = { version: 1, userId: account.userId, projectId: request.projectId, repositoryId: request.repositoryId,
      cwd: await realpath(binding.rootPath), deviceId: binding.deviceId, threadId: session.threadId, shareId: randomUUID(), title: request.title,
      visibility: request.visibility, selected: structuredClone(request.messages), capturing: true, blocked: false, stopRequested: false, jobs: [] };
    await this.authorize(queue);
    if (!this.dependencies.verifySource) throw new RealtimeError('unavailable', 'The local session source could not be verified.');
    const source = await this.dependencies.verifySource(queue.projectId, queue.repositoryId, queue.threadId);
    if (generation !== this.generation || source.userId !== this.userId) throw new RealtimeError('auth_required', 'Your Nexus account changed.');
    if (source.userId !== queue.userId || source.cwd !== queue.cwd) throw new RealtimeError('conflict', 'The repository session belongs to a previous folder binding. Reopen it before sharing.');
    queue.jobs.push({ batchId: randomUUID(), change: { type: 'start', shareId: queue.shareId, deviceId: queue.deviceId, title: queue.title, visibility: queue.visibility, messages: structuredClone(queue.selected) } });
    realtimeQueueSchema.parse(queue); this.queue = queue; this.replayAllowed = true; await this.persist(queue); this.scheduleFlush();
    // The preview may have frozen an earlier prefix while the same selected message kept streaming.
    if (this.observed) await this.capture(this.observed);
    return null;
  }
  private async connect(): Promise<void> {
    if (this.disposed || !this.enabled || !this.state.projectId) return;
    this.closeSocket(); this.state.connection = this.attempts ? 'reconnecting' : 'connecting'; this.publish();
    const generation = this.generation;
    try {
      const session = await this.session();
      const result = await this.api({ operation: 'snapshot', projectId: this.state.projectId });
      if (!result.ok) this.fail(result);
      if (result.kind !== 'snapshot' || result.snapshot.projectId !== this.state.projectId) throw new Error('Mismatched snapshot.');
      if (generation !== this.generation || !this.enabled) return;
      this.state.snapshot = result.snapshot; this.state.cursor = result.snapshot.cursor;
      const url = new URL('/api/realtime', publicServiceUrl(session.server)); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = this.dependencies.createSocket ? this.dependencies.createSocket(url.href, { Origin: `${AUTH_SCHEME}:/`, Cookie: session.cookie }) :
        new WebSocket(url, { headers: { Origin: `${AUTH_SCHEME}:/`, Cookie: session.cookie }, maxPayload: 1048576, handshakeTimeout: 8000, perMessageDeflate: false });
      this.socket = socket; this.awaitingSnapshot = true;
      socket.on('error', () => { /* close follows; never expose provider or network error text. */ });
      socket.on('unexpected-response', (_request, response) => {
        response.resume();
        if (this.socket !== socket || generation !== this.generation) return;
        if (response.statusCode === 401 || response.statusCode === 403) this.deny(response.statusCode === 401 ? 'auth_required' : 'forbidden');
        else { this.closeSocket(); this.lost(); }
      });
      socket.on('open', () => {
        if (this.socket !== socket || generation !== this.generation || !this.enabled) return;
        this.send({ type: 'join', projectId: this.state.projectId!, cursor: this.state.cursor, deviceId: this.connectionDevice });
        this.lastHeartbeat = Date.now();
        this.heartbeat = setInterval(() => {
          if (Date.now() - this.lastHeartbeat > 45000) { this.closeSocket(); this.lost(); return; }
          this.send({ type: 'heartbeat' });
        }, 15000); this.heartbeat.unref();
      });
      socket.on('message', (bytes, binary) => {
        if (this.socket !== socket || generation !== this.generation) return;
        const buffer = Array.isArray(bytes) ? Buffer.concat(bytes) : Buffer.from(bytes as ArrayBuffer);
        if (binary || buffer.byteLength > 1048576) { this.deny('invalid_request'); return; }
        let frame: RealtimeServerFrame;
        try { frame = realtimeServerFrameSchema.parse(JSON.parse(buffer.toString('utf8')) as unknown); }
        catch { this.deny('invalid_request'); return; }
        if (++this.pendingFrames > 32) { this.pendingFrames--; this.deny('invalid_request'); return; }
        void this.enqueue(async () => { try { if (this.socket === socket && generation === this.generation) await this.frame(frame); }
          finally { this.pendingFrames--; } }).catch(() => this.lost());
      });
      socket.on('close', () => { if (this.socket !== socket || generation !== this.generation) return; this.socket = undefined; this.lost(); });
    } catch (error) {
      if (generation !== this.generation) return;
      if ((this.state as RealtimeState).connection !== 'denied') { this.lost(); }
      if (error instanceof RealtimeError && (error.code === 'forbidden')) this.deny('forbidden');
    }
  }
  private send(frame: RealtimeClientFrame): void { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(frame)); }
  private acknowledgeDelivered(cursor: string): void {
    // HTTP projections may be ahead of this WebSocket. Only acknowledge metadata actually delivered on this connection.
    if (this.lastDeliveredCursor && BigInt(cursor) < BigInt(this.lastDeliveredCursor)) return;
    this.lastDeliveredCursor = cursor;
    this.send({ type: 'ack', cursor });
  }
  private lost(): void {
    if (this.onlineAt && Date.now() - this.onlineAt >= 45000) this.attempts = 0;
    this.onlineAt = 0;
    this.closeSocket(); this.state.connection = 'offline'; this.state.presence = []; this.state.snapshot = null;
    this.state.notice = 'Connection lost. Selected text is queued locally; reconnecting never replays local actions.'; this.publish(); this.scheduleRetry();
  }
  private scheduleRetry(): void {
    if (this.retryTimer || !this.enabled || this.disposed || this.state.connection === 'denied') return;
    if (this.attempts >= 8) { this.state.connection = 'offline'; this.state.notice = 'Automatic reconnection paused after 8 attempts. Use Retry when the server is available.'; this.publish(); return; }
    const delay = Math.min(30000, 500 * 2 ** this.attempts++) + Math.floor(Math.random() * 350);
    this.retryTimer = setTimeout(() => { this.retryTimer = undefined; void this.enqueue(() => this.connect()); }, delay); this.retryTimer.unref();
  }
  private async frame(frame: RealtimeServerFrame): Promise<void> {
    this.lastHeartbeat = Date.now();
    if (frame.type === 'heartbeat') return;
    if (frame.type === 'denied') { if (frame.code === 'unavailable') this.lost(); else this.deny(frame.code); return; }
    const projectId = frame.type === 'snapshot' ? frame.snapshot.projectId : frame.projectId;
    if (projectId !== this.state.projectId) { this.deny('invalid_request'); return; }
    if (frame.type === 'presence') { this.state.presence = frame.members; this.publish(); return; }
    if (frame.type === 'snapshot') {
      if (frame.resync) { this.state.snapshot = null; this.state.presence = []; }
      this.state.snapshot = frame.snapshot; this.state.cursor = frame.snapshot.cursor; this.state.connection = 'online';
      this.awaitingSnapshot = false; this.onlineAt = Date.now(); this.state.lastSyncedAt = new Date().toISOString();
      if (!this.queue?.blocked && this.replayAllowed) this.state.notice = null;
      this.acknowledgeDelivered(frame.snapshot.cursor); this.publish(); this.scheduleFlush(); return;
    }
    if (this.awaitingSnapshot) return;
    if (frame.events.some(event => event.projectId !== projectId || BigInt(event.sequence) > BigInt(frame.cursor))) { this.deny('invalid_request'); return; }
    if (this.state.cursor && BigInt(frame.cursor) <= BigInt(this.state.cursor)) { this.acknowledgeDelivered(frame.cursor); return; }
    // Metadata events can be filtered by audience, so sequences need not be contiguous.
    this.state.cursor = frame.cursor; this.acknowledgeDelivered(frame.cursor);
    if (!this.refreshTimer) {
      const generation = this.generation;
      this.refreshTimer = setTimeout(() => { this.refreshTimer = undefined; void this.enqueue(async () => {
        if (generation !== this.generation || !this.state.projectId || this.state.connection !== 'online') return;
        const result = await this.api({ operation: 'snapshot', projectId: this.state.projectId });
        if (!result.ok) this.fail(result);
        if (result.kind !== 'snapshot' || result.snapshot.projectId !== this.state.projectId) throw new Error('Invalid projection.');
        this.state.snapshot = result.snapshot;
        if (!this.state.cursor || BigInt(result.snapshot.cursor) > BigInt(this.state.cursor)) this.state.cursor = result.snapshot.cursor;
        this.state.lastSyncedAt = new Date().toISOString(); this.publish();
      }).catch(() => { if (this.state.connection !== 'denied') this.lost(); }); }, 100); this.refreshTimer.unref();
    }
  }
  observeCodex(state: CodexState): void {
    // Coalesce provider updates, retaining only one bounded session DTO in memory.
    this.observed = structuredClone(state);
    this.observedPending = this.observed;
    if (this.observeQueued) return;
    this.observeQueued = true;
    this.captureTimer = setTimeout(() => {
      this.captureTimer = undefined;
      void this.enqueue(async () => {
        this.observeQueued = false; const pending = this.observedPending; this.observedPending = null;
        if (pending && this.queue?.capturing) await this.capture(pending);
      }).catch(() => { if (this.queue) this.queue.capturing = false; this.state.notice = 'Live sharing paused. Review pending text before continuing.'; this.projection(); this.publish(); });
    }, 500); this.captureTimer.unref();
  }
  private async capture(state: CodexState, scheduleRemainder = true): Promise<void> {
    const current = this.queue; const session = state.session;
    if (!current || !current.capturing || current.blocked) return;
    if (!session || session.threadId !== current.threadId || session.projectId !== current.projectId || session.repositoryId !== current.repositoryId) {
      current.capturing = false; this.state.notice = 'The local session changed. Live sharing is paused; use Stop sharing to end the accepted share.'; await this.persist(current); return;
    }
    const generation = this.generation;
    if (!this.dependencies.verifySource) throw new Error('Missing local source guard.');
    const source = await this.dependencies.verifySource(current.projectId, current.repositoryId, current.threadId);
    if (generation !== this.generation || this.queue !== current || !current.capturing) return;
    if (source.userId !== current.userId || source.cwd !== current.cwd) {
      current.capturing = false; current.blocked = true; this.state.notice = 'The local session binding changed. Review pending text before continuing.';
      await this.persist(current); return;
    }
    const next = structuredClone(current);
    const updates: Extract<RealtimeQueue['jobs'][number]['change'], { type: 'append' }>['updates'] = [];
    let remaining = 16384;
    for (const selected of next.selected) {
      const actual = session.messages.find(message => message.id === selected.id && message.role === selected.role);
      if (!actual || !actual.text.startsWith(selected.text) || !validRealtimeText(actual.text)) {
        next.capturing = false; next.blocked = true; this.queue = next; this.state.notice = 'A selected message changed its previous text. Review and discard pending text before sharing again.'; await this.persist(next); return;
      }
      let suffix = actual.text.slice(selected.text.length, selected.text.length + remaining);
      // Offsets count UTF-16 code units; a bounded JSON batch must still contain complete Unicode scalars.
      if (suffix.length && /[\uD800-\uDBFF]$/u.test(suffix)) suffix = suffix.slice(0, -1);
      if (!suffix && actual.text.length > selected.text.length) break;
      const status = suffix.length === actual.text.length - selected.text.length ? actual.status : 'streaming';
      if (suffix || selected.status !== status) { updates.push({ messageId: selected.id, offset: selected.text.length, text: suffix, status });
        selected.text += suffix; selected.status = status; remaining -= suffix.length; }
      if (!remaining) break;
    }
    if (!updates.length) return;
    next.jobs.push({ batchId: randomUUID(), change: { type: 'append', shareId: next.shareId, deviceId: next.deviceId, updates } });
    const parsed = realtimeQueueSchema.safeParse(next);
    if (!parsed.success) {
      current.capturing = false; this.state.notice = 'The encrypted queue limit was reached (100 batches / 1 MiB or 128 Ki characters). Existing pending text was preserved and can synchronize. Use Stop sharing before starting another selection.';
      await this.persist(current); return;
    }
    this.queue = next; await this.persist(next); this.scheduleFlush();
    if (scheduleRemainder && next.selected.some(selected => session.messages.find(message => message.id === selected.id)?.text.length !== selected.text.length)) {
      // Capture a remaining large delta in bounded batches, behind other queued work.
      void this.enqueue(() => this.capture(state)).catch(() => undefined);
    }
  }
  private scheduleFlush(): void {
    if (this.flushTimer || !this.enabled || !this.replayAllowed || this.state.connection !== 'online' || !this.queue?.jobs.length || this.queue.blocked || this.disposed) return;
    const generation = this.generation;
    this.flushTimer = setTimeout(() => { this.flushTimer = undefined; void this.enqueue(async () => {
      if (generation === this.generation) await this.flush();
    }).catch(error => {
      if (generation !== this.generation || this.state.connection === 'denied') return;
      if (error instanceof RealtimeError && error.code === 'conflict') { this.state.notice = error.message; this.publish(); }
      else this.lost();
    }); }, 500);
    this.flushTimer.unref();
  }
  private async flush(): Promise<void> {
    const queue = this.queue; const generation = this.generation;
    if (!queue || queue.blocked || !queue.jobs.length || this.state.connection !== 'online' || !this.enabled) return;
    await this.authorize(queue);
    const job = queue.jobs[0]!;
    const result = await this.api({ operation: 'upload', projectId: queue.projectId, batchId: job.batchId, change: job.change });
    if (generation !== this.generation || this.queue !== queue) return;
    if (!result.ok) {
      if (result.code === 'conflict' || result.code === 'invalid_request' || result.code === 'not_found') { queue.blocked = true; queue.capturing = false; this.state.notice = 'The server rejected this selected text, offset or driver. Pending text was preserved for review; no automatic replacement or retry was sent.'; await this.persist(queue); return; }
      this.fail(result);
    }
    if (result.kind !== 'ack' || result.batchId !== job.batchId || result.shareId !== queue.shareId) throw new Error('Invalid upload acknowledgement.');
    queue.jobs.shift(); this.state.lastSyncedAt = new Date().toISOString();
    if (queue.stopRequested && !queue.jobs.some(pending => pending.change.type === 'stop')) {
      queue.jobs.push({ batchId: randomUUID(), change: { type: 'stop', shareId: queue.shareId, deviceId: queue.deviceId } }); queue.stopRequested = false;
    }
    if (job.change.type === 'stop' && !queue.jobs.length) {
      await this.dependencies.storage.setItem(realtimeStorageKey(queue.userId, queue.projectId), ''); this.queue = null; this.projection(); this.publish();
    } else await this.persist(queue);
    this.scheduleFlush();
  }
}

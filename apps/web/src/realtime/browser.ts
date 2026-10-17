import { realtimeApiResponseSchema, realtimeServerFrameSchema } from '@nexus-ai/contracts';
import type { LiveShare, RealtimeApiRequest, RealtimeState } from '@nexus-ai/contracts';
import { acceptSnapshot, cursorAfter, disconnected, emptyRealtime, retryDelay } from './state.js';

/** Browser observer only: session cookies remain HttpOnly; no upload or execution API. */
export class BrowserRealtime {
  private state: RealtimeState;
  private socket: WebSocket | null = null;
  private generation = 0;
  private attempt = 0;
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private lastFrame = 0;
  // HTTP projections may be ahead of the socket. ACKs only cover frames delivered on this connection.
  private lastDelivered: string | null = null;
  private connectedAt = 0;
  private refreshing: number | null = null;
  private dirty = false;
  private deviceId = crypto.randomUUID();
  private server: URL;
  private publish: (state: RealtimeState) => void;
  constructor(server: URL, projectId: string, publish: (state: RealtimeState) => void) { this.server = server; this.publish = publish; this.state = { ...emptyRealtime(), projectId }; }
  private set(next: RealtimeState) { this.state = next; this.publish(next); }
  private async api(request: RealtimeApiRequest) {
    const generation = this.generation;
    if (request.operation === 'upload') throw new Error('Browser observers cannot upload local sessions.');
    const response = await fetch(new URL('api/realtime', this.server), { method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, signal: AbortSignal.timeout(12000), body: JSON.stringify(request) });
    const result = realtimeApiResponseSchema.parse(await response.json());
    if (!result.ok) { if (generation === this.generation && (result.code === 'auth_required' || result.code === 'forbidden')) this.deny(result.message); throw new Error(result.message); }
    return result;
  }
  private deny(message: string) { this.stop(); this.set({ ...disconnected(this.state, 'denied', message), cursor: null, lastSyncedAt: null }); }
  async read(shareId: string): Promise<LiveShare> { if (!this.state.projectId || this.state.connection !== 'online') throw new Error('Reconnect before reading shared text.'); const generation = this.generation; const result = await this.api({ operation: 'readShare', projectId: this.state.projectId, shareId }); if (generation !== this.generation || this.stopped) throw new Error('The connection changed. Select this shared session again.'); if (result.kind !== 'share') throw new Error('Invalid share response.'); return result.share; }
  connect() {
    this.stopped = false; const generation = ++this.generation;
    this.lastDelivered = null;
    clearTimeout(this.retryTimer); clearInterval(this.heartbeat); this.socket?.close();
    this.set({ ...this.state, connection: this.attempt ? 'reconnecting' : 'connecting', snapshot: null, presence: [], notice: null });
    const endpoint = new URL('api/realtime', this.server); endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(endpoint); this.socket = socket; this.lastFrame = Date.now();
    socket.onopen = () => {
      if (generation !== this.generation) return;
      this.connectedAt = Date.now();
      socket.send(JSON.stringify({ type: 'join', projectId: this.state.projectId, cursor: this.state.cursor, deviceId: this.deviceId }));
      this.heartbeat = setInterval(() => { if (Date.now() - this.lastFrame > 45000) socket.close(); else if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'heartbeat' })); }, 15000);
    };
    socket.onmessage = event => {
      if (generation !== this.generation || typeof event.data !== 'string' || event.data.length > 1048576) return;
      let frame; try { frame = realtimeServerFrameSchema.parse(JSON.parse(event.data)); } catch { this.deny('The realtime response could not be validated. Retry after checking the server.'); return; }
      this.lastFrame = Date.now();
      if (frame.type === 'denied') { if (frame.code === 'unavailable') socket.close(); else this.deny(frame.message); return; }
      if (frame.type === 'heartbeat') { if (Date.now() - this.connectedAt >= 45000) this.attempt = 0; return; }
      if (frame.type === 'presence') { if (frame.projectId === this.state.projectId && this.state.connection === 'online') this.set({ ...this.state, presence: frame.members }); return; }
      if (frame.type === 'snapshot') {
        if (frame.snapshot.projectId !== this.state.projectId) return;
        if (cursorAfter(frame.snapshot.cursor, this.lastDelivered)) this.lastDelivered = frame.snapshot.cursor;
        this.set(acceptSnapshot(this.state, frame.snapshot, new Date().toISOString())); this.ack(); return;
      }
      if (frame.projectId === this.state.projectId) {
        if (frame.events.some(item => item.projectId !== frame.projectId || BigInt(item.sequence) > BigInt(frame.cursor))) { this.deny('The realtime event scope or sequence could not be validated.'); return; }
        if (cursorAfter(frame.cursor, this.lastDelivered)) this.lastDelivered = frame.cursor;
        if (!cursorAfter(frame.cursor, this.state.cursor)) { this.ack(); return; }
        this.dirty = true; void this.refresh(generation);
      }
    };
    socket.onerror = () => { socket.close(); };
    socket.onclose = () => {
      if (generation !== this.generation || this.stopped) return;
      clearInterval(this.heartbeat); const delay = retryDelay(this.attempt++);
      this.set(disconnected(this.state, delay === null ? 'offline' : 'reconnecting', delay === null ? 'Automatic retries paused after 8 attempts. Retry manually.' : 'Connection lost. Shared data is hidden until permissions are verified again.'));
      if (delay !== null) this.retryTimer = setTimeout(() => this.connect(), delay);
    };
  }
  private ack() {
    if (this.socket?.readyState !== WebSocket.OPEN || this.state.cursor === null || this.lastDelivered === null) return;
    const cursor = BigInt(this.state.cursor) < BigInt(this.lastDelivered) ? this.state.cursor : this.lastDelivered;
    this.socket.send(JSON.stringify({ type: 'ack', cursor }));
  }
  private async refresh(generation: number) {
    if (this.refreshing === generation) return; this.refreshing = generation;
    try {
      do {
        this.dirty = false;
        const result = await this.api({ operation: 'snapshot', projectId: this.state.projectId! });
        if (generation !== this.generation || this.stopped) return;
        if (result.kind === 'snapshot') { this.set(acceptSnapshot(this.state, result.snapshot, new Date().toISOString())); this.ack(); }
      } while (this.dirty && generation === this.generation && !this.stopped);
    } catch { if (generation === this.generation && !this.stopped) this.socket?.close(); }
    finally { if (this.refreshing === generation) this.refreshing = null; }
  }
  retry() { this.attempt = 0; this.connect(); }
  stop() { this.stopped = true; ++this.generation; clearTimeout(this.retryTimer); clearInterval(this.heartbeat); this.socket?.close(); this.socket = null; }
}

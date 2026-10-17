import type { IncomingMessage } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { WebSocket, WebSocketServer } from 'ws';
import { realtimeClientFrameSchema, realtimeServerFrameSchema, type RealtimePresence, type RealtimeServerFrame } from '@nexus-ai/contracts';
import { RealtimeError, type RealtimeActor, type RealtimeService, type RealtimeAccess } from './realtime.js';

type Peer = { socket: WebSocket; request: IncomingMessage; actor: RealtimeActor; projectId: string | null;
  access: RealtimeAccess | null; cursor: string | null; acknowledged: string; lastSeen: number; joinedAt: number;
  processing: boolean; queued: number; chain: Promise<void>; windowAt: number; frames: number; joins: number; presence: string };
type Dependencies = { service: RealtimeService; origins: readonly string[];
  authorize(request: IncomingMessage): Promise<RealtimeActor | null>;
  report(event: 'realtime.connected' | 'realtime.closed' | 'realtime.failure', outcome?: string): void };
const nowISO = () => new Date().toISOString();

/** One bounded in-process fanout reads the durable PostgreSQL outbox; it never accepts executable actions. */
export function installRealtimeSocket(app: FastifyInstance, deps: Dependencies) {
  const server = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false, clientTracking: false });
  const peers = new Set<Peer>();
  let pendingUpgrades = 0;
  let closing = false;
  let polling = false;
  function send(peer: Peer, frame: RealtimeServerFrame): boolean {
    if (peer.socket.readyState !== WebSocket.OPEN) return false;
    if (peer.socket.bufferedAmount > 1024 * 1024) { peer.socket.terminate(); return false; }
    const encoded = JSON.stringify(realtimeServerFrameSchema.parse(frame));
    if (Buffer.byteLength(encoded) > 1024 * 1024) { peer.socket.terminate(); return false; }
    peer.socket.send(encoded, error => { if (error) peer.socket.terminate(); });
    return true;
  }
  function deny(peer: Peer, code: 'auth_required' | 'forbidden' | 'invalid_request' | 'unavailable') {
    send(peer, { type: 'denied', code, message: code === 'auth_required' ? 'Accedi di nuovo per riprendere la connessione.'
      : code === 'unavailable' ? 'Realtime temporaneamente non disponibile.' : 'Connessione realtime non autorizzata.' });
    peer.projectId = null; peer.access = null;
    peer.socket.close(1008, code);
    const timer = setTimeout(() => peer.socket.terminate(), 1000); timer.unref();
    deps.report('realtime.closed', code);
  }
  async function verify(peer: Peer): Promise<boolean> {
    const actor = await deps.authorize(peer.request);
    if (!actor || actor.id !== peer.actor.id) { deny(peer, 'auth_required'); return false; }
    return peer.socket.readyState === WebSocket.OPEN;
  }
  async function refresh(peer: Peer, initial = false) {
    if (!peer.projectId || !await verify(peer)) return;
    const projectId = peer.projectId;
    const result = await deps.service.delivery(peer.actor, projectId, peer.cursor, initial && peer.cursor !== null);
    if (peer.projectId !== projectId || peer.socket.readyState !== WebSocket.OPEN) return;
    let frame = result.frame;
    // A role change invalidates every previously held projection even with no new outbox entries.
    if (peer.access && peer.access.role !== result.access.role && frame.type !== 'snapshot') {
      const fresh = await deps.service.delivery(peer.actor, projectId, null, true);
      frame = fresh.frame; peer.access = fresh.access;
    } else peer.access = result.access;
    if (frame.type === 'snapshot') {
      if (send(peer, frame)) peer.cursor = frame.snapshot.cursor;
    } else if (frame.type === 'events' && (frame.events.length || frame.cursor !== peer.cursor)) {
      if (send(peer, frame)) peer.cursor = frame.cursor;
    }
  }
  function fail(peer: Peer, error: unknown) {
    deps.report('realtime.failure', error instanceof RealtimeError ? error.code : 'unavailable');
    deny(peer, error instanceof RealtimeError && error.code === 'forbidden' ? 'forbidden' : 'unavailable');
  }
  function presence() {
    const projects = new Map<string, Map<string, RealtimePresence>>();
    for (const peer of peers) {
      if (!peer.projectId || !peer.access || peer.socket.readyState !== WebSocket.OPEN || Date.now() - peer.lastSeen > 45_000) continue;
      let members = projects.get(peer.projectId);
      if (!members) { members = new Map(); projects.set(peer.projectId, members); }
      const member = members.get(peer.actor.id);
      if (member) { member.connections = Math.min(20, member.connections + 1); member.lastSeenAt = new Date(Math.max(Date.parse(member.lastSeenAt), peer.lastSeen)).toISOString(); }
      else members.set(peer.actor.id, { userId: peer.actor.id, name: peer.access.name, role: peer.access.role, connections: 1, lastSeenAt: new Date(peer.lastSeen).toISOString() });
    }
    for (const peer of peers) {
      if (!peer.projectId || !peer.access) continue;
      const members = [...(projects.get(peer.projectId)?.values() ?? [])].sort((a, b) => a.userId.localeCompare(b.userId)).slice(0, 100);
      const fingerprint = JSON.stringify(members);
      if (peer.presence !== fingerprint) { if (send(peer, { type: 'presence', projectId: peer.projectId, members })) peer.presence = fingerprint; }
    }
  }
  const poll = setInterval(() => {
    if (closing || polling) return;
    polling = true;
    void Promise.allSettled([...peers].map(async peer => {
      if (Date.now() - peer.lastSeen > 45_000 || !peer.projectId && Date.now() - peer.joinedAt > 10_000) { peer.socket.terminate(); return; }
      peer.processing = true;
      peer.chain = peer.chain.then(() => refresh(peer)).catch(error => fail(peer, error)).finally(() => { peer.processing = false; });
      await peer.chain;
    })).then(() => presence()).finally(() => { polling = false; });
  }, 2000);
  poll.unref();

  server.on('connection', (socket: WebSocket, request: IncomingMessage, actor: RealtimeActor) => {
    const peer: Peer = { socket, request, actor, projectId: null, access: null, cursor: null, acknowledged: '0',
      lastSeen: Date.now(), joinedAt: Date.now(), processing: false, queued: 0, chain: Promise.resolve(), windowAt: Date.now(), frames: 0, joins: 0, presence: '' };
    peers.add(peer); deps.report('realtime.connected');
    socket.on('error', () => socket.terminate());
    socket.on('close', () => { peers.delete(peer); deps.report('realtime.closed'); });
    socket.on('message', (data, binary) => {
      if (Date.now() - peer.windowAt > 60_000) { peer.windowAt = Date.now(); peer.frames = 0; peer.joins = 0; }
      if (binary || ++peer.frames > 120 || peer.queued >= 4) { deny(peer, 'invalid_request'); return; }
      let raw: unknown;
      try { raw = JSON.parse(data.toString()) as unknown; } catch { deny(peer, 'invalid_request'); return; }
      const parsed = realtimeClientFrameSchema.safeParse(raw);
      if (!parsed.success) { deny(peer, 'invalid_request'); return; }
      peer.queued++;
      peer.chain = peer.chain.then(async () => {
        if (!await verify(peer)) return;
        const frame = parsed.data;
        if (frame.type === 'join') {
          if (++peer.joins > 10) { deny(peer, 'invalid_request'); return; }
          const existing = new Set([...peers].filter(other => other.projectId === frame.projectId).map(other => other.actor.id));
          if (existing.size >= 100 && !existing.has(actor.id)) { deny(peer, 'unavailable'); return; }
          peer.projectId = frame.projectId; peer.cursor = frame.cursor; peer.acknowledged = '0'; peer.access = null; peer.presence = '';
          await refresh(peer, true);
        } else {
          if (!peer.projectId) { deny(peer, 'invalid_request'); return; }
          await refresh(peer);
          if (frame.type === 'ack') {
            if (BigInt(frame.cursor) < BigInt(peer.acknowledged) || BigInt(frame.cursor) > BigInt(peer.cursor ?? '0')) { deny(peer, 'invalid_request'); return; }
            peer.acknowledged = frame.cursor;
          } else send(peer, { type: 'heartbeat', serverTime: nowISO() });
        }
        peer.lastSeen = Date.now();
      }).catch(error => fail(peer, error)).finally(() => { peer.queued--; });
    });
  });

  app.server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => socket.destroy());
    const reject = (status: number) => { if (!socket.destroyed) socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); };
    if (closing || request.url !== '/api/realtime' || request.method !== 'GET'
      || !deps.origins.includes(request.headers.origin ?? '') || request.headers['sec-websocket-protocol']) { reject(403); return; }
    const ip = request.socket.remoteAddress;
    if (pendingUpgrades >= 16 || peers.size >= 100 || [...peers].filter(peer => peer.request.socket.remoteAddress === ip).length >= 20) { reject(429); return; }
    pendingUpgrades++;
    const timeout = setTimeout(() => socket.destroy(), 5000); timeout.unref();
    void deps.authorize(request).then(actor => {
      if (closing || socket.destroyed) return;
      if (!actor) { reject(401); return; }
      if ([...peers].filter(peer => peer.actor.id === actor.id).length >= 20) { reject(429); return; }
      server.handleUpgrade(request, socket, head, ws => server.emit('connection', ws, request, actor));
    }).catch(() => { deps.report('realtime.failure', 'unavailable'); reject(503); }).finally(() => { clearTimeout(timeout); pendingUpgrades--; });
  });
  return {
    async close() {
      closing = true; clearInterval(poll);
      for (const peer of peers) peer.socket.terminate();
      await Promise.allSettled([...peers].map(peer => peer.chain));
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}

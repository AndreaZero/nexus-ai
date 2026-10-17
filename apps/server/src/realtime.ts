import { createHash } from 'node:crypto';
import type { DatabaseBoundary } from '@nexus-ai/db';
import {
  realtimeApiRequestSchema, realtimeApiResponseSchema, realtimeServerFrameSchema, liveShareSchema,
  type RealtimeApiRequest, type RealtimeApiResponse, type RealtimeSnapshot, type RealtimeServerFrame,
  type LiveShare, type LiveMessage, type SharedSession, type RealtimePresence,
} from '@nexus-ai/contracts';
import { appendRealtimeEvent, type RealtimeDatabase } from './realtime-events.js';

export type RealtimeActor = { id: string; email: string };
export type RealtimeAccess = { role: RealtimePresence['role']; name: string };
type AccessRow = { workspace_role: 'owner' | 'member'; project_role: RealtimePresence['role'] | null; author_name: string };
type ShareRow = { id: string; project_id: string; author_id: string; device_id: string; author_name: string; title: string;
  visibility: 'team' | 'client'; status: 'active' | 'stopped'; messages: LiveMessage[]; updated_at: Date };
type SessionRow = { id: string; project_id: string; created_by: string; author_name: string; title: string;
  status: SharedSession['status']; visibility: 'team' | 'client'; version: number; message_count: number; created_at: Date; updated_at: Date };
type ErrorCode = Extract<RealtimeApiResponse, { ok: false }>['code'];
type Upload = Extract<RealtimeApiRequest, { operation: 'upload' }>;

export class RealtimeError extends Error {
  constructor(readonly code: ErrorCode, message: string) { super(message); }
}
const denied = (): never => { throw new RealtimeError('forbidden', 'Progetto non disponibile per questo account.'); };
const missing = (): never => { throw new RealtimeError('not_found', 'Condivisione non disponibile per questo account.'); };
const conflict = (): never => { throw new RealtimeError('conflict', 'La condivisione è cambiata. Verifica lo stato prima di riprovare.'); };
const technical = (access: RealtimeAccess) => access.role === 'owner' || access.role === 'developer';
const invalidText = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
function storable(value: unknown): boolean {
  if (typeof value === 'string') return !value.includes('\0') && !invalidText.test(value);
  if (Array.isArray(value)) return value.every(storable);
  return !value || typeof value !== 'object' || Object.values(value).every(storable);
}

/** Same workspace → project lock order as membership mutations and session publication. */
async function access(db: RealtimeDatabase, actor: RealtimeActor, projectId: string): Promise<RealtimeAccess> {
  await db.query('SELECT w.id FROM workspace w JOIN project p ON p.workspace_id = w.id WHERE p.id = $1 FOR UPDATE OF w', [projectId]);
  await db.query('SELECT id FROM project WHERE id = $1 FOR UPDATE', [projectId]);
  const row = (await db.query<AccessRow>(`SELECT wm.role AS workspace_role, pm.role AS project_role, u.name AS author_name
    FROM project p JOIN workspace_member wm ON wm.workspace_id = p.workspace_id AND wm.user_id = $2
    JOIN "user" u ON u.id = wm.user_id LEFT JOIN project_member pm ON pm.project_id = p.id AND pm.user_id = $2
    WHERE p.id = $1 AND (wm.role = 'owner' OR pm.user_id IS NOT NULL)`, [projectId, actor.id])).rows[0] ?? denied();
  if (row.workspace_role !== 'owner' && !row.project_role) return denied();
  return { role: row.workspace_role === 'owner' ? 'owner' : row.project_role!, name: row.author_name.slice(0, 200) };
}
const shareColumns = `s.id, s.project_id, s.author_id, s.device_id, s.title, s.visibility, s.status, s.updated_at, u.name AS author_name`;
function summary(row: ShareRow): Omit<LiveShare, 'messages'> {
  return { id: row.id, projectId: row.project_id, title: row.title, visibility: row.visibility,
    author: { id: row.author_id, name: row.author_name.slice(0, 200) }, status: row.status, updatedAt: row.updated_at.toISOString() };
}
async function share(db: RealtimeDatabase, projectId: string, shareId: string, team: boolean): Promise<ShareRow> {
  const row = (await db.query<ShareRow>(`SELECT ${shareColumns}, s.messages FROM live_share s JOIN "user" u ON u.id = s.author_id
    WHERE s.project_id = $1 AND s.id = $2 AND ($3::boolean OR s.visibility = 'client')`, [projectId, shareId, team])).rows[0] ?? missing();
  if (row.project_id !== projectId || (!team && row.visibility !== 'client')) return missing();
  return row;
}
async function cursor(db: RealtimeDatabase, projectId: string): Promise<string> {
  return (await db.query<{ sequence: string }>('SELECT sequence::text FROM project_realtime_cursor WHERE project_id = $1', [projectId])).rows[0]?.sequence ?? '0';
}
async function snapshot(db: RealtimeDatabase, projectId: string, allowed: RealtimeAccess): Promise<RealtimeSnapshot> {
  const sessions = await db.query<SessionRow>(`SELECT s.id, s.project_id, s.created_by, s.title, s.status, s.visibility,
    s.version, s.created_at, s.updated_at, u.name AS author_name, jsonb_array_length(s.messages) AS message_count
    FROM ai_session s JOIN "user" u ON u.id = s.created_by WHERE s.project_id = $1 AND ($2::boolean OR s.visibility = 'client')
    ORDER BY s.updated_at DESC, s.id LIMIT 100`, [projectId, technical(allowed)]);
  const shares = await db.query<ShareRow>(`SELECT ${shareColumns} FROM live_share s JOIN "user" u ON u.id = s.author_id
    WHERE s.project_id = $1 AND ($2::boolean OR s.visibility = 'client') ORDER BY s.updated_at DESC, s.id LIMIT 100`, [projectId, technical(allowed)]);
  return { projectId, cursor: await cursor(db, projectId), sessions: sessions.rows.map(row => ({
    id: row.id, projectId: row.project_id, title: row.title, status: row.status, visibility: row.visibility,
    author: { id: row.created_by, name: row.author_name.slice(0, 200) }, version: row.version, messageCount: row.message_count,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  })), shares: shares.rows.map(summary) };
}

/** Offset updates can only extend explicitly selected IDs; terminal messages cannot resume. */
export function applyLiveUpdates(current: LiveMessage[], updates: Extract<Upload['change'], { type: 'append' }>['updates']): LiveMessage[] {
  const messages = structuredClone(current);
  for (const update of updates) {
    const message = messages.find(item => item.id === update.messageId);
    if (!message || message.text.length !== update.offset) return conflict();
    if (message.status !== 'streaming' && (update.status !== message.status || update.text.length > 0)) return conflict();
    message.text += update.text;
    message.status = update.status;
  }
  if (messages.reduce((sum, item) => sum + item.text.length, 0) > 131072) return conflict();
  return messages;
}

async function upload(db: RealtimeDatabase, actor: RealtimeActor, allowed: RealtimeAccess, request: Upload): Promise<RealtimeApiResponse> {
  if (!technical(allowed)) return denied();
  const hash = createHash('sha256').update(JSON.stringify(request.change)).digest('hex');
  const receipt = (await db.query<{ author_id: string; share_id: string; payload_hash: string; sequence: string }>(
    'SELECT author_id, share_id, payload_hash, sequence::text FROM realtime_upload WHERE project_id = $1 AND batch_id = $2', [request.projectId, request.batchId])).rows[0];
  if (receipt) {
    if (receipt.author_id !== actor.id || receipt.payload_hash !== hash || receipt.share_id !== request.change.shareId) return conflict();
    return { ok: true, kind: 'ack', batchId: request.batchId, shareId: receipt.share_id, cursor: receipt.sequence };
  }
  const change = request.change;
  if (change.type === 'start') {
    const inserted = await db.query(`INSERT INTO live_share (id, project_id, author_id, device_id, title, visibility, messages)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT (id) DO NOTHING RETURNING id`,
    [change.shareId, request.projectId, actor.id, change.deviceId, change.title, change.visibility, JSON.stringify(change.messages)]);
    if (!inserted.rows.length) return conflict();
  } else {
    const current = await share(db, request.projectId, change.shareId, true);
    if (current.author_id !== actor.id || current.device_id !== change.deviceId) return denied();
    if (current.status !== 'active') return conflict();
    const messages = change.type === 'append' ? applyLiveUpdates(current.messages, change.updates)
      : current.messages.map(message => message.status === 'streaming' ? { ...message, status: 'interrupted' as const } : message);
    await db.query(`UPDATE live_share SET messages = $3::jsonb, status = $4, updated_at = now() WHERE project_id = $1 AND id = $2`,
    [request.projectId, change.shareId, JSON.stringify(messages), change.type === 'stop' ? 'stopped' : 'active']);
  }
  const sequence = await appendRealtimeEvent(db, request.projectId, actor.id, 'live.changed', change.shareId);
  await db.query(`INSERT INTO realtime_upload (project_id, batch_id, author_id, share_id, payload_hash, sequence)
    VALUES ($1,$2,$3,$4,$5,$6::bigint)`, [request.projectId, request.batchId, actor.id, change.shareId, hash, sequence]);
  return { ok: true, kind: 'ack', batchId: request.batchId, shareId: change.shareId, cursor: sequence };
}

export function createRealtimeService(database: DatabaseBoundary, reportError?: (error: unknown) => void) {
  async function transaction<T>(action: (db: RealtimeDatabase) => Promise<T>): Promise<T> {
    if (!database.pool) throw new RealtimeError('unavailable', 'Database non disponibile.');
    const db = await database.pool.connect();
    try { await db.query('BEGIN'); const result = await action(db); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { db.release(); }
  }
  return {
    async execute(actor: RealtimeActor, input: RealtimeApiRequest): Promise<RealtimeApiResponse> {
      const parsed = realtimeApiRequestSchema.safeParse(input);
      if (!parsed.success || !storable(parsed.data)) return { ok: false, code: 'invalid_request', message: 'Richiesta realtime non valida.' };
      try {
        return await transaction(async db => {
          const allowed = await access(db, actor, parsed.data.projectId);
          const request = parsed.data;
          let result: RealtimeApiResponse;
          if (request.operation === 'snapshot') result = { ok: true, kind: 'snapshot', snapshot: await snapshot(db, request.projectId, allowed) };
          else if (request.operation === 'readShare') {
            const row = await share(db, request.projectId, request.shareId, technical(allowed));
            result = { ok: true, kind: 'share', share: liveShareSchema.parse({ ...summary(row), messages: row.messages }) };
          } else result = await upload(db, actor, allowed, request);
          return realtimeApiResponseSchema.parse(result);
        });
      } catch (error) {
        if (error instanceof RealtimeError) return { ok: false, code: error.code, message: error.message };
        reportError?.(error);
        return { ok: false, code: 'unavailable', message: 'Realtime temporaneamente non disponibile.' };
      }
    },
    access(actor: RealtimeActor, projectId: string): Promise<RealtimeAccess> { return transaction(db => access(db, actor, projectId)); },
    /** Cursor and projection are read under the same locks as publication, never across separate snapshots. */
    delivery(actor: RealtimeActor, projectId: string, previous: string | null, forceSnapshot = false): Promise<{ access: RealtimeAccess; frame: RealtimeServerFrame }> {
      return transaction(async db => {
        const allowed = await access(db, actor, projectId);
        const high = await cursor(db, projectId);
        const earliest = (await db.query<{ first: string | null }>('SELECT min(sequence)::text AS first FROM realtime_event WHERE project_id = $1', [projectId])).rows[0]?.first ?? null;
        const resync = forceSnapshot || previous !== null && (BigInt(previous) > BigInt(high) || earliest !== null && BigInt(previous) < BigInt(earliest) - 1n);
        if (previous === null || resync) return { access: allowed, frame: realtimeServerFrameSchema.parse({ type: 'snapshot', snapshot: await snapshot(db, projectId, allowed), resync }) };
        const rows = await db.query<{ event_id: string; sequence: string; kind: 'session.changed' | 'live.changed'; entity_id: string; occurred_at: Date; visible: boolean }>(
          `SELECT e.event_id, e.sequence::text, e.kind, e.entity_id, e.occurred_at,
            CASE WHEN e.kind = 'session.changed' THEN EXISTS (SELECT 1 FROM ai_session s WHERE s.project_id = e.project_id AND s.id = e.entity_id AND ($3::boolean OR s.visibility = 'client'))
            ELSE EXISTS (SELECT 1 FROM live_share s WHERE s.project_id = e.project_id AND s.id = e.entity_id AND ($3::boolean OR s.visibility = 'client')) END AS visible
          FROM realtime_event e WHERE e.project_id = $1 AND e.sequence > $2::bigint ORDER BY e.sequence LIMIT 100`, [projectId, previous, technical(allowed)]);
        // Hidden changes may invalidate a formerly public entity: replace projection without leaking its ID.
        if (rows.rows.some(row => !row.visible)) return { access: allowed, frame: realtimeServerFrameSchema.parse({ type: 'snapshot', snapshot: await snapshot(db, projectId, allowed), resync: true }) };
        const next = rows.rows.at(-1)?.sequence ?? high;
        return { access: allowed, frame: realtimeServerFrameSchema.parse({ type: 'events', projectId, cursor: next, events: rows.rows.map(row => ({
          eventId: row.event_id, projectId, sequence: row.sequence, type: row.kind, entityId: row.entity_id, occurredAt: row.occurred_at.toISOString(),
        })) }) };
      });
    },
  };
}
export type RealtimeService = ReturnType<typeof createRealtimeService>;

import { randomUUID } from 'node:crypto';
import { appendRealtimeEvent } from './realtime-events.js';
import type { DatabaseBoundary } from '@nexus-ai/db';
import {
  sessionsRequestSchema, sessionsResponseSchema, type ProjectTask, type SessionsRequest,
  type SessionsResponse, type SharedMessage, type SharedSession,
} from '@nexus-ai/contracts';

type Client = Pick<NonNullable<DatabaseBoundary['pool']>, 'query'>;
type Actor = { id: string; email: string };
type ProjectAccess = {
  workspace_id: string;
  workspace_role: 'owner' | 'member';
  project_role: 'owner' | 'developer' | 'client' | 'viewer' | null;
};
type SessionRow = {
  id: string; project_id: string; created_by: string; driver_user_id: string; device_id: string;
  title: string; status: SharedSession['status']; visibility: SharedSession['visibility'];
  version: number; created_at: Date; updated_at: Date; author_name: string;
  message_count: number; messages: SharedMessage[];
};
type Publish = Extract<SessionsRequest, { operation: 'publish' }>;
type ErrorCode = Extract<SessionsResponse, { ok: false }>['code'];

/** Error text is fixed here; database/provider content must never cross the boundary. */
export class SessionsError extends Error {
  constructor(readonly code: ErrorCode, message: string) { super(message); }
}
function deny(): never { throw new SessionsError('not_found', 'Risorsa non disponibile per questo account.'); }
function forbidden(): never { throw new SessionsError('forbidden', 'Il tuo ruolo non consente questa operazione.'); }
function conflict(): never { throw new SessionsError('conflict', 'La pubblicazione è cambiata. Ricarica la cronologia prima di riprovare.'); }

const sessionColumns = `s.id, s.project_id, s.created_by, s.driver_user_id, s.device_id,
  s.title, s.status, s.visibility, s.version, s.created_at, s.updated_at,
  u.name AS author_name, jsonb_array_length(s.messages) AS message_count`;

function sessionDTO(row: SessionRow): SharedSession {
  return {
    id: row.id, projectId: row.project_id, title: row.title, status: row.status,
    visibility: row.visibility, author: { id: row.created_by, name: row.author_name.slice(0, 200) },
    version: row.version, messageCount: row.message_count,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

/** Container locks match membership mutations: revocation and publication serialize. */
async function projectAccess(db: Client, actor: Actor, projectId: string): Promise<ProjectAccess> {
  await db.query('SELECT w.id FROM workspace w JOIN project p ON p.workspace_id = w.id WHERE p.id = $1 FOR UPDATE OF w', [projectId]);
  await db.query('SELECT id FROM project WHERE id = $1 FOR UPDATE', [projectId]);
  const row = (await db.query<ProjectAccess>(`SELECT p.workspace_id, wm.role AS workspace_role, pm.role AS project_role
    FROM project p JOIN workspace_member wm ON wm.workspace_id = p.workspace_id AND wm.user_id = $2
    LEFT JOIN project_member pm ON pm.project_id = p.id AND pm.user_id = $2
    WHERE p.id = $1 AND (wm.role = 'owner' OR pm.user_id IS NOT NULL)`, [projectId, actor.id])).rows[0] ?? deny();
  // Also defend the service boundary when a custom DB adapter violates the query predicate.
  if (row.workspace_role !== 'owner' && !row.project_role) return deny();
  return row;
}
function canSeeTeam(access: ProjectAccess): boolean {
  return access.workspace_role === 'owner' || access.project_role === 'owner' || access.project_role === 'developer';
}

async function readSession(db: Client, projectId: string, sessionId: string, team: boolean): Promise<SessionRow> {
  const row = (await db.query<SessionRow>(`SELECT ${sessionColumns}, s.messages FROM ai_session s
    JOIN "user" u ON u.id = s.created_by WHERE s.project_id = $1 AND s.id = $2
    AND ($3::boolean OR s.visibility = 'client')`, [projectId, sessionId, team])).rows[0] ?? deny();
  if (row.project_id !== projectId || (!team && row.visibility !== 'client')) return deny();
  return row;
}

function samePublication(row: SessionRow, request: Publish): boolean {
  return row.title === request.title && row.status === request.status && row.visibility === request.visibility
    && row.messages.length === request.messages.length
    && row.messages.every((message, index) => {
      const selected = request.messages[index];
      return selected?.id === message.id && selected.role === message.role && selected.text === message.text;
    });
}

async function publish(db: Client, actor: Actor, access: ProjectAccess, request: Publish): Promise<SessionsResponse> {
  if (!canSeeTeam(access)) return forbidden();
  const current = (await db.query<SessionRow>(`SELECT ${sessionColumns}, s.messages FROM ai_session s
    JOIN "user" u ON u.id = s.created_by WHERE s.project_id = $1 AND s.id = $2 FOR UPDATE OF s`,
  [request.projectId, request.sessionId])).rows[0];
  if (current) {
    if (current.project_id !== request.projectId) return deny();
    // A device identifier is a scope, never an identity credential or a substitute for Nexus auth.
    if (current.created_by !== actor.id || current.driver_user_id !== actor.id || current.device_id !== request.deviceId) return forbidden();
    if (current.version === request.expectedVersion + 1 && samePublication(current, request)) {
      return { ok: true, kind: 'session', item: sessionDTO(current), messages: current.messages };
    }
    if (current.version !== request.expectedVersion) return conflict();
    const changed = await db.query(`UPDATE ai_session SET title = $3, status = $4, visibility = $5,
      messages = $6::jsonb, version = version + 1, updated_at = now()
      WHERE id = $1 AND project_id = $2 AND version = $7 RETURNING id`,
    [request.sessionId, request.projectId, request.title, request.status, request.visibility, JSON.stringify(request.messages), request.expectedVersion]);
    if (!changed.rows.length) return conflict();
  } else {
    if (request.expectedVersion !== 0) return deny();
    const created = await db.query(`INSERT INTO ai_session
      (id, project_id, created_by, driver_user_id, device_id, title, status, visibility, messages, version)
      VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8::jsonb, 1) ON CONFLICT (id) DO NOTHING RETURNING id`,
    [request.sessionId, request.projectId, actor.id, request.deviceId, request.title, request.status, request.visibility, JSON.stringify(request.messages)]);
    if (!created.rows.length) return deny();
  }
  const row = await readSession(db, request.projectId, request.sessionId, true);
  await db.query(`INSERT INTO collaboration_event (id, workspace_id, project_id, actor_id, event_type, payload)
    VALUES ($1, $2, $3, $4, 'publishSession', $5::jsonb)`, [randomUUID(), access.workspace_id, request.projectId, actor.id,
    JSON.stringify({ sessionId: row.id, version: row.version, status: row.status, visibility: row.visibility, messageCount: row.message_count })]);
  await appendRealtimeEvent(db, request.projectId, actor.id, 'session.changed', row.id);
  return { ok: true, kind: 'session', item: sessionDTO(row), messages: row.messages };
}

async function dispatch(db: Client, actor: Actor, request: SessionsRequest): Promise<SessionsResponse> {
  const access = await projectAccess(db, actor, request.projectId);
  const team = canSeeTeam(access);
  switch (request.operation) {
    case 'publish': return publish(db, actor, access, request);
    case 'read': {
      const row = await readSession(db, request.projectId, request.sessionId, team);
      return { ok: true, kind: 'session', item: sessionDTO(row), messages: row.messages };
    }
    case 'list': {
      const rows = await db.query<SessionRow>(`SELECT ${sessionColumns} FROM ai_session s
        JOIN "user" u ON u.id = s.created_by WHERE s.project_id = $1 AND ($2::boolean OR s.visibility = 'client')
        ORDER BY s.updated_at DESC, s.id LIMIT 100`, [request.projectId, team]);
      return { ok: true, kind: 'sessions', items: rows.rows.map(sessionDTO) };
    }
    case 'listProjectTasks': {
      const rows = await db.query<ProjectTask>(`SELECT id, title, status, visibility FROM task
        WHERE project_id = $1 AND ($2::boolean OR visibility = 'client') ORDER BY updated_at DESC, id LIMIT 100`, [request.projectId, team]);
      return { ok: true, kind: 'tasks', items: rows.rows.map(row => ({ id: row.id, title: row.title, status: row.status, visibility: row.visibility })) };
    }
  }
}

export function createSessionsService(database: DatabaseBoundary, reportError?: (error: unknown) => void) {
  return {
    async execute(actor: Actor, input: SessionsRequest): Promise<SessionsResponse> {
      const parsed = sessionsRequestSchema.safeParse(input);
      if (!parsed.success || (parsed.data.operation === 'publish'
        && new Set(parsed.data.messages.map(message => message.id)).size !== parsed.data.messages.length)) {
        return { ok: false, code: 'invalid_request', message: 'Richiesta non valida. Verifica i messaggi selezionati.' };
      }
      if (!database.pool) return { ok: false, code: 'unavailable', message: 'Database non disponibile.' };
      let db: (Client & { release(): void }) | undefined;
      try {
        db = await database.pool.connect();
        await db.query('BEGIN');
        const response = sessionsResponseSchema.parse(await dispatch(db, actor, parsed.data));
        await db.query('COMMIT');
        return response;
      } catch (error) {
        await db?.query('ROLLBACK').catch(() => undefined);
        if (error instanceof SessionsError) return { ok: false, code: error.code, message: error.message };
        reportError?.(error);
        return { ok: false, code: 'unavailable', message: 'Operazione non disponibile. Riprova tra poco.' };
      } finally { db?.release(); }
    },
  };
}

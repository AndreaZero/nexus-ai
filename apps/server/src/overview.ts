import type { DatabaseBoundary } from '@nexus-ai/db';
import {
  overviewRequestSchema, overviewResponseSchema,
  type OverviewActivity, type OverviewRequest, type OverviewResponse, type ProjectTask, type LiveShare,
} from '@nexus-ai/contracts';

type Client = Pick<NonNullable<DatabaseBoundary['pool']>, 'query'>;
type Actor = { id: string; email: string };
type AccessRow = { workspace_role: 'owner' | 'member'; project_role: 'owner' | 'developer' | 'client' | 'viewer' | null };
type ActivityRow = {
  event_id: string; sequence: string; kind: 'session.changed' | 'live.changed'; entity_id: string;
  actor_id: string; author_name: string; title: string; visibility: 'team' | 'client'; status: string; occurred_at: Date;
};
type ShareRow = { id: string; project_id: string; title: string; visibility: 'team' | 'client'; status: 'active'; author_id: string; author_name: string; updated_at: Date };
type ErrorCode = Extract<OverviewResponse, { ok: false }>['code'];
export class OverviewError extends Error {
  constructor(readonly code: ErrorCode, message: string) { super(message); }
}

/** The same lock order as membership changes, publication and realtime upload. */
async function authorize(db: Client, actor: Actor, projectId: string): Promise<boolean> {
  await db.query('SELECT w.id FROM workspace w JOIN project p ON p.workspace_id = w.id WHERE p.id = $1 FOR UPDATE OF w', [projectId]);
  await db.query('SELECT id FROM project WHERE id = $1 FOR UPDATE', [projectId]);
  const row = (await db.query<AccessRow>(`SELECT wm.role AS workspace_role, pm.role AS project_role
    FROM project p JOIN workspace_member wm ON wm.workspace_id = p.workspace_id AND wm.user_id = $2
    LEFT JOIN project_member pm ON pm.project_id = p.id AND pm.user_id = $2
    WHERE p.id = $1 AND (wm.role = 'owner' OR pm.user_id IS NOT NULL)`, [projectId, actor.id])).rows[0];
  if (!row || (row.workspace_role !== 'owner' && !row.project_role)) throw new OverviewError('forbidden', 'Progetto non disponibile per questo account.');
  return row.workspace_role === 'owner' || row.project_role === 'owner' || row.project_role === 'developer';
}

/** Coalesce retained deltas before pagination; only current authorized entities enter the projection. */
async function activity(db: Client, projectId: string, team: boolean): Promise<OverviewActivity[]> {
  const result = await db.query<ActivityRow>(`WITH latest AS (
      SELECT DISTINCT ON (kind, entity_id) event_id, sequence, kind, entity_id, actor_id, occurred_at
      FROM realtime_event WHERE project_id = $1 ORDER BY kind, entity_id, sequence DESC
    ) SELECT e.event_id, e.sequence::text, e.kind, e.entity_id, e.actor_id, e.occurred_at,
      u.name AS author_name, COALESCE(s.title, l.title) AS title,
      COALESCE(s.visibility, l.visibility) AS visibility, COALESCE(s.status, l.status) AS status
    FROM latest e JOIN "user" u ON u.id = e.actor_id
    LEFT JOIN ai_session s ON e.kind = 'session.changed' AND s.id = e.entity_id AND s.project_id = $1
    LEFT JOIN live_share l ON e.kind = 'live.changed' AND l.id = e.entity_id AND l.project_id = $1
    WHERE (s.id IS NOT NULL OR l.id IS NOT NULL) AND ($2::boolean OR COALESCE(s.visibility, l.visibility) = 'client')
    ORDER BY e.sequence DESC LIMIT 1000`, [projectId, team]);
  return result.rows.map(row => ({
    id: row.event_id, sequence: row.sequence, category: 'sessions',
    kind: row.kind === 'session.changed' ? 'excerpt.published' : row.status === 'stopped' ? 'live.stopped' : 'live.updated',
    target: { kind: row.kind === 'session.changed' ? 'shared_session' : 'live_share', id: row.entity_id },
    actor: { id: row.actor_id, name: row.author_name.slice(0, 200) }, title: row.title.slice(0, 140),
    visibility: row.visibility, occurredAt: row.occurred_at.toISOString(),
  }));
}

async function dispatch(db: Client, actor: Actor, request: OverviewRequest, team: boolean): Promise<OverviewResponse> {
  const cursor = (await db.query<{ sequence: string }>('SELECT sequence::text FROM project_realtime_cursor WHERE project_id = $1', [request.projectId])).rows[0]?.sequence ?? '0';
  if (request.operation === 'markRead' && BigInt(request.through) > BigInt(cursor)) {
    throw new OverviewError('invalid_request', 'Il cursore di lettura non è ancora disponibile. Aggiorna l’overview.');
  }
  let readThrough: string;
  if (request.operation === 'markRead') {
    readThrough = (await db.query<{ sequence: string }>(`INSERT INTO overview_read_cursor (project_id, user_id, sequence)
      VALUES ($1, $2, $3::bigint) ON CONFLICT (project_id, user_id)
      DO UPDATE SET sequence = GREATEST(overview_read_cursor.sequence, EXCLUDED.sequence), updated_at = now()
      RETURNING sequence::text`, [request.projectId, actor.id, request.through])).rows[0]!.sequence;
  } else {
    readThrough = (await db.query<{ sequence: string }>('SELECT sequence::text FROM overview_read_cursor WHERE project_id = $1 AND user_id = $2', [request.projectId, actor.id])).rows[0]?.sequence ?? '0';
  }
  const items = await activity(db, request.projectId, team);
  const otherActivity = items.filter(item => item.actor.id !== actor.id);
  const unreadCount = otherActivity.filter(item => BigInt(item.sequence) > BigInt(readThrough)).length;
  if (request.operation === 'markRead') return { ok: true, kind: 'read', projectId: request.projectId, readThrough, unreadCount };
  // before is compared as BigInt here: even a syntactically valid cursor beyond int8 cannot overflow SQL.
  const candidates = request.filter !== 'all' && request.filter !== 'sessions' ? []
    : items.filter(item => request.before === null || BigInt(item.sequence) < BigInt(request.before));
  const page = candidates.slice(0, request.limit);
  const tasks = (await db.query<ProjectTask>(`SELECT id, title, status, visibility FROM task
    WHERE project_id = $1 AND ($2::boolean OR visibility = 'client') ORDER BY updated_at DESC, id LIMIT 100`, [request.projectId, team])).rows;
  const shares = (await db.query<ShareRow>(`SELECT s.id, s.project_id, s.title, s.visibility, s.status, s.author_id, u.name AS author_name, s.updated_at
    FROM live_share s JOIN "user" u ON u.id = s.author_id
    WHERE s.project_id = $1 AND s.status = 'active' AND ($2::boolean OR s.visibility = 'client')
    ORDER BY s.updated_at DESC, s.id LIMIT 100`, [request.projectId, team])).rows;
  const activeShares: Omit<LiveShare, 'messages'>[] = shares.map(row => ({ id: row.id, projectId: row.project_id, title: row.title.slice(0, 140), visibility: row.visibility,
    status: row.status, author: { id: row.author_id, name: row.author_name.slice(0, 200) }, updatedAt: row.updated_at.toISOString() }));
  const memberCount = Number((await db.query<{ count: string }>(`SELECT count(*)::text AS count FROM (
    SELECT pm.user_id FROM project_member pm JOIN project p ON p.id = pm.project_id
      JOIN workspace_member wm ON wm.workspace_id = p.workspace_id AND wm.user_id = pm.user_id WHERE pm.project_id = $1
    UNION SELECT wm.user_id FROM workspace_member wm JOIN project p ON p.workspace_id = wm.workspace_id
      WHERE p.id = $1 AND wm.role = 'owner'
    ) AS members`, [request.projectId])).rows[0]?.count ?? '0');
  return { ok: true, kind: 'overview', snapshot: {
    projectId: request.projectId, cursor, observedAt: new Date().toISOString(), activity: page,
    authorizedTargets: items.map(item => item.target),
    nextBefore: candidates.length > page.length ? page.at(-1)!.sequence : null,
    notifications: otherActivity.slice(0, 30), unreadCount, readThrough,
    tasks: tasks.map(row => ({ id: row.id, title: row.title.slice(0, 300), status: row.status, visibility: row.visibility })), activeShares, memberCount,
  } };
}

/** Compose another authorized projection inside its existing transaction. No nested BEGIN or cached role. */
export async function readOverviewInTransaction(db: Client, actor: Actor, request: OverviewRequest, options: { clientOnly?: boolean } = {}) {
  const technical = await authorize(db, actor, request.projectId);
  const team = technical && !options.clientOnly;
  return { response: await dispatch(db, actor, request, team), team };
}

export function createOverviewService(database: DatabaseBoundary, reportError?: (error: unknown) => void) {
  return {
    async execute(actor: Actor, input: OverviewRequest): Promise<OverviewResponse> {
      const parsed = overviewRequestSchema.safeParse(input);
      if (!parsed.success) return { ok: false, code: 'invalid_request', message: 'Richiesta overview non valida.' };
      if (!database.pool) return { ok: false, code: 'unavailable', message: 'Database non disponibile.' };
      let db: (Client & { release(): void }) | undefined;
      try {
        db = await database.pool.connect(); await db.query('BEGIN');
        const { response: projection } = await readOverviewInTransaction(db, actor, parsed.data);
        const response = overviewResponseSchema.parse(projection);
        await db.query('COMMIT'); return response;
      } catch (error) {
        await db?.query('ROLLBACK').catch(() => undefined);
        if (error instanceof OverviewError) return { ok: false, code: error.code, message: error.message };
        reportError?.(error);
        return { ok: false, code: 'unavailable', message: 'Overview temporaneamente non disponibile. Riprova tra poco.' };
      } finally { db?.release(); }
    },
  };
}

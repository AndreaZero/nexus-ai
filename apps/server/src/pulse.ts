import type { DatabaseBoundary } from '@nexus-ai/db';
import {
  pulseRequestSchema, pulseResponseSchema,
  type PulseProgress, type PulseRequest, type PulseResponse, type SharedSession,
} from '@nexus-ai/contracts';
import { OverviewError, readOverviewInTransaction } from './overview.js';

type Client = Pick<NonNullable<DatabaseBoundary['pool']>, 'query'>;
type Actor = { id: string; email: string };
type Counts = { total: string; completed: string; in_progress: string; planned: string };
type MilestoneRow = Counts & { id: string; title: string; visibility: 'team' | 'client'; due_at: Date | null };
type OutcomeRow = {
  id: string; project_id: string; title: string; status: 'completed'; visibility: 'team' | 'client';
  created_by: string; author_name: string; version: number; message_count: number; created_at: Date; updated_at: Date;
};

function progress(row: Counts): PulseProgress {
  const total = Number(row.total); const completed = Number(row.completed);
  return { total, completed, inProgress: Number(row.in_progress), planned: Number(row.planned),
    percent: total ? completed * 100 / total : null, source: 'visible_tasks' };
}

async function snapshot(db: Client, actor: Actor, request: PulseRequest): Promise<PulseResponse> {
  const { response: overview, team } = await readOverviewInTransaction(db, actor, {
    operation: 'snapshot', projectId: request.projectId, filter: request.filter, before: request.before, limit: request.limit,
  }, { clientOnly: request.view === 'client' });
  if (!overview.ok) return overview;
  if (overview.kind !== 'overview') throw new Error('Unexpected overview projection.');
  // Derive the UTC day from the same PostgreSQL transaction timestamp, independent of host/session timezone.
  const day = (await db.query<{ day_start: Date; day_end: Date }>(`SELECT
    date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day_start,
    (date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC' AS day_end`)).rows[0]!;
  const counts = (await db.query<Counts & { tasks_updated: string }>(`SELECT
    count(*)::text AS total,
    count(*) FILTER (WHERE status = 'done')::text AS completed,
    count(*) FILTER (WHERE status IN ('in_progress', 'review'))::text AS in_progress,
    count(*) FILTER (WHERE status = 'todo')::text AS planned,
    count(*) FILTER (WHERE updated_at >= $3 AND updated_at < $4 AND ($5::boolean OR assignee_id = $6))::text AS tasks_updated
    FROM task WHERE project_id = $1 AND ($2::boolean OR visibility = 'client')`,
  [request.projectId, team, day.day_start, day.day_end, request.scope === 'project', actor.id])).rows[0]!;
  const milestoneCount = Number((await db.query<{ count: string }>(`SELECT count(*)::text AS count
    FROM milestone WHERE project_id = $1 AND ($2::boolean OR visibility = 'client')`, [request.projectId, team])).rows[0]!.count);
  const milestones = (await db.query<MilestoneRow>(`WITH visible_milestones AS (
    SELECT id, title, visibility, due_at, created_at FROM milestone
    WHERE project_id = $1 AND ($2::boolean OR visibility = 'client')
    ORDER BY created_at, id LIMIT 100
  ) SELECT m.id, m.title, m.visibility, m.due_at,
    count(t.id)::text AS total,
    count(t.id) FILTER (WHERE t.status = 'done')::text AS completed,
    count(t.id) FILTER (WHERE t.status IN ('in_progress', 'review'))::text AS in_progress,
    count(t.id) FILTER (WHERE t.status = 'todo')::text AS planned
    FROM visible_milestones m LEFT JOIN task t ON t.milestone_id = m.id AND t.project_id = $1
      AND ($2::boolean OR t.visibility = 'client')
    GROUP BY m.id, m.title, m.visibility, m.due_at, m.created_at ORDER BY m.created_at, m.id`, [request.projectId, team])).rows;
  // Counts represent retained distinct entities changed today, not a complete historical event ledger.
  const sharedUpdates = Number((await db.query<{ count: string }>(`SELECT count(DISTINCT (e.kind, e.entity_id))::text AS count
    FROM realtime_event e
    LEFT JOIN ai_session s ON e.kind = 'session.changed' AND s.id = e.entity_id AND s.project_id = $1
    LEFT JOIN live_share l ON e.kind = 'live.changed' AND l.id = e.entity_id AND l.project_id = $1
    WHERE e.project_id = $1 AND e.occurred_at >= $3 AND e.occurred_at < $4
      AND ($5::boolean OR e.actor_id = $6) AND (s.id IS NOT NULL OR l.id IS NOT NULL)
      AND ($2::boolean OR COALESCE(s.visibility, l.visibility) = 'client')`,
  [request.projectId, team, day.day_start, day.day_end, request.scope === 'project', actor.id])).rows[0]!.count);
  const outcomes: SharedSession[] = (await db.query<OutcomeRow>(`SELECT s.id, s.project_id, s.title, s.status, s.visibility, s.created_by,
    u.name AS author_name, s.version, jsonb_array_length(s.messages) AS message_count, s.created_at, s.updated_at
    FROM ai_session s JOIN "user" u ON u.id = s.created_by
    WHERE s.project_id = $1 AND s.status = 'completed' AND ($2::boolean OR s.visibility = 'client')
    ORDER BY s.updated_at DESC, s.id LIMIT 20`, [request.projectId, team])).rows.map(row => ({
    id: row.id, projectId: row.project_id, title: row.title.slice(0, 140), status: row.status, visibility: row.visibility,
    author: { id: row.created_by, name: row.author_name.slice(0, 200) }, version: row.version, messageCount: row.message_count,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  }));
  return { ok: true, snapshot: {
    projectId: request.projectId, audience: team ? 'team' : 'client', overview: overview.snapshot,
    milestones: milestones.map(row => {
      const value = progress(row);
      return { id: row.id, title: row.title.slice(0, 300), visibility: row.visibility, dueAt: row.due_at?.toISOString() ?? null,
        state: value.total > 0 && value.completed === value.total ? 'completed' : value.completed > 0 || value.inProgress > 0 ? 'in_progress' : 'planned', progress: value };
    }), milestoneCount, progress: progress(counts),
    summary: { dayStart: day.day_start.toISOString(), dayEnd: day.day_end.toISOString(), scope: request.scope,
      tasksUpdated: Number(counts.tasks_updated), sharedUpdates, sharedSource: 'retained_entities', commits: null, comments: null, buildsDeploys: null },
    outcomes,
  } };
}

export function createPulseService(database: DatabaseBoundary, reportError?: (error: unknown) => void) {
  return {
    async execute(actor: Actor, input: PulseRequest): Promise<PulseResponse> {
      const parsed = pulseRequestSchema.safeParse(input);
      if (!parsed.success) return { ok: false, code: 'invalid_request', message: 'Richiesta Pulse non valida.' };
      if (!database.pool) return { ok: false, code: 'unavailable', message: 'Database non disponibile.' };
      let db: (Client & { release(): void }) | undefined;
      try {
        db = await database.pool.connect(); await db.query('BEGIN');
        const response = pulseResponseSchema.parse(await snapshot(db, actor, parsed.data));
        await db.query('COMMIT'); return response;
      } catch (error) {
        await db?.query('ROLLBACK').catch(() => undefined);
        if (error instanceof OverviewError) return { ok: false, code: error.code, message: error.message };
        reportError?.(error);
        return { ok: false, code: 'unavailable', message: 'Pulse temporaneamente non disponibile. Riprova tra poco.' };
      } finally { db?.release(); }
    },
  };
}

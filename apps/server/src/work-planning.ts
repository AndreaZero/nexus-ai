import { randomUUID } from 'node:crypto';
import type { PulseProgress, WorkItem, WorkRequest, WorkResponse } from '@nexus-ai/contracts';
import {
  appendWorkChange, makeWorkItem, readableTarget, requireTechnical, requireWriter, validateReferences,
  WorkError, type WorkAccess, type WorkDb,
} from './work-common.js';

type PlanningKind = 'task' | 'milestone';
type Row = {
  id: string; project_id: string; title: string; body: string; visibility: 'team' | 'client'; version: number;
  created_by: string; author_name: string; created_at: Date; updated_at: Date;
  status?: 'todo' | 'in_progress' | 'review' | 'done'; assignee_id?: string | null; assignee_name?: string | null;
  milestone_id?: string | null; source_session_id?: string | null; due_at?: Date | null;
  total?: string; completed?: string; in_progress?: string; planned?: string;
  target_kind?: Exclude<WorkItem['targetKind'], null>; target_id?: string;
};
const planningKind = (kind: string): kind is PlanningKind => kind === 'task' || kind === 'milestone';
function missing(): never { throw new WorkError('not_found', 'Elemento non disponibile per questo progetto.'); }
function invalid(message: string): never { throw new WorkError('invalid_request', message); }
function stale(): never { throw new WorkError('conflict', 'Elemento aggiornato da un altro membro. Ricarica prima di salvare.'); }

function progress(row: Row): PulseProgress {
  const total = Number(row.total ?? 0); const completed = Number(row.completed ?? 0);
  return { total, completed, inProgress: Number(row.in_progress ?? 0), planned: Number(row.planned ?? 0),
    percent: total === 0 ? null : completed * 100 / total, source: 'visible_tasks' };
}

function item(kind: PlanningKind | 'comment', row: Row): WorkItem {
  return makeWorkItem({ id: row.id, projectId: row.project_id, kind, title: row.title, body: row.body,
    visibility: row.visibility, version: row.version, author: { id: row.created_by, name: row.author_name.slice(0, 200) },
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    status: row.status ?? null,
    assignee: row.assignee_id && row.assignee_name !== null && row.assignee_name !== undefined
      ? { id: row.assignee_id, name: row.assignee_name.slice(0, 200) } : null,
    milestoneId: row.milestone_id ?? null, sourceSessionId: row.source_session_id ?? null,
    dueAt: row.due_at?.toISOString() ?? null, progress: kind === 'milestone' ? progress(row) : null,
    targetKind: row.target_kind ?? null, targetId: row.target_id ?? null,
  });
}

/** List bodies are omitted in SQL; references narrowed after publication are omitted independently. */
async function planningRows(db: WorkDb, access: WorkAccess, kind: PlanningKind, body: boolean,
  id: string | null, offset: number, limit: number): Promise<Row[]> {
  if (kind === 'task') return (await db.query<Row>(`SELECT t.id, t.project_id, t.title,
    CASE WHEN $3::boolean THEN t.description ELSE '' END AS body, t.visibility, t.version,
    t.created_by, u.name AS author_name, t.created_at, t.updated_at, t.status,
    t.assignee_id, a.name AS assignee_name, m.id AS milestone_id, s.id AS source_session_id
    FROM task t JOIN "user" u ON u.id = t.created_by LEFT JOIN "user" a ON a.id = t.assignee_id
    LEFT JOIN milestone m ON m.id = t.milestone_id AND m.project_id = t.project_id
      AND ($2::boolean OR m.visibility = 'client')
    LEFT JOIN ai_session s ON s.id = t.source_session_id AND s.project_id = t.project_id
      AND ($2::boolean OR s.visibility = 'client')
    WHERE t.project_id = $1 AND ($2::boolean OR t.visibility = 'client') AND ($4::text IS NULL OR t.id = $4)
    ORDER BY t.created_at DESC, t.id LIMIT $5 OFFSET $6`,
  [access.projectId, access.team, body, id, limit, offset])).rows;
  return (await db.query<Row>(`SELECT m.id, m.project_id, m.title,
    CASE WHEN $3::boolean THEN m.description ELSE '' END AS body, m.visibility, m.version,
    m.created_by, u.name AS author_name, m.created_at, m.updated_at, m.due_at,
    p.total, p.completed, p.in_progress, p.planned
    FROM milestone m JOIN "user" u ON u.id = m.created_by
    LEFT JOIN LATERAL (SELECT count(*)::text AS total,
      count(*) FILTER (WHERE t.status = 'done')::text AS completed,
      count(*) FILTER (WHERE t.status IN ('in_progress','review'))::text AS in_progress,
      count(*) FILTER (WHERE t.status = 'todo')::text AS planned
      FROM task t WHERE t.milestone_id = m.id AND t.project_id = m.project_id
        AND ($2::boolean OR t.visibility = 'client')) p ON true
    WHERE m.project_id = $1 AND ($2::boolean OR m.visibility = 'client') AND ($4::text IS NULL OR m.id = $4)
    ORDER BY m.due_at ASC NULLS LAST, m.created_at, m.id LIMIT $5 OFFSET $6`,
  [access.projectId, access.team, body, id, limit, offset])).rows;
}

async function listPlanning(db: WorkDb, access: WorkAccess, request: Extract<WorkRequest, { operation: 'list' }>,
  kind: PlanningKind): Promise<WorkResponse> {
  if (request.targetId !== null || request.targetKind !== null) invalid('Il filtro destinazione è disponibile soltanto per i commenti.');
  const table = kind === 'task' ? 'task' : 'milestone';
  const total = Number((await db.query<{ total: string }>(`SELECT count(*)::text AS total FROM ${table}
    WHERE project_id = $1 AND ($2::boolean OR visibility = 'client')`, [access.projectId, access.team])).rows[0]!.total);
  const rows = await planningRows(db, access, kind, false, null, request.offset, request.limit);
  return { ok: true, kind: 'list', projectId: access.projectId, entityKind: kind, items: rows.map(row => item(kind, row)), total,
    nextOffset: request.offset + rows.length < total ? request.offset + rows.length : null };
}

async function current(db: WorkDb, access: WorkAccess, kind: PlanningKind, id: string, expectedVersion: number): Promise<void> {
  const target = await readableTarget(db, access, kind, id); if (!target) missing();
  if (target.version !== expectedVersion) stale();
}

async function saveTask(db: WorkDb, access: WorkAccess, request: Extract<WorkRequest, { operation: 'saveTask' }>): Promise<WorkResponse> {
  requireTechnical(access);
  if ((request.id === null) !== (request.expectedVersion === 0)) invalid('Creazione e versione della task non coerenti.');
  if (request.id !== null) await current(db, access, 'task', request.id, request.expectedVersion);
  await validateReferences(db, access, { visibility: request.visibility, sourceSessionId: request.sourceSessionId, taskId: null, documentId: null });
  if (request.milestoneId !== null) {
    const milestone = await readableTarget(db, access, 'milestone', request.milestoneId);
    if (!milestone || (request.visibility === 'client' && milestone.visibility !== 'client')) invalid('Milestone non disponibile per questa audience.');
  }
  if (request.assigneeId !== null) {
    const member = (await db.query<{ id: string }>(`SELECT u.id FROM "user" u JOIN workspace_member wm ON wm.user_id = u.id
      JOIN project p ON p.workspace_id = wm.workspace_id LEFT JOIN project_member pm ON pm.project_id = p.id AND pm.user_id = u.id
      WHERE p.id = $1 AND u.id = $2 AND (wm.role = 'owner' OR pm.user_id IS NOT NULL)`, [access.projectId, request.assigneeId])).rows[0];
    if (!member) invalid('L’assegnatario deve essere un membro del progetto.');
  }
  const id = request.id ?? randomUUID(); let version = 1;
  if (request.id === null) await db.query(`INSERT INTO task
    (id,project_id,title,description,created_by,assignee_id,milestone_id,source_session_id,status,visibility)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, access.projectId, request.title, request.body, access.actor.id,
    request.assigneeId, request.milestoneId, request.sourceSessionId, request.status, request.visibility]);
  else {
    const saved = (await db.query<{ version: number }>(`UPDATE task SET title=$3,description=$4,assignee_id=$5,
      milestone_id=$6,source_session_id=$7,status=$8,visibility=$9,version=version+1,updated_at=now()
      WHERE project_id=$1 AND id=$2 AND version=$10 RETURNING version`, [access.projectId, id, request.title, request.body,
      request.assigneeId, request.milestoneId, request.sourceSessionId, request.status, request.visibility, request.expectedVersion])).rows[0];
    if (!saved) stale(); version = saved.version;
  }
  await appendWorkChange(db, access, 'task', id);
  return { ok: true, kind: 'changed', projectId: access.projectId, entityKind: 'task', id, version };
}

async function saveMilestone(db: WorkDb, access: WorkAccess, request: Extract<WorkRequest, { operation: 'saveMilestone' }>): Promise<WorkResponse> {
  requireTechnical(access);
  if ((request.id === null) !== (request.expectedVersion === 0)) invalid('Creazione e versione della milestone non coerenti.');
  if (request.id !== null) await current(db, access, 'milestone', request.id, request.expectedVersion);
  const id = request.id ?? randomUUID(); let version = 1;
  if (request.id === null) await db.query(`INSERT INTO milestone (id,project_id,title,description,created_by,visibility,due_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, access.projectId, request.title, request.body, access.actor.id, request.visibility, request.dueAt]);
  else {
    const saved = (await db.query<{ version: number }>(`UPDATE milestone SET title=$3,description=$4,visibility=$5,
      due_at=$6,version=version+1,updated_at=now() WHERE project_id=$1 AND id=$2 AND version=$7 RETURNING version`,
    [access.projectId, id, request.title, request.body, request.visibility, request.dueAt, request.expectedVersion])).rows[0];
    if (!saved) stale(); version = saved.version;
  }
  await appendWorkChange(db, access, 'milestone', id);
  return { ok: true, kind: 'changed', projectId: access.projectId, entityKind: 'milestone', id, version };
}

async function remove(db: WorkDb, access: WorkAccess, request: Extract<WorkRequest, { operation: 'delete' }>,
  kind: PlanningKind): Promise<WorkResponse> {
  requireTechnical(access); await current(db, access, kind, request.id, request.expectedVersion);
  if (kind === 'milestone') {
    // task.milestone_id has a non-cascading FK; detach deliberately, invalidate stale task editors.
    await db.query(`UPDATE task SET milestone_id=NULL,version=version+1,updated_at=now()
      WHERE project_id=$1 AND milestone_id=$2`, [access.projectId, request.id]);
  }
  const table = kind === 'task' ? 'task' : 'milestone';
  const deleted = (await db.query<{ id: string }>(`DELETE FROM ${table} WHERE project_id=$1 AND id=$2 AND version=$3 RETURNING id`,
    [access.projectId, request.id, request.expectedVersion])).rows[0]; if (!deleted) stale();
  await appendWorkChange(db, access, kind, request.id);
  return { ok: true, kind: 'changed', projectId: access.projectId, entityKind: kind, id: request.id, version: request.expectedVersion + 1 };
}

async function comments(db: WorkDb, access: WorkAccess,
  request: Extract<WorkRequest, { operation: 'list' | 'read' | 'addComment' }>): Promise<WorkResponse> {
  if (request.operation === 'addComment') {
    requireWriter(access); const parent = await readableTarget(db, access, request.targetKind, request.targetId); if (!parent) missing();
    const id = randomUUID();
    await db.query(`INSERT INTO work_comment (id,project_id,target_kind,target_id,body,created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, access.projectId, request.targetKind, request.targetId, request.body, access.actor.id]);
    await appendWorkChange(db, access, 'comment', id);
    return { ok: true, kind: 'changed', projectId: access.projectId, entityKind: 'comment', id, version: 1 };
  }
  if (request.operation === 'read') {
    if (request.revision !== null && request.revision !== 1) missing();
    const row = (await db.query<Row>(`SELECT c.id,c.project_id,'' AS title,c.body,1 AS version,c.created_by,
      u.name AS author_name,c.created_at,c.updated_at,c.target_kind,c.target_id
      FROM work_comment c JOIN "user" u ON u.id=c.created_by WHERE c.project_id=$1 AND c.id=$2`, [access.projectId, request.id])).rows[0];
    if (!row?.target_kind || !row.target_id) missing();
    const parent = await readableTarget(db, access, row.target_kind, row.target_id); if (!parent) missing();
    row.visibility = parent.visibility;
    return { ok: true, kind: 'item', projectId: access.projectId, item: item('comment', row) };
  }
  if (request.targetKind === null || request.targetKind === 'project' || request.targetId === null) invalid('Seleziona un elemento per leggere i suoi commenti.');
  const parent = await readableTarget(db, access, request.targetKind, request.targetId); if (!parent) missing();
  const total = Number((await db.query<{ total: string }>(`SELECT count(*)::text AS total FROM work_comment
    WHERE project_id=$1 AND target_kind=$2 AND target_id=$3`, [access.projectId, request.targetKind, request.targetId])).rows[0]!.total);
  const rows = (await db.query<Row>(`SELECT c.id,c.project_id,'' AS title,'' AS body,1 AS version,c.created_by,
    u.name AS author_name,c.created_at,c.updated_at,c.target_kind,c.target_id FROM work_comment c JOIN "user" u ON u.id=c.created_by
    WHERE c.project_id=$1 AND c.target_kind=$2 AND c.target_id=$3 ORDER BY c.created_at,c.id LIMIT $4 OFFSET $5`,
  [access.projectId, request.targetKind, request.targetId, request.limit, request.offset])).rows;
  return { ok: true, kind: 'list', projectId: access.projectId, entityKind: 'comment',
    items: rows.map(row => item('comment', { ...row, visibility: parent.visibility })), total,
    nextOffset: request.offset + rows.length < total ? request.offset + rows.length : null };
}

/** Runs only inside the coordinator's authorized, locked project transaction. */
export async function executePlanning(db: WorkDb, access: WorkAccess, request: WorkRequest): Promise<WorkResponse | null> {
  if (request.operation === 'saveTask') return saveTask(db, access, request);
  if (request.operation === 'saveMilestone') return saveMilestone(db, access, request);
  if (request.operation === 'addComment') return comments(db, access, request);
  if (request.operation === 'delete' && planningKind(request.kind)) return remove(db, access, request, request.kind);
  if (request.operation !== 'read' && request.operation !== 'list') return null;
  if (request.kind === 'comment') return comments(db, access, request);
  if (!planningKind(request.kind)) return null;
  if (request.operation === 'list') return listPlanning(db, access, request, request.kind);
  const rows = await planningRows(db, access, request.kind, true, request.id, 0, 1); const row = rows[0]; if (!row) missing();
  // Task and milestone edits replace the current document; no fabricated historical body is exposed.
  if (request.revision !== null && request.revision !== row.version) missing();
  return { ok: true, kind: 'item', projectId: access.projectId, item: item(request.kind, row) };
}

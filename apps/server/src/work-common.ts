import { randomUUID } from 'node:crypto';
import type { DatabaseBoundary } from '@nexus-ai/db';
import type { WorkItem, WorkKind, WorkResponse } from '@nexus-ai/contracts';
import { appendRealtimeEvent } from './realtime-events.js';

export type WorkDb = Pick<NonNullable<DatabaseBoundary['pool']>, 'query'>;
export interface WorkAccess { projectId: string; actor: { id: string; email: string }; role: 'owner' | 'developer' | 'client' | 'viewer'; team: boolean; }
export class WorkError extends Error {
  constructor(readonly code: Extract<WorkResponse, { ok: false }>['code'], message: string) { super(message); }
}
export function requireTechnical(access: WorkAccess) { if (access.role !== 'owner' && access.role !== 'developer') throw new WorkError('forbidden', 'Your role cannot change project work.'); }
export function requireWriter(access: WorkAccess) { if (access.role === 'viewer') throw new WorkError('forbidden', 'Your role has read-only access.'); }
export function makeWorkItem(input: Pick<WorkItem, 'id' | 'projectId' | 'kind' | 'title' | 'visibility' | 'version' | 'author' | 'createdAt' | 'updatedAt'> & Partial<WorkItem>): WorkItem {
  return { body: '', status: null, assignee: null, milestoneId: null, dueAt: null, sourceSessionId: null, taskId: null,
    documentId: null, targetKind: null, targetId: null, sentiment: null, attachments: [], progress: null, decision: null, revisions: [], ...input };
}
export async function authorizeWork(db: WorkDb, actor: WorkAccess['actor'], projectId: string, clientOnly = false): Promise<WorkAccess> {
  await db.query('SELECT w.id FROM workspace w JOIN project p ON p.workspace_id=w.id WHERE p.id=$1 FOR UPDATE OF w', [projectId]);
  await db.query('SELECT id FROM project WHERE id=$1 FOR UPDATE', [projectId]);
  const row = (await db.query<{ workspace_role: string; role: WorkAccess['role'] | null }>(`SELECT wm.role AS workspace_role, pm.role FROM project p
    JOIN workspace_member wm ON wm.workspace_id=p.workspace_id AND wm.user_id=$2
    LEFT JOIN project_member pm ON pm.project_id=p.id AND pm.user_id=$2 WHERE p.id=$1`, [projectId, actor.id])).rows[0];
  if (!row || row.workspace_role !== 'owner' && !row.role) throw new WorkError('forbidden', 'Project unavailable for this account.');
  const role = row.workspace_role === 'owner' ? 'owner' : row.role!;
  return { projectId, actor, role, team: !clientOnly && (role === 'owner' || role === 'developer') };
}
export interface WorkTarget { id: string; title: string; visibility: 'team' | 'client'; version: number; }
type ReferenceKind = WorkKind | 'project' | 'session';
const tables = { task: 'task', milestone: 'milestone', document: 'project_document', update: 'project_update', deliverable: 'deliverable', session: 'ai_session' } as const;
export async function readableTarget(db: WorkDb, access: WorkAccess, kind: ReferenceKind, id: string): Promise<WorkTarget | null> {
  if (kind === 'project') return id === access.projectId ? { id, title: 'Project feedback', visibility: 'client', version: 1 } : null;
  if (kind === 'comment' || kind === 'feedback') {
    const table = kind === 'comment' ? 'work_comment' : 'client_feedback';
    const row = (await db.query<{ id: string; target_kind: ReferenceKind; target_id: string | null }>(`SELECT id,target_kind,target_id FROM ${table} WHERE id=$1 AND project_id=$2`, [id, access.projectId])).rows[0];
    if (!row || row.target_kind === 'comment' || kind === 'feedback' && row.target_kind === 'feedback') return null;
    const parent = await readableTarget(db, access, row.target_kind, row.target_id ?? access.projectId);
    return parent ? { id, title: kind === 'feedback' ? 'Client feedback' : 'Project comment', visibility: parent.visibility, version: 1 } : null;
  }
  const table = tables[kind];
  const row = (await db.query<WorkTarget>(`SELECT id,title,visibility,version FROM ${table} WHERE id=$1 AND project_id=$2 AND ($3::boolean OR visibility='client')`, [id, access.projectId, access.team])).rows[0];
  return row ?? null;
}
export async function visibleReference(db: WorkDb, access: WorkAccess, kind: ReferenceKind, id: string | null): Promise<string | null> {
  return id && await readableTarget(db, access, kind, id) ? id : null;
}
export async function validateReferences(db: WorkDb, access: WorkAccess, input: { visibility: 'team' | 'client'; sourceSessionId?: string | null; taskId?: string | null; documentId?: string | null }): Promise<void> {
  for (const [kind, id] of [['session', input.sourceSessionId], ['task', input.taskId], ['document', input.documentId]] as const) {
    if (!id) continue;
    const target = await readableTarget(db, access, kind, id);
    if (!target || input.visibility === 'client' && target.visibility !== 'client') throw new WorkError('invalid_request', 'Choose a source in this project with the same published audience.');
  }
}
export async function appendWorkChange(db: WorkDb, access: WorkAccess, kind: WorkKind, id: string): Promise<void> {
  const changeId = randomUUID();
  await db.query('INSERT INTO work_change(id,project_id,target_kind,target_id) VALUES($1,$2,$3,$4)', [changeId, access.projectId, kind, id]);
  await appendRealtimeEvent(db, access.projectId, access.actor.id, 'work.changed', changeId);
  await db.query(`DELETE FROM work_change w WHERE w.project_id=$1 AND NOT EXISTS(SELECT 1 FROM realtime_event e WHERE e.project_id=w.project_id AND e.kind='work.changed' AND e.entity_id=w.id)`, [access.projectId]);
}

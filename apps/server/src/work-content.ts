import { randomUUID } from 'node:crypto';
import type { WorkAttachment, WorkItem, WorkKind, WorkRequest, WorkResponse } from '@nexus-ai/contracts';
import { appendWorkChange, makeWorkItem, readableTarget, requireTechnical, validateReferences, visibleReference, WorkError, type WorkAccess, type WorkDb } from './work-common.js';

type ContentKind = 'document' | 'update' | 'deliverable' | 'feedback';
type Visibility = 'team' | 'client';
type ContentRow = {
  id: string; project_id: string; title: string; body: string; visibility: Visibility; version: number;
  created_by: string; author_name: string; created_at: Date; updated_at: Date;
  source_session_id: string | null; task_id: string | null; document_id: string | null;
  status?: 'pending' | 'approved' | 'changes_requested';
  target_kind?: 'project' | 'document' | 'update' | 'deliverable'; target_id?: string | null;
  sentiment?: 'positive' | 'neutral' | 'negative' | null;
  attachment_ids?: string[]; decision?: 'approved' | 'changes_requested' | null;
  decided_by?: string | null; decided_name?: string | null; decision_body?: string; decided_at?: Date | null;
};
const tables = { document: 'project_document', update: 'project_update', deliverable: 'deliverable', feedback: 'client_feedback' } as const;
const isContentKind = (kind: WorkKind): kind is ContentKind => kind in tables;
const author = (id: string, name: string) => ({ id, name: name.slice(0, 200) });
const changed = (access: WorkAccess, kind: WorkKind, id: string, version: number): WorkResponse => ({ ok: true, kind: 'changed', projectId: access.projectId, entityKind: kind, id, version });
const notFound = () => new WorkError('not_found', 'Contenuto non disponibile per questo account.');
const conflict = () => new WorkError('conflict', 'Il contenuto è cambiato. Aggiorna prima di riprovare.');
function clientOnly(access: WorkAccess) {
  if (access.role !== 'client') throw new WorkError('forbidden', 'Questa azione richiede un membro con ruolo cliente.');
}

/** A feedback row inherits current target access, including after its target is narrowed or removed. */
function feedbackAccess(alias: string) {
  return `(${alias}.target_kind = 'project' AND ${alias}.target_id IS NULL
    OR ${alias}.target_kind = 'document' AND EXISTS(SELECT 1 FROM project_document p WHERE p.project_id = ${alias}.project_id AND p.id = ${alias}.target_id AND ($2::boolean OR p.visibility = 'client'))
    OR ${alias}.target_kind = 'update' AND EXISTS(SELECT 1 FROM project_update p WHERE p.project_id = ${alias}.project_id AND p.id = ${alias}.target_id AND ($2::boolean OR p.visibility = 'client'))
    OR ${alias}.target_kind = 'deliverable' AND EXISTS(SELECT 1 FROM deliverable p WHERE p.project_id = ${alias}.project_id AND p.id = ${alias}.target_id AND ($2::boolean OR p.visibility = 'client')))`;
}
function predicate(kind: ContentKind) {
  return kind === 'feedback' ? feedbackAccess('e') : '($2::boolean OR e.visibility = \'client\')';
}

/** List bodies are deliberately absent from SQL as well as the renderer DTO. */
function selection(kind: ContentKind, detail: boolean) {
  if (kind === 'feedback') return `e.id, e.project_id, ''::text AS title, ${detail ? 'e.body' : "''::text AS body"}, 'client'::text AS visibility, 1 AS version,
    e.created_by, u.name AS author_name, e.created_at, e.updated_at, e.target_kind, e.target_id, e.sentiment,
    NULL::text AS source_session_id, NULL::text AS task_id, NULL::text AS document_id`;
  if (kind === 'deliverable') return `e.id, e.project_id, v.title, ${detail ? 'v.body' : "''::text AS body"}, v.visibility, v.version,
    v.created_by, u.name AS author_name, v.created_at, e.updated_at, v.source_session_id, v.task_id, v.document_id, v.attachment_ids,
    COALESCE(v.decision, 'pending') AS status, v.decision, v.decided_by, du.name AS decided_name, v.decision_body, v.decided_at`;
  return `e.id, e.project_id, e.title, ${detail ? 'e.body' : "''::text AS body"}, e.visibility, e.version,
    e.created_by, u.name AS author_name, e.created_at, e.updated_at, e.source_session_id, e.task_id, e.document_id`;
}
function joins(kind: ContentKind, revision = false) {
  return kind === 'deliverable'
    ? `JOIN deliverable_version v ON v.deliverable_id = e.id AND v.version = ${revision ? '$4' : 'e.version'}
       JOIN "user" u ON u.id = v.created_by LEFT JOIN "user" du ON du.id = v.decided_by`
    : 'JOIN "user" u ON u.id = e.created_by';
}
function decision(row: ContentRow): WorkItem['decision'] {
  return row.decision && row.decided_by && row.decided_at ? {
    by: author(row.decided_by, row.decided_name ?? ''), decision: row.decision,
    body: row.decision_body ?? '', at: row.decided_at.toISOString(),
  } : null;
}
async function attachments(db: WorkDb, projectId: string, ids: string[]): Promise<WorkAttachment[]> {
  if (!ids.length) return [];
  const rows = (await db.query<WorkAttachment>(`SELECT id, name, mime, size, sha256 FROM work_attachment
    WHERE project_id = $1 AND id = ANY($2::text[])`, [projectId, ids])).rows;
  const byId = new Map(rows.map(row => [row.id, row]));
  return ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
}
async function projectItem(db: WorkDb, access: WorkAccess, kind: ContentKind, row: ContentRow, detail: boolean): Promise<WorkItem> {
  const item = makeWorkItem({ id: row.id, projectId: row.project_id, kind, title: row.title, body: detail ? row.body : '',
    visibility: row.visibility, version: row.version, author: author(row.created_by, row.author_name),
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    sourceSessionId: await visibleReference(db, access, 'session', row.source_session_id),
    taskId: await visibleReference(db, access, 'task', row.task_id), documentId: await visibleReference(db, access, 'document', row.document_id),
    targetKind: row.target_kind ?? null, targetId: row.target_id ?? null, sentiment: row.sentiment ?? null,
    status: row.status ?? null, decision: decision(row), attachments: await attachments(db, access.projectId, row.attachment_ids ?? []),
  });
  if (kind === 'feedback' && row.target_kind !== 'project' && row.target_kind && row.target_id) {
    const target = await readableTarget(db, access, row.target_kind, row.target_id);
    if (!target) throw notFound();
    item.visibility = target.visibility;
  }
  if (detail && kind === 'deliverable') {
    const revisions = (await db.query<ContentRow>(`SELECT v.version, v.created_by, u.name AS author_name, v.created_at,
      v.decision, v.decided_by, du.name AS decided_name, v.decision_body, v.decided_at
      FROM deliverable_version v JOIN "user" u ON u.id = v.created_by LEFT JOIN "user" du ON du.id = v.decided_by
      WHERE v.deliverable_id = $1 AND ($2::boolean OR v.visibility = 'client') ORDER BY v.version DESC LIMIT 50`, [row.id, access.team])).rows;
    item.revisions = revisions.map(revision => ({ version: revision.version, author: author(revision.created_by, revision.author_name),
      createdAt: revision.created_at.toISOString(), decision: decision(revision) }));
  }
  return item;
}

async function list(db: WorkDb, access: WorkAccess, request: Extract<WorkRequest, { operation: 'list' }>, kind: ContentKind): Promise<WorkResponse> {
  if ((request.targetKind === null) !== (request.targetId === null)) {
    if (!(kind === 'feedback' && request.targetKind === 'project' && request.targetId === null)) throw new WorkError('invalid_request', 'Filtro destinazione non valido.');
  }
  if (request.targetKind && kind !== 'feedback') throw new WorkError('invalid_request', 'Il filtro destinazione è disponibile per feedback e commenti.');
  if (request.targetKind && request.targetKind !== 'project' && request.targetId && !await readableTarget(db, access, request.targetKind, request.targetId)) throw notFound();
  const filter = kind === 'feedback' && request.targetKind ? ' AND e.target_kind = $3 AND e.target_id IS NOT DISTINCT FROM $4::text' : '';
  const params: unknown[] = [access.projectId, access.team];
  if (filter) params.push(request.targetKind, request.targetId);
  const where = `e.project_id = $1 AND ${predicate(kind)}${kind === 'deliverable' ? " AND ($2::boolean OR v.visibility = 'client')" : ''}${filter}`;
  const from = `FROM ${tables[kind]} e ${joins(kind)} WHERE ${where}`;
  const total = Number((await db.query<{ count: string }>(`SELECT count(*)::text AS count ${from}`, params)).rows[0]?.count ?? '0');
  const page = (await db.query<ContentRow>(`SELECT ${selection(kind, false)} ${from} ORDER BY e.updated_at DESC, e.id
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, request.limit, request.offset])).rows;
  const items = await Promise.all(page.map(row => projectItem(db, access, kind, row, false)));
  return { ok: true, kind: 'list', projectId: access.projectId, entityKind: kind, items, total,
    nextOffset: request.offset + items.length < total ? request.offset + items.length : null };
}
async function read(db: WorkDb, access: WorkAccess, request: Extract<WorkRequest, { operation: 'read' }>, kind: ContentKind): Promise<WorkResponse> {
  if (request.revision !== null && kind !== 'deliverable') throw new WorkError('invalid_request', 'Le revisioni sono disponibili soltanto per i deliverable.');
  const revision = kind === 'deliverable' && request.revision !== null;
  const row = (await db.query<ContentRow>(`SELECT ${selection(kind, true)} FROM ${tables[kind]} e ${joins(kind, revision)}
    WHERE e.project_id = $1 AND ${predicate(kind)} AND e.id = $3${kind === 'deliverable' ? " AND ($2::boolean OR v.visibility = 'client')" : ''}`,
  revision ? [access.projectId, access.team, request.id, request.revision] : [access.projectId, access.team, request.id])).rows[0];
  if (!row) throw notFound();
  return { ok: true, kind: 'item', projectId: access.projectId, item: await projectItem(db, access, kind, row, true) };
}
async function saveDocument(db: WorkDb, access: WorkAccess, request: Extract<WorkRequest, { operation: 'saveDocument' }>): Promise<WorkResponse> {
  requireTechnical(access);
  if ((request.id === null) !== (request.expectedVersion === 0)) throw new WorkError('invalid_request', 'La versione iniziale del documento deve essere zero.');
  if (request.id !== null && request.id === request.documentId) throw new WorkError('invalid_request', 'Un documento non può usare se stesso come provenienza.');
  await validateReferences(db, access, request);
  const id = request.id ?? randomUUID();
  if (request.id === null) await db.query(`INSERT INTO project_document (id,project_id,title,body,visibility,created_by,source_session_id,task_id,document_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, access.projectId, request.title, request.body, request.visibility, access.actor.id, request.sourceSessionId, request.taskId, request.documentId]);
  else {
    const updated = (await db.query<{ version: number }>(`UPDATE project_document SET title=$3,body=$4,visibility=$5,source_session_id=$6,task_id=$7,document_id=$8,
      version=version+1,updated_at=now() WHERE id=$1 AND project_id=$2 AND version=$9 RETURNING version`,
    [id, access.projectId, request.title, request.body, request.visibility, request.sourceSessionId, request.taskId, request.documentId, request.expectedVersion])).rows[0];
    if (!updated) throw conflict();
  }
  await appendWorkChange(db, access, 'document', id);
  return changed(access, 'document', id, request.expectedVersion + 1);
}
async function deleteDocument(db: WorkDb, access: WorkAccess, request: Extract<WorkRequest, { operation: 'delete' }>): Promise<WorkResponse> {
  requireTechnical(access);
  const row = (await db.query<{ id: string }>('DELETE FROM project_document WHERE project_id=$1 AND id=$2 AND version=$3 RETURNING id', [access.projectId, request.id, request.expectedVersion])).rows[0];
  if (!row) throw conflict();
  await appendWorkChange(db, access, 'document', request.id);
  return changed(access, 'document', request.id, request.expectedVersion);
}
async function publishUpdate(db: WorkDb, access: WorkAccess, request: Extract<WorkRequest, { operation: 'publishUpdate' }>): Promise<WorkResponse> {
  requireTechnical(access); await validateReferences(db, access, request);
  const id = randomUUID();
  await db.query(`INSERT INTO project_update (id,project_id,title,body,visibility,created_by,source_session_id,task_id,document_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, access.projectId, request.title, request.body, request.visibility, access.actor.id, request.sourceSessionId, request.taskId, request.documentId]);
  await appendWorkChange(db, access, 'update', id); return changed(access, 'update', id, 1);
}
async function validateAttachments(db: WorkDb, access: WorkAccess, ids: string[], deliverableId: string | null) {
  if (!ids.length) return;
  const rows = (await db.query<{ id: string }>(`SELECT a.id FROM work_attachment a WHERE a.project_id=$1 AND a.id=ANY($2::text[])
    AND (a.created_by=$3 OR EXISTS(SELECT 1 FROM deliverable_version v JOIN deliverable d ON d.id=v.deliverable_id
      WHERE d.project_id=$1 AND d.id=$4 AND v.attachment_ids ? a.id))`, [access.projectId, ids, access.actor.id, deliverableId])).rows;
  if (new Set(rows.map(row => row.id)).size !== ids.length) throw new WorkError('invalid_request', 'Allegato non disponibile per questa pubblicazione. Seleziona nuovamente i file.');
}
async function publishDeliverable(db: WorkDb, access: WorkAccess, request: Extract<WorkRequest, { operation: 'publishDeliverable' }>): Promise<WorkResponse> {
  requireTechnical(access);
  if ((request.id === null) !== (request.expectedVersion === 0)) throw new WorkError('invalid_request', 'La versione iniziale del deliverable deve essere zero.');
  if (request.expectedVersion >= 50) throw new WorkError('quota_exceeded', 'Il deliverable ha raggiunto il limite di 50 revisioni.');
  await validateReferences(db, access, request); await validateAttachments(db, access, request.attachmentIds, request.id);
  const id = request.id ?? randomUUID(); const version = request.expectedVersion + 1;
  if (request.id === null) await db.query(`INSERT INTO deliverable (id,project_id,title,visibility,version,created_by)
    VALUES ($1,$2,$3,$4,$5,$6)`, [id, access.projectId, request.title, request.visibility, version, access.actor.id]);
  else {
    const updated = (await db.query<{ version: number }>(`UPDATE deliverable SET title=$3,visibility=$4,version=version+1,status='pending',updated_at=now()
      WHERE id=$1 AND project_id=$2 AND version=$5 RETURNING version`, [id, access.projectId, request.title, request.visibility, request.expectedVersion])).rows[0];
    if (!updated) throw conflict();
  }
  await db.query(`INSERT INTO deliverable_version (deliverable_id,version,title,body,visibility,created_by,source_session_id,task_id,document_id,attachment_ids)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`, [id, version, request.title, request.body, request.visibility, access.actor.id,
    request.sourceSessionId, request.taskId, request.documentId, JSON.stringify(request.attachmentIds)]);
  await appendWorkChange(db, access, 'deliverable', id); return changed(access, 'deliverable', id, version);
}
async function decideDeliverable(db: WorkDb, access: WorkAccess, request: Extract<WorkRequest, { operation: 'decideDeliverable' }>): Promise<WorkResponse> {
  clientOnly(access);
  const target = await readableTarget(db, access, 'deliverable', request.id);
  if (!target || target.visibility !== 'client') throw notFound();
  if (target.version !== request.expectedVersion) throw conflict();
  const revision = (await db.query<{ version: number }>(`UPDATE deliverable_version v SET decision=$4,decided_by=$5,decision_body=$6,decided_at=now()
    FROM deliverable d WHERE d.id=v.deliverable_id AND d.id=$1 AND d.project_id=$2 AND d.version=$3
    AND v.version=$3 AND d.visibility='client' AND v.visibility='client' AND d.status='pending' AND v.decision IS NULL RETURNING v.version`,
  [request.id, access.projectId, request.expectedVersion, request.decision, access.actor.id, request.body])).rows[0];
  if (!revision) throw conflict();
  await db.query(`UPDATE deliverable SET status=$3,updated_at=now() WHERE id=$1 AND project_id=$2 AND version=$4 AND status='pending'`,
    [request.id, access.projectId, request.decision, request.expectedVersion]);
  await appendWorkChange(db, access, 'deliverable', request.id); return changed(access, 'deliverable', request.id, request.expectedVersion);
}
async function addFeedback(db: WorkDb, access: WorkAccess, request: Extract<WorkRequest, { operation: 'addFeedback' }>): Promise<WorkResponse> {
  clientOnly(access);
  if (request.targetKind === 'project') {
    if (request.targetId !== null) throw new WorkError('invalid_request', 'Il feedback progetto non richiede un identificatore destinazione.');
  } else {
    if (!request.targetId) throw new WorkError('invalid_request', 'Seleziona il contenuto per il feedback.');
    const target = await readableTarget(db, access, request.targetKind, request.targetId);
    if (!target || target.visibility !== 'client') throw notFound();
  }
  const id = randomUUID();
  await db.query(`INSERT INTO client_feedback (id,project_id,target_kind,target_id,body,sentiment,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, access.projectId, request.targetKind, request.targetId, request.body, request.sentiment, access.actor.id]);
  await appendWorkChange(db, access, 'feedback', id); return changed(access, 'feedback', id, 1);
}

/** Runs only inside the caller's authorized, project-locked transaction and receipt boundary. */
export async function executeContent(db: WorkDb, access: WorkAccess, request: WorkRequest): Promise<WorkResponse | null> {
  switch (request.operation) {
    case 'list': return isContentKind(request.kind) ? list(db, access, request, request.kind) : null;
    case 'read': return isContentKind(request.kind) ? read(db, access, request, request.kind) : null;
    case 'saveDocument': return saveDocument(db, access, request);
    case 'delete': return request.kind === 'document' ? deleteDocument(db, access, request) : null;
    case 'publishUpdate': return publishUpdate(db, access, request);
    case 'publishDeliverable': return publishDeliverable(db, access, request);
    case 'decideDeliverable': return decideDeliverable(db, access, request);
    case 'addFeedback': return addFeedback(db, access, request);
    default: return null;
  }
}

import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkRequest } from '@nexus-ai/contracts';
import { executeContent } from './work-content.js';
import { WorkError, type WorkAccess, type WorkDb } from './work-common.js';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const projectId = uuid(1); const stamp = new Date('2026-10-17T12:00:00Z');
const access: WorkAccess = { projectId, actor: { id: 'dev', email: 'private@example.test' }, role: 'developer', team: true };
const client: WorkAccess = { ...access, actor: { id: 'client', email: 'client@example.test' }, role: 'client', team: false };
const base = { projectId, requestId: uuid(2) };
const provenance = { sourceSessionId: null, taskId: null, documentId: null };
type Row = { id: string; project_id: string; title: string; body: string; visibility: 'team' | 'client'; version: number;
  created_by: string; author_name: string; created_at: Date; updated_at: Date; source_session_id: string | null; task_id: string | null; document_id: string | null;
  attachment_ids: string[]; decision: 'approved' | 'changes_requested' | null; decided_by: string | null; decided_name: string | null; decision_body: string; decided_at: Date | null;
  status: 'pending' | 'approved' | 'changes_requested'; target_kind?: string; target_id?: string | null; sentiment?: string | null };
function row(id: string, visibility: Row['visibility'] = 'client'): Row {
  return { id, project_id: projectId, title: 'Published content', body: '<script>plain text only</script>', visibility, version: 1,
    created_by: 'dev', author_name: 'Developer', created_at: stamp, updated_at: stamp, source_session_id: null, task_id: null, document_id: null,
    attachment_ids: [], decision: null, decided_by: null, decided_name: null, decision_body: '', decided_at: null, status: 'pending' };
}
/** Controlled SQL boundary; the coordinator verifies these statements on real PostgreSQL. */
function fixture() {
  const entities = new Map<string, Map<string, Row>>(['project_document', 'project_update', 'deliverable', 'client_feedback', 'task', 'ai_session'].map(table => [table, new Map()]));
  const versions = new Map<string, Row[]>(); const queries: { sql: string; values: unknown[] }[] = [];
  const table = (name: string) => entities.get(name)!;
  const visible = (item: Row, team: unknown) => team === true || item.visibility === 'client';
  const parentVisible = (item: Row, team: unknown) => {
    if (item.target_kind === 'project') return item.target_id === null;
    const name = { document: 'project_document', update: 'project_update', deliverable: 'deliverable' }[item.target_kind ?? ''];
    const parent = name && table(name).get(item.target_id ?? ''); return !!parent && parent.project_id === projectId && visible(parent, team);
  };
  const db = { async query(sql: string, values: unknown[] = []) {
    queries.push({ sql, values }); let result: unknown[] = [];
    if (sql.startsWith('SELECT id,title,visibility,version')) {
      const name = sql.match(/FROM (\w+)/)![1]!; const item = table(name).get(String(values[0]));
      if (item && item.project_id === values[1] && visible(item, values[2])) result = [item];
    } else if (sql.startsWith('INSERT INTO project_realtime_cursor')) result = [{ sequence: '1' }];
    else if (sql.startsWith('SELECT a.id FROM work_attachment')) result = values[2] === 'dev' ? (values[1] as string[]).filter(id => id === uuid(90)).map(id => ({ id })) : [];
    else if (sql.startsWith('SELECT id, name, mime')) result = (values[1] as string[]).map(id => ({ id, name: 'result.txt', mime: 'text/plain', size: 12, sha256: 'a'.repeat(64) }));
    else if (sql.startsWith('INSERT INTO project_document') || sql.startsWith('INSERT INTO project_update')) {
      const name = sql.startsWith('INSERT INTO project_document') ? 'project_document' : 'project_update';
      table(name).set(String(values[0]), { ...row(String(values[0])), project_id: String(values[1]), title: String(values[2]), body: String(values[3]), visibility: values[4] as Row['visibility'],
        created_by: String(values[5]), source_session_id: values[6] as string | null, task_id: values[7] as string | null, document_id: values[8] as string | null });
    } else if (sql.startsWith('UPDATE project_document')) {
      const item = table('project_document').get(String(values[0]));
      if (item && item.project_id === values[1] && item.version === values[8]) {
        item.title = String(values[2]); item.body = String(values[3]); item.visibility = values[4] as Row['visibility']; item.version++; result = [{ version: item.version }];
      }
    } else if (sql.startsWith('DELETE FROM project_document')) {
      const item = table('project_document').get(String(values[1]));
      if (item && item.project_id === values[0] && item.version === values[2]) { table('project_document').delete(item.id); result = [{ id: item.id }]; }
    } else if (sql.startsWith('INSERT INTO deliverable (')) {
      table('deliverable').set(String(values[0]), { ...row(String(values[0])), title: String(values[2]), visibility: values[3] as Row['visibility'], version: Number(values[4]) });
    } else if (sql.startsWith('INSERT INTO deliverable_version')) {
      const item = { ...row(String(values[0])), version: Number(values[1]), title: String(values[2]), body: String(values[3]), visibility: values[4] as Row['visibility'],
        created_by: String(values[5]), source_session_id: values[6] as string | null, task_id: values[7] as string | null, document_id: values[8] as string | null,
        attachment_ids: JSON.parse(String(values[9])) as string[] };
      versions.set(item.id, [...versions.get(item.id) ?? [], item]);
    } else if (sql.startsWith('UPDATE deliverable SET title')) {
      const item = table('deliverable').get(String(values[0]));
      if (item && item.project_id === values[1] && item.version === values[4]) { item.title = String(values[2]); item.visibility = values[3] as Row['visibility']; item.version++; item.status = 'pending'; result = [{ version: item.version }]; }
    } else if (sql.startsWith('UPDATE deliverable_version')) {
      const item = table('deliverable').get(String(values[0])); const revision = versions.get(String(values[0]))?.find(r => r.version === values[2]);
      if (item && revision && item.project_id === values[1] && item.version === values[2] && item.status === 'pending' && item.visibility === 'client' && revision.visibility === 'client' && !revision.decision) {
        revision.decision = values[3] as Row['decision']; revision.decided_by = String(values[4]); revision.decided_name = 'Client'; revision.decision_body = String(values[5]); revision.decided_at = stamp; result = [{ version: revision.version }];
      }
    } else if (sql.startsWith('UPDATE deliverable SET status')) {
      const item = table('deliverable').get(String(values[0])); if (item && item.version === values[3]) item.status = values[2] as Row['status'];
    } else if (sql.startsWith('INSERT INTO client_feedback')) {
      table('client_feedback').set(String(values[0]), { ...row(String(values[0])), target_kind: String(values[2]), target_id: values[3] as string | null,
        body: String(values[4]), sentiment: values[5] as string | null, created_by: String(values[6]) });
    } else if (sql.includes('FROM deliverable_version v JOIN')) result = (versions.get(String(values[0])) ?? []).filter(item => visible(item, values[1])).sort((a, b) => b.version - a.version);
    else if (/FROM (project_document|project_update|deliverable|client_feedback) e /.test(sql)) {
      const name = sql.match(/FROM (\w+) e /)![1]!;
      let candidates = [...table(name).values()].filter(item => item.project_id === values[0] && (name === 'client_feedback' ? parentVisible(item, values[1]) : visible(item, values[1])));
      if (name === 'deliverable') candidates = candidates.flatMap(item => {
        const revision = versions.get(item.id)?.find(v => v.version === (sql.includes('v.version = $4') ? values[3] : item.version));
        return revision && visible(revision, values[1]) ? [{ ...revision, updated_at: item.updated_at }] : [];
      });
      if (sql.includes('AND e.id = $3')) candidates = candidates.filter(item => item.id === values[2]);
      if (sql.includes('AND e.target_kind = $3')) candidates = candidates.filter(item => item.target_kind === values[2] && item.target_id === values[3]);
      if (sql.startsWith('SELECT count(*)')) result = [{ count: String(candidates.length) }];
      else if (sql.includes('LIMIT $')) result = candidates.slice(Number(values.at(-1)), Number(values.at(-1)) + Number(values.at(-2))).map(item => ({ ...item, body: '' }));
      else result = candidates;
    }
    return { rows: result };
  } } as unknown as WorkDb;
  return { db, table, versions, queries };
}
function documentRequest(patch: Partial<Extract<WorkRequest, { operation: 'saveDocument' }>> = {}): Extract<WorkRequest, { operation: 'saveDocument' }> {
  return { operation: 'saveDocument', ...base, ...provenance, id: null, expectedVersion: 0, title: 'Project guide', body: 'Real explicit content', visibility: 'client', ...patch };
}
function deliverableRequest(patch: Partial<Extract<WorkRequest, { operation: 'publishDeliverable' }>> = {}): Extract<WorkRequest, { operation: 'publishDeliverable' }> {
  return { operation: 'publishDeliverable', ...base, ...provenance, id: null, expectedVersion: 0, title: 'Release notes', body: 'Content selected for publication', visibility: 'client', attachmentIds: [], ...patch };
}
const errorCode = (code: string) => (error: unknown) => error instanceof WorkError && error.code === code;

test('content writes require technical role; feedback and approval require actual client role', async () => {
  for (const role of ['client', 'viewer'] as const) {
    const f = fixture(); await assert.rejects(executeContent(f.db, { ...client, role }, documentRequest()), errorCode('forbidden')); assert.equal(f.queries.length, 0);
    await assert.rejects(executeContent(f.db, { ...client, role }, deliverableRequest()), errorCode('forbidden'));
  }
  for (const role of ['owner', 'developer', 'viewer'] as const) {
    const f = fixture(); const actor = { ...access, role };
    await assert.rejects(executeContent(f.db, actor, { operation: 'addFeedback', ...base, targetKind: 'project', targetId: null, body: 'Feedback', sentiment: null }), errorCode('forbidden'));
    await assert.rejects(executeContent(f.db, actor, { operation: 'decideDeliverable', ...base, id: uuid(10), expectedVersion: 1, decision: 'approved', body: '' }), errorCode('forbidden'));
  }
});

test('document CAS and delete cannot overwrite stale or foreign rows; list omits bodies', async () => {
  const f = fixture(); const saved = await executeContent(f.db, access, documentRequest()); assert.ok(saved?.ok && saved.kind === 'changed');
  const id = saved.id; await executeContent(f.db, access, documentRequest({ id, expectedVersion: 1, body: 'Version two' }));
  await assert.rejects(executeContent(f.db, access, documentRequest({ id, expectedVersion: 1 })), errorCode('conflict'));
  await assert.rejects(executeContent(f.db, { ...access, projectId: uuid(999) }, documentRequest({ id, expectedVersion: 2 })), errorCode('conflict'));
  const listed = await executeContent(f.db, client, { operation: 'list', projectId, kind: 'document', view: 'auto', offset: 0, limit: 1, targetKind: null, targetId: null });
  assert.ok(listed?.ok && listed.kind === 'list'); assert.equal(listed.items[0]?.body, ''); assert.equal(listed.total, 1);
  const read = await executeContent(f.db, client, { operation: 'read', projectId, view: 'auto', kind: 'document', id, revision: null });
  assert.ok(read?.ok && read.kind === 'item'); assert.equal(read.item.body, 'Version two');
  await assert.rejects(executeContent(f.db, access, { operation: 'delete', ...base, kind: 'document', id, expectedVersion: 1 }), errorCode('conflict'));
  await executeContent(f.db, access, { operation: 'delete', ...base, kind: 'document', id, expectedVersion: 2 }); assert.equal(f.table('project_document').size, 0);
  assert.equal(f.queries.some(q => ['BEGIN', 'COMMIT'].includes(q.sql)), false);
});

test('public provenance cannot reference private or foreign sources and links are redacted after source narrows', async () => {
  const f = fixture(); const source = row(uuid(20), 'team'); f.table('ai_session').set(source.id, source);
  await assert.rejects(executeContent(f.db, access, documentRequest({ sourceSessionId: source.id })), errorCode('invalid_request'));
  source.visibility = 'client'; source.project_id = uuid(999);
  await assert.rejects(executeContent(f.db, access, documentRequest({ sourceSessionId: source.id })), errorCode('invalid_request'));
  source.project_id = projectId;
  const created = await executeContent(f.db, access, documentRequest({ sourceSessionId: source.id })); assert.ok(created?.ok && created.kind === 'changed'); source.visibility = 'team';
  const read = await executeContent(f.db, client, { operation: 'read', projectId, view: 'auto', kind: 'document', id: created.id, revision: null });
  assert.ok(read?.ok && read.kind === 'item'); assert.equal(read.item.sourceSessionId, null); assert.equal(read.item.body, 'Real explicit content');
  assert.equal(JSON.stringify(read).includes(source.id), false);
});

test('client approval is single per current revision, next publication resets pending and keeps immutable history', async () => {
  const f = fixture(); const created = await executeContent(f.db, access, deliverableRequest()); assert.ok(created?.ok && created.kind === 'changed');
  const decide: Extract<WorkRequest, { operation: 'decideDeliverable' }> = { operation: 'decideDeliverable', ...base, id: created.id, expectedVersion: 1, decision: 'approved', body: 'Approved by client' };
  await executeContent(f.db, client, decide); await assert.rejects(executeContent(f.db, client, decide), errorCode('conflict'));
  await executeContent(f.db, access, deliverableRequest({ id: created.id, expectedVersion: 1, body: 'Revision two' }));
  assert.equal(f.table('deliverable').get(created.id)?.status, 'pending'); assert.equal(f.versions.get(created.id)?.[0]?.decision, 'approved');
  await assert.rejects(executeContent(f.db, client, decide), errorCode('conflict'));
  const read = await executeContent(f.db, client, { operation: 'read', projectId, view: 'auto', kind: 'deliverable', id: created.id, revision: null });
  assert.ok(read?.ok && read.kind === 'item'); assert.equal(read.item.version, 2); assert.equal(read.item.decision, null); assert.equal(read.item.revisions[1]?.decision?.by.id, 'client');
  const old = await executeContent(f.db, client, { operation: 'read', projectId, view: 'auto', kind: 'deliverable', id: created.id, revision: 1 });
  assert.ok(old?.ok && old.kind === 'item'); assert.equal(old.item.body, 'Content selected for publication'); assert.equal(old.item.decision?.decision, 'approved');
  await assert.rejects(executeContent(f.db, access, deliverableRequest({ id: created.id, expectedVersion: 50 })), errorCode('quota_exceeded'));
});

test('deliverable historical access applies current parent and historical audience independently', async () => {
  const f = fixture(); const created = await executeContent(f.db, access, deliverableRequest({ visibility: 'team', body: 'Private revision' })); assert.ok(created?.ok && created.kind === 'changed');
  await executeContent(f.db, access, deliverableRequest({ id: created.id, expectedVersion: 1 }));
  await assert.rejects(executeContent(f.db, client, { operation: 'read', projectId, view: 'auto', kind: 'deliverable', id: created.id, revision: 1 }), errorCode('not_found'));
  let read = await executeContent(f.db, client, { operation: 'read', projectId, view: 'auto', kind: 'deliverable', id: created.id, revision: null }); assert.ok(read?.ok && read.kind === 'item'); assert.equal(read.item.revisions.length, 1);
  await executeContent(f.db, access, deliverableRequest({ id: created.id, expectedVersion: 2, visibility: 'team' }));
  await assert.rejects(executeContent(f.db, client, { operation: 'read', projectId, view: 'auto', kind: 'deliverable', id: created.id, revision: 2 }), errorCode('not_found'));
  read = await executeContent(f.db, access, { operation: 'read', projectId, view: 'auto', kind: 'deliverable', id: created.id, revision: 2 }); assert.ok(read?.ok && read.kind === 'item'); assert.equal(read.item.revisions.length, 3);
});

test('feedback count, page and read inherit current public target access; sentiment remains explicit', async () => {
  const f = fixture(); f.table('project_document').set(uuid(30), row(uuid(30)));
  const feedback = await executeContent(f.db, client, { operation: 'addFeedback', ...base, targetKind: 'document', targetId: uuid(30), body: 'Please adjust copy', sentiment: null }); assert.ok(feedback?.ok && feedback.kind === 'changed');
  const listing: Extract<WorkRequest, { operation: 'list' }> = { operation: 'list', projectId, kind: 'feedback', view: 'auto', offset: 0, limit: 1, targetKind: null, targetId: null };
  let result = await executeContent(f.db, client, listing); assert.ok(result?.ok && result.kind === 'list'); assert.equal(result.total, 1); assert.equal(result.items[0]?.sentiment, null);
  f.table('project_document').get(uuid(30))!.visibility = 'team';
  result = await executeContent(f.db, client, listing); assert.ok(result?.ok && result.kind === 'list'); assert.equal(result.total, 0); assert.deepEqual(result.items, []);
  await assert.rejects(executeContent(f.db, client, { operation: 'read', projectId, kind: 'feedback', view: 'auto', id: feedback.id, revision: null }), errorCode('not_found'));
  await assert.rejects(executeContent(f.db, client, { operation: 'addFeedback', ...base, targetKind: 'document', targetId: uuid(30), body: 'Hidden', sentiment: 'positive' }), errorCode('not_found'));
});

test('attachment publication accepts only own selection or existing deliverable grants, never arbitrary account IDs', async () => {
  const f = fixture(); await assert.rejects(executeContent(f.db, access, deliverableRequest({ attachmentIds: [uuid(91)] })), errorCode('invalid_request'));
  const created = await executeContent(f.db, access, deliverableRequest({ attachmentIds: [uuid(90)] })); assert.ok(created?.ok && created.kind === 'changed');
  const result = await executeContent(f.db, client, { operation: 'read', projectId, view: 'auto', kind: 'deliverable', id: created.id, revision: null });
  assert.ok(result?.ok && result.kind === 'item'); assert.equal(result.item.attachments[0]?.name, 'result.txt'); assert.equal(JSON.stringify(result).includes('base64'), false);
  assert.equal(f.queries.some(query => /SELECT.*base64/.test(query.sql)), false);
  assert.equal(await executeContent(f.db, access, { operation: 'uploadAttachment', ...base, name: 'a', mime: 'text/plain', base64: 'YQ==' }), null);
});

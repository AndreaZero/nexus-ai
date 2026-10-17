import { createHash } from 'node:crypto';
import type { DatabaseBoundary } from '@nexus-ai/db';
import { workRequestSchema, workResponseSchema, type WorkRequest, type WorkResponse } from '@nexus-ai/contracts';
import { authorizeWork, requireTechnical, requireWriter, WorkError } from './work-common.js';
import { executePlanning } from './work-planning.js';
import { executeContent } from './work-content.js';
import { executeAttachments } from './work-attachments.js';

export function createWorkService(database: DatabaseBoundary, reportError?: (error: unknown) => void) {
  return { async execute(actor: { id: string; email: string }, input: WorkRequest): Promise<WorkResponse> {
    const parsed = workRequestSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: 'invalid_request', message: 'Invalid project work request.' };
    if (!database.pool) return { ok: false, code: 'unavailable', message: 'Database unavailable.' };
    const request = parsed.data; const db = await database.pool.connect();
    try {
      await db.query('BEGIN');
      const access = await authorizeWork(db, actor, request.projectId, 'view' in request && request.view === 'client');
      const mutation = 'requestId' in request;
      let hash = '';
      if (mutation) {
        requireWriter(access);
        if (['addFeedback', 'decideDeliverable'].includes(request.operation)) {
          if (access.role !== 'client') throw new WorkError('forbidden', 'A project client must submit this decision or feedback.');
        } else if (request.operation !== 'addComment') requireTechnical(access);
        hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
        const receipt = (await db.query<{ payload_hash: string; response: unknown }>('SELECT payload_hash,response FROM work_receipt WHERE project_id=$1 AND actor_id=$2 AND request_id=$3', [request.projectId, actor.id, request.requestId])).rows[0];
        if (receipt) {
          if (receipt.payload_hash !== hash) throw new WorkError('conflict', 'This request ID was already used for different content.');
          await db.query('COMMIT'); return workResponseSchema.parse(receipt.response);
        }
        const count = Number((await db.query<{ count: string }>('SELECT count(*)::text AS count FROM work_receipt WHERE project_id=$1', [request.projectId])).rows[0]?.count ?? 0);
        if (count >= 100000) throw new WorkError('quota_exceeded', 'This project has reached its mutation receipt limit.');
      }
      const result = await executePlanning(db, access, request) ?? await executeContent(db, access, request) ?? await executeAttachments(db, access, request);
      if (!result) throw new WorkError('invalid_request', 'Unsupported project work operation.');
      const response = workResponseSchema.parse(result);
      if (!response.ok) throw new WorkError(response.code, response.message);
      if (mutation) await db.query('INSERT INTO work_receipt(project_id,actor_id,request_id,payload_hash,response) VALUES($1,$2,$3,$4,$5::jsonb)', [request.projectId, actor.id, request.requestId, hash, JSON.stringify(response)]);
      await db.query('COMMIT'); return response;
    } catch (error) {
      await db.query('ROLLBACK').catch(() => undefined);
      if (error instanceof WorkError) return { ok: false, code: error.code, message: error.message };
      reportError?.(error); return { ok: false, code: 'unavailable', message: 'Project work is temporarily unavailable. Retry after checking the connection.' };
    } finally { db.release(); }
  } };
}

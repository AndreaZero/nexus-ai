import { createHash, randomUUID } from 'node:crypto';
import type { WorkAttachment, WorkRequest, WorkResponse } from '@nexus-ai/contracts';
import { WorkError, type WorkAccess, type WorkDb, readableTarget, requireTechnical } from './work-common.js';
type Row = { id: string; name: string; mime: string; size: number; sha256: string; base64: string; created_by: string };
const allowedMime = new Set(['text/plain', 'text/markdown', 'application/pdf', 'image/png', 'image/jpeg', 'application/json']);
function metadata(row: Row): WorkAttachment { return { id: row.id, name: row.name, mime: row.mime, size: row.size, sha256: row.sha256 }; }
async function references(db: WorkDb, access: WorkAccess, id: string) {
  return (await db.query<{ id: string; visibility: 'team' | 'client'; revision_visibility: 'team' | 'client' }>(`SELECT d.id,d.visibility,v.visibility AS revision_visibility FROM deliverable d
    JOIN deliverable_version v ON v.deliverable_id=d.id WHERE d.project_id=$1 AND v.attachment_ids ? $2`, [access.projectId, id])).rows;
}
export async function executeAttachments(db: WorkDb, access: WorkAccess, request: WorkRequest): Promise<WorkResponse | null> {
  if (request.operation === 'listAttachments') {
    requireTechnical(access);
    if (!access.team) throw new WorkError('forbidden', 'Unused uploads are private to the technical author.');
    const rows = (await db.query<Row>(`SELECT a.id,a.name,a.mime,a.size,a.sha256 FROM work_attachment a WHERE a.project_id=$1 AND a.created_by=$2
      AND NOT EXISTS(SELECT 1 FROM deliverable_version v JOIN deliverable d ON d.id=v.deliverable_id WHERE d.project_id=$1 AND v.attachment_ids ? a.id)
      ORDER BY a.created_at DESC,a.id LIMIT 100`, [access.projectId, access.actor.id])).rows;
    return { ok: true, kind: 'uploads', projectId: access.projectId, items: rows.map(metadata) };
  }
  if (request.operation === 'uploadAttachment') {
    requireTechnical(access);
    const name = request.name.normalize('NFC');
    if (name !== name.trim() || [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || /[/\\<>:"|?*]/.test(name) || name.startsWith('.') ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || /(?:\.env|credentials?|secrets?|auth\.json|id_rsa|\.pem$|\.key$|lock$)/i.test(name) ||
      /\.(?:html?|svg|exe|msi|bat|cmd|ps1|sh|app|dmg|dll)$/i.test(name) || !allowedMime.has(request.mime)) throw new WorkError('invalid_request', 'Choose a plain text, PDF, PNG or JPEG attachment with a safe filename.');
    const bytes = Buffer.from(request.base64, 'base64');
    if (!bytes.length || bytes.length > 1048576 || bytes.toString('base64') !== request.base64) throw new WorkError('invalid_request', 'The attachment is invalid or exceeds 1 MiB.');
    const prefix = bytes.subarray(0, 8).toString('hex');
    if (request.mime === 'application/pdf' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) ||
      request.mime === 'image/png' && prefix !== '89504e470d0a1a0a' || request.mime === 'image/jpeg' && prefix.slice(0, 6) !== 'ffd8ff') throw new WorkError('invalid_request', 'The file does not match its declared type.');
    if (request.mime.startsWith('text/') || request.mime === 'application/json') {
      try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new WorkError('invalid_request', 'Text attachments must be UTF-8.'); }
      if (bytes.includes(0)) throw new WorkError('invalid_request', 'Choose a text file without binary content.');
    }
    const total = Number((await db.query<{ total: string }>('SELECT COALESCE(sum(size),0)::text AS total FROM work_attachment WHERE project_id=$1', [access.projectId])).rows[0]?.total ?? 0);
    if (total + bytes.length > 20 * 1048576) throw new WorkError('quota_exceeded', 'This project has reached its 20 MiB attachment limit. Remove unused uploads first.');
    const row: Row = { id: randomUUID(), name, mime: request.mime, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), base64: request.base64, created_by: access.actor.id };
    await db.query('INSERT INTO work_attachment(id,project_id,created_by,name,mime,size,sha256,base64) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [row.id, access.projectId, access.actor.id, name, row.mime, row.size, row.sha256, row.base64]);
    return { ok: true, kind: 'uploaded', projectId: access.projectId, attachment: metadata(row) };
  }
  if (request.operation !== 'readAttachment' && request.operation !== 'deleteAttachment') return null;
  const row = (await db.query<Row>('SELECT id,name,mime,size,sha256,base64,created_by FROM work_attachment WHERE project_id=$1 AND id=$2', [access.projectId, request.id])).rows[0];
  if (!row) throw new WorkError('not_found', 'Attachment unavailable.');
  const refs = await references(db, access, row.id);
  if (request.operation === 'deleteAttachment') {
    requireTechnical(access);
    if (row.created_by !== access.actor.id || refs.length) throw new WorkError('forbidden', 'Published attachments and uploads from another author cannot be removed.');
    await db.query('DELETE FROM work_attachment WHERE project_id=$1 AND id=$2', [access.projectId, row.id]);
    return { ok: true, kind: 'attachmentDeleted', projectId: access.projectId, id: row.id };
  }
  let permitted = access.team && row.created_by === access.actor.id;
  for (const ref of refs) if ((access.team || ref.visibility === 'client' && ref.revision_visibility === 'client') && await readableTarget(db, access, 'deliverable', ref.id)) permitted = true;
  if (!permitted) throw new WorkError('not_found', 'Attachment unavailable for this audience.');
  return { ok: true, kind: 'attachment', projectId: access.projectId, attachment: metadata(row), base64: row.base64 };
}

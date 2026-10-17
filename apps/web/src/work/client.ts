import { workRequestSchema, workResponseSchema } from '@nexus-ai/contracts';
import type { WorkAttachment, WorkRequest } from '@nexus-ai/contracts';
import { accountServerUrl } from '../auth/configuration.js';

export class WorkFailure extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
export async function workRequest(input: WorkRequest, signal?: AbortSignal) {
  const request = workRequestSchema.parse(input);
  let value: unknown; let httpOk = true;
  if (window.nexusDesktop?.work) value = await window.nexusDesktop.work.request(request);
  else {
    const server = accountServerUrl();
    if (!server) throw new Error('Configure the account server first.');
    const response = await fetch(new URL('api/work', server), { method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(request), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
    httpOk = response.ok; value = await response.json();
  }
  const result = workResponseSchema.parse(value);
  if (!result.ok) throw new WorkFailure(result.code, result.message);
  if (!httpOk) throw new Error('The project work service is unavailable. Retry.');
  if (result.projectId !== request.projectId || result.kind === 'item' && result.item.projectId !== request.projectId || result.kind === 'list' && result.items.some(item => item.projectId !== request.projectId)) throw new Error('The response belongs to another project.');
  if (request.operation === 'list' && (result.kind !== 'list' || result.entityKind !== request.kind)) throw new Error('Unexpected project list response.');
  if (request.operation === 'read' && (result.kind !== 'item' || result.item.id !== request.id || result.item.kind !== request.kind)) throw new Error('Unexpected project detail response.');
  if (request.operation === 'read' && request.revision !== null && result.kind === 'item' && result.item.version !== request.revision) throw new Error('Unexpected deliverable revision.');
  if (request.operation === 'readAttachment' && (result.kind !== 'attachment' || result.attachment.id !== request.id)) throw new Error('Unexpected attachment response.');
  if (request.operation === 'uploadAttachment' && result.kind !== 'uploaded') throw new Error('Unexpected upload response.');
  if (request.operation === 'deleteAttachment' && (result.kind !== 'attachmentDeleted' || result.id !== request.id)) throw new Error('Unexpected attachment deletion response.');
  if (request.operation === 'listAttachments' && result.kind !== 'uploads') throw new Error('Unexpected attachment list response.');
  const entityKind = request.operation === 'saveTask' ? 'task' : request.operation === 'saveMilestone' ? 'milestone' : request.operation === 'saveDocument' ? 'document' : request.operation === 'publishUpdate' ? 'update' : request.operation === 'publishDeliverable' || request.operation === 'decideDeliverable' ? 'deliverable' : request.operation === 'addFeedback' ? 'feedback' : request.operation === 'addComment' ? 'comment' : request.operation === 'delete' ? request.kind : null;
  if (entityKind && (result.kind !== 'changed' || result.entityKind !== entityKind || 'id' in request && request.id !== null && result.id !== request.id)) throw new Error('Unexpected project change response.');
  if ('view' in request && request.view === 'client' && (result.kind === 'item' ? result.item.visibility !== 'client' : result.kind === 'list' && result.items.some(item => item.visibility !== 'client'))) throw new Error('The client audience could not be verified.');
  return result;
}
export async function downloadWork(projectId: string, attachment: WorkAttachment, view: 'auto' | 'client') {
  if (window.nexusDesktop?.work) {
    const result = workResponseSchema.parse(await window.nexusDesktop.work.download({ projectId, id: attachment.id, view }));
    if (!result.ok) throw new WorkFailure(result.code, result.message);
    if (result.kind !== 'saved' || result.projectId !== projectId) throw new Error('Unexpected download response.');
    return result.saved;
  }
  const result = await workRequest({ operation: 'readAttachment', projectId, id: attachment.id, view });
  if (result.kind !== 'attachment' || result.attachment.id !== attachment.id) throw new Error('Unexpected attachment response.');
  const bytes = Uint8Array.from(atob(result.base64), value => value.charCodeAt(0));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
  if (bytes.byteLength !== result.attachment.size || hash !== result.attachment.sha256) throw new Error('The downloaded file could not be verified. Retry the current revision.');
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.attachment.name; anchor.rel = 'noopener'; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000); return true;
}

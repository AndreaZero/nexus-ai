import { workRequestSchema, workResponseSchema, type WorkRequest, type WorkResponse } from '@nexus-ai/contracts';
import { AUTH_SCHEME, publicServiceUrl } from './auth-config.ts';
import { readBoundedJson } from './overview-transport.ts';
export async function requestWork(server: string, cookie: string, input: WorkRequest, fetcher: typeof fetch = fetch): Promise<WorkResponse> {
  const request = workRequestSchema.safeParse(input);
  if (!request.success) return { ok: false, code: 'invalid_request', message: 'Invalid project work request.' };
  if (!cookie) return { ok: false, code: 'auth_required', message: 'Sign in to Nexus to continue.' };
  try {
    const response = await fetcher(new URL('/api/work', publicServiceUrl(server)), { method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Origin: `${AUTH_SCHEME}:/`, Cookie: cookie }, body: JSON.stringify(request.data), signal: AbortSignal.timeout(15000) });
    if (response.redirected) throw new Error();
    const result = workResponseSchema.parse(await readBoundedJson(response, 3 * 1048576));
    if (!response.ok && result.ok) throw new Error();
    if (!result.ok) return result;
    if (result.projectId !== request.data.projectId) throw new Error();
    const req = request.data;
    if (req.operation === 'listAttachments') { if (result.kind !== 'uploads') throw new Error(); }
    else if (req.operation === 'list') {
      if (result.kind !== 'list' || result.entityKind !== req.kind || result.items.some(item => item.projectId !== req.projectId || item.kind !== req.kind || req.view === 'client' && item.visibility !== 'client')) throw new Error();
    } else if (req.operation === 'read') {
      if (result.kind !== 'item' || result.item.projectId !== req.projectId || result.item.id !== req.id || result.item.kind !== req.kind || req.view === 'client' && result.item.visibility !== 'client') throw new Error();
    } else if (req.operation === 'readAttachment') {
      if (result.kind !== 'attachment' || result.attachment.id !== req.id) throw new Error();
    } else if (req.operation === 'uploadAttachment') { if (result.kind !== 'uploaded') throw new Error(); }
    else if (req.operation === 'deleteAttachment') { if (result.kind !== 'attachmentDeleted' || result.id !== req.id) throw new Error(); }
    else if (result.kind !== 'changed' || 'id' in req && req.id !== null && result.id !== req.id) throw new Error();
    return result;
  } catch { return { ok: false, code: 'unavailable', message: 'Project work server unavailable. Check the connection and retry.' }; }
}

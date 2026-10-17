import { overviewRequestSchema, overviewResponseSchema, type OverviewRequest, type OverviewResponse } from '@nexus-ai/contracts';
import { AUTH_SCHEME, publicServiceUrl } from './auth-config.ts';

const MAX_RESPONSE_BYTES = 1024 * 1024;

export async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('Invalid response size.');
  if (Number(response.headers.get('Content-Length')) > MAX_RESPONSE_BYTES) {
    await response.body.cancel().catch(() => undefined);
    throw new Error('Invalid response size.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error('Invalid response size.');
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
}

/** Main-only fixed endpoint; renderer input cannot choose URL, credentials or headers. */
export async function requestOverview(
  server: string, cookie: string, input: OverviewRequest, fetcher: typeof fetch = fetch,
): Promise<OverviewResponse> {
  const request = overviewRequestSchema.safeParse(input);
  if (!request.success) return { ok: false, code: 'invalid_request', message: 'The overview request is invalid.' };
  if (!cookie) return { ok: false, code: 'auth_required', message: 'Sign in to Nexus AI to continue.' };
  try {
    const response = await fetcher(new URL('/api/overview', publicServiceUrl(server)), {
      method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Origin: `${AUTH_SCHEME}:/`, Cookie: cookie },
      body: JSON.stringify(request.data), signal: AbortSignal.timeout(10_000),
    });
    if (response.redirected) throw new Error('Unexpected redirect.');
    const parsed = overviewResponseSchema.safeParse(await readBoundedJson(response));
    if (!parsed.success || (!response.ok && parsed.data.ok)) throw new Error('Invalid overview response.');
    if (parsed.data.ok && (parsed.data.kind === 'overview' ? parsed.data.snapshot.projectId : parsed.data.projectId) !== request.data.projectId) {
      throw new Error('Unexpected project.');
    }
    if (parsed.data.ok && ((request.data.operation === 'snapshot') !== (parsed.data.kind === 'overview'))) throw new Error('Unexpected operation.');
    return parsed.data;
  } catch {
    return { ok: false, code: 'unavailable', message: 'The overview server is unavailable. Check your connection and retry.' };
  }
}

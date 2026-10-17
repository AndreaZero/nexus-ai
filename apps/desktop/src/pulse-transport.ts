import { pulseRequestSchema, pulseResponseSchema, type PulseRequest, type PulseResponse } from '@nexus-ai/contracts';
import { AUTH_SCHEME, publicServiceUrl } from './auth-config.ts';
import { readBoundedJson } from './overview-transport.ts';

/** Main-only endpoint and credentials. Every projection is authorized again by the server. */
export async function requestPulse(
  server: string, cookie: string, input: PulseRequest, fetcher: typeof fetch = fetch,
): Promise<PulseResponse> {
  const request = pulseRequestSchema.safeParse(input);
  if (!request.success) return { ok: false, code: 'invalid_request', message: 'The Pulse request is invalid.' };
  if (!cookie) return { ok: false, code: 'auth_required', message: 'Sign in to Nexus AI to continue.' };
  try {
    const response = await fetcher(new URL('/api/pulse', publicServiceUrl(server)), {
      method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Origin: `${AUTH_SCHEME}:/`, Cookie: cookie },
      body: JSON.stringify(request.data), signal: AbortSignal.timeout(10_000),
    });
    if (response.redirected) throw new Error('Unexpected redirect.');
    const parsed = pulseResponseSchema.safeParse(await readBoundedJson(response));
    if (!parsed.success || (!response.ok && parsed.data.ok)) throw new Error('Invalid Pulse response.');
    if (parsed.data.ok && (parsed.data.snapshot.projectId !== request.data.projectId ||
      parsed.data.snapshot.overview.projectId !== request.data.projectId || parsed.data.snapshot.summary.scope !== request.data.scope ||
      (request.data.view === 'client' && parsed.data.snapshot.audience !== 'client'))) throw new Error('Unexpected audience or project.');
    return parsed.data;
  } catch {
    return { ok: false, code: 'unavailable', message: 'The Pulse server is unavailable. Check your connection and retry.' };
  }
}

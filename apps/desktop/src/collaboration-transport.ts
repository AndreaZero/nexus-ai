import { collaborationRequestSchema, collaborationResponseSchema, type CollaborationRequest, type CollaborationResponse } from '@nexus-ai/contracts';
import { AUTH_SCHEME, publicServiceUrl } from './auth-config.ts';

/** Main-only fixed domain transport. Credentials and endpoints never come from IPC. */
export async function requestCollaboration(
  server: string, cookie: string, input: CollaborationRequest, fetcher: typeof fetch = fetch,
): Promise<CollaborationResponse> {
  const request = collaborationRequestSchema.safeParse(input);
  if (!request.success) return { ok: false, code: 'invalid_request', message: 'The workspace request is invalid.' };
  if (!cookie) return { ok: false, code: 'auth_required', message: 'Sign in to Nexus AI to continue.' };
  try {
    const response = await fetcher(new URL('/api/collaboration', publicServiceUrl(server)), {
      method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Origin: `${AUTH_SCHEME}:/`, Cookie: cookie },
      body: JSON.stringify(request.data), signal: AbortSignal.timeout(10_000),
    });
    const parsed = collaborationResponseSchema.safeParse(await response.json());
    if (!parsed.success || (!response.ok && parsed.data.ok)) throw new Error('Invalid workspace response.');
    return parsed.data;
  } catch {
    return { ok: false, code: 'unavailable', message: 'The workspace server is unavailable. Check your connection and retry.' };
  }
}

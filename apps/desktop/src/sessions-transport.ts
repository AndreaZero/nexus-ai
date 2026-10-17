import { sessionsRequestSchema, sessionsResponseSchema, type SessionsRequest, type SessionsResponse } from '@nexus-ai/contracts';
import { AUTH_SCHEME, publicServiceUrl } from './auth-config.ts';

/** Fixed domain endpoint. No renderer URL/header/cookie or provider credential. */
export async function requestSessions(server: string, cookie: string, input: SessionsRequest, fetcher: typeof fetch = fetch): Promise<SessionsResponse> {
  const request = sessionsRequestSchema.safeParse(input);
  if (!request.success) return { ok: false, code: 'invalid_request', message: 'Check the selected session excerpt and try again.' };
  if (!cookie) return { ok: false, code: 'auth_required', message: 'Sign in to Nexus AI to continue.' };
  try {
    const response = await fetcher(new URL('/api/sessions', publicServiceUrl(server)), {
      method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Origin: `${AUTH_SCHEME}:/`, Cookie: cookie },
      body: JSON.stringify(request.data), signal: AbortSignal.timeout(10_000),
    });
    const parsed = sessionsResponseSchema.safeParse(await response.json());
    if (!parsed.success || (!response.ok && parsed.data.ok)) throw new Error('Invalid session response.');
    return parsed.data;
  } catch { return { ok: false, code: 'unavailable', message: 'The session server is unavailable. Check its log and retry.' }; }
}

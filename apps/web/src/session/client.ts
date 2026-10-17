import { contextRequestSchema, contextResponseSchema, sessionsRequestSchema, sessionsResponseSchema } from '@nexus-ai/contracts';
import type { ContextRequest, SessionsRequest } from '@nexus-ai/contracts';
import { accountServerUrl } from '../auth/configuration.js';

export async function contextRequest(input: ContextRequest) {
  if (!window.nexusDesktop?.context) throw new Error('Local context is available in the desktop app.');
  const result = contextResponseSchema.parse(await window.nexusDesktop.context.request(contextRequestSchema.parse(input)));
  if (!result.ok) throw new Error(result.message);
  return result;
}
export async function sessionsRequest(input: SessionsRequest) {
  const request = sessionsRequestSchema.parse(input);
  try {
    let value: unknown;
    if (window.nexusDesktop?.sessions) value = await window.nexusDesktop.sessions.request(request);
    else {
      const server = accountServerUrl();
      if (!server) throw new Error('configuration');
      const response = await fetch(new URL('api/sessions', server), { method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, signal: AbortSignal.timeout(12000), body: JSON.stringify(request) });
      value = await response.json();
    }
    const result = sessionsResponseSchema.parse(value);
    if (!result.ok) throw new Error(result.message);
    return result;
  } catch (cause) { throw new Error(cause instanceof Error && cause.name === 'Error' ? cause.message : 'The shared session service is unavailable. Check the server and retry.', { cause }); }
}

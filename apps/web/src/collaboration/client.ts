import { collaborationRequestSchema, collaborationResponseSchema, localBindingRequestSchema, localBindingResponseSchema } from '@nexus-ai/contracts';
import type { CollaborationRequest, CollaborationResponse, LocalBindingRequest } from '@nexus-ai/contracts';
import { accountServerUrl } from '../auth/configuration.js';

export class CollaborationError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

/** Domain-only transport. Desktop credentials remain in the main process. */
export async function collaborationRequest(request: CollaborationRequest): Promise<Extract<CollaborationResponse, { ok: true }>> {
  const parsed = collaborationRequestSchema.safeParse(request);
  if (!parsed.success) throw new CollaborationError('invalid_request', 'Check the fields and try again.');
  try {
    let value: unknown;
    if (window.nexusDesktop) value = await window.nexusDesktop.collaboration.request(parsed.data);
    else {
      const server = accountServerUrl();
      if (!server) throw new Error('configuration');
      const response = await fetch(new URL('api/collaboration', server), {
        method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000), body: JSON.stringify(parsed.data),
      });
      value = await response.json();
    }
    const result = collaborationResponseSchema.parse(value);
    if (!result.ok) throw new CollaborationError(result.code, result.message);
    return result;
  } catch (error) {
    if (error instanceof CollaborationError) throw error;
    throw new CollaborationError('unavailable', 'The workspace service is unavailable. Check the server connection and retry.');
  }
}

export async function localBindingRequest(request: LocalBindingRequest) {
  if (!window.nexusDesktop) throw new CollaborationError('unavailable', 'Local folders are available in the desktop app.');
  try {
    const result = localBindingResponseSchema.parse(await window.nexusDesktop.localBinding.request(localBindingRequestSchema.parse(request)));
    if (!result.ok) throw new CollaborationError(result.code, result.message);
    return result.binding;
  } catch (error) {
    if (error instanceof CollaborationError) throw error;
    throw new CollaborationError('unavailable', 'The local folder could not be accessed. Retry from the desktop app.');
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof CollaborationError ? error.message : 'This change could not be completed. Retry after checking your connection.';
}

import { applicationRequestSchema, applicationResponseSchema, desktopPreferencesRequestSchema, desktopPreferencesResponseSchema } from '@nexus-ai/contracts';
import type { ApplicationRequest, DesktopPreferencesRequest } from '@nexus-ai/contracts';
import { accountServerUrl } from '../auth/configuration.js';

export class ApplicationFailure extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
async function boundedJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return response.json() as Promise<unknown>;
  const chunks: Uint8Array[] = []; let bytes = 0;
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 1048576) throw new Error('The application response is too large.'); chunks.push(chunk.value); } }
  finally { await reader.cancel().catch(() => {}); }
  const buffer = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
}
export async function applicationRequest(input: ApplicationRequest, signal?: AbortSignal) {
  const request = applicationRequestSchema.parse(input); let value: unknown; let httpOk = true;
  if (window.nexusDesktop?.application) value = await window.nexusDesktop.application.request(request);
  else {
    const server = accountServerUrl(); if (!server) throw new Error('Configure the account server first.');
    const response = await fetch(new URL('api/application', server), { method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(request), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
    httpOk = response.ok; value = await boundedJson(response);
  }
  if (signal?.aborted) throw new DOMException('The request was cancelled.', 'AbortError');
  const result = applicationResponseSchema.parse(value);
  if (!result.ok) throw new ApplicationFailure(result.code, result.message);
  if (!httpOk) throw new Error('The application service is unavailable. Retry.');
  if (request.operation === 'search') {
    if (result.kind !== 'search' || result.query !== request.query || result.items.some(item => request.projectId && item.projectId !== request.projectId || request.kind && item.kind !== request.kind) || result.nextOffset !== null && result.nextOffset <= request.offset) throw new Error('Unexpected search response.');
  } else if (result.kind !== 'settings') throw new Error('Unexpected settings response.');
  return result;
}
export async function desktopPreferencesRequest(input: DesktopPreferencesRequest) {
  const request = desktopPreferencesRequestSchema.parse(input);
  if (!window.nexusDesktop?.preferences) throw new Error('Connection preferences are available in the desktop app.');
  const result = desktopPreferencesResponseSchema.parse(await window.nexusDesktop.preferences.request(request));
  if (!result.ok) throw new ApplicationFailure(result.code, result.message);
  return result.preferences;
}

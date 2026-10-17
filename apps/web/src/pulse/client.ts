import { pulseRequestSchema, pulseResponseSchema } from '@nexus-ai/contracts';
import type { PulseRequest } from '@nexus-ai/contracts';
import { accountServerUrl } from '../auth/configuration.js';
export async function pulseRequest(input: PulseRequest, signal?: AbortSignal) {
  const request = pulseRequestSchema.parse(input);
  let value: unknown; let httpOk = true;
  if (window.nexusDesktop?.pulse) value = await window.nexusDesktop.pulse.request(request);
  else {
    const server = accountServerUrl();
    if (!server) throw new Error('Configure the account server first.');
    const response = await fetch(new URL('api/pulse', server), { method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(request), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
    httpOk = response.ok; value = await response.json();
  }
  const result = pulseResponseSchema.parse(value);
  if (!result.ok) throw new Error(result.message);
  if (!httpOk) throw new Error('The Pulse service is unavailable. Retry the current project.');
  if (result.snapshot.projectId !== input.projectId || result.snapshot.overview.projectId !== input.projectId) throw new Error('The Pulse belongs to another project. Refresh your project.');
  if (request.view === 'client' && result.snapshot.audience !== 'client') throw new Error('The client projection could not be verified.');
  return result.snapshot;
}

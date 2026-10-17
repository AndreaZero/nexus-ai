import { overviewRequestSchema, overviewResponseSchema } from '@nexus-ai/contracts';
import type { OverviewRequest } from '@nexus-ai/contracts';
import { accountServerUrl } from '../auth/configuration.js';
export async function overviewRequest(input: OverviewRequest, signal?: AbortSignal) {
  const request = overviewRequestSchema.parse(input);
  let value: unknown;
  if (window.nexusDesktop?.overview) value = await window.nexusDesktop.overview.request(request);
  else {
    const server = accountServerUrl();
    if (!server) throw new Error('Configure the account server first.');
    const response = await fetch(new URL('api/overview', server), { method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(request), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
    value = await response.json();
  }
  const result = overviewResponseSchema.parse(value);
  if (!result.ok) throw new Error(result.message);
  if ('projectId' in result && result.projectId !== input.projectId || result.kind === 'overview' && result.snapshot.projectId !== input.projectId) throw new Error('The overview belongs to another project. Refresh your project.');
  return result;
}

import { deploymentsRequestSchema, deploymentsResponseSchema, environmentProbeRequestSchema, environmentProbeResponseSchema } from '@nexus-ai/contracts';
import type { DeploymentsRequest, EnvironmentProbeRequest } from '@nexus-ai/contracts';
import { accountServerUrl } from '../auth/configuration.js';

export class DeploymentFailure extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
async function readResponse(response: Response) {
  const reader = response.body?.getReader(); if (!reader) return response.json();
  let size = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 16777216) throw new Error('The deployment response is too large.'); chunks.push(next.value); } }
  finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
export async function deploymentRequest(input: DeploymentsRequest, signal?: AbortSignal) {
  const request = deploymentsRequestSchema.parse(input); let value: unknown; let httpOk = true;
  if (window.nexusDesktop?.deployments) value = await window.nexusDesktop.deployments.request(request);
  else {
    const server = accountServerUrl(); if (!server) throw new Error('Configure the account server first.');
    const response = await fetch(new URL('api/deployments', server), { method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(request), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
    httpOk = response.ok; value = await readResponse(response);
  }
  const result = deploymentsResponseSchema.parse(value);
  if (!result.ok) throw new DeploymentFailure(result.code, result.message);
  if (!httpOk) throw new Error('The deployments service is unavailable. Retry.');
  if (result.kind === 'snapshot') {
    if (request.operation !== 'snapshot' || result.snapshot.projectId !== request.projectId || result.snapshot.deployments.some(item => item.projectId !== request.projectId) || result.snapshot.environments.some(item => item.projectId !== request.projectId)) throw new Error('Unexpected deployment project response.');
    const environments = new Set(result.snapshot.environments.map(item => item.id));
    if (result.snapshot.deployments.some(item => !environments.has(item.environmentId)) || result.snapshot.health.some(item => !environments.has(item.environmentId) || item.observations.some(row => row.projectId !== request.projectId || row.environmentId !== item.environmentId))) throw new Error('Unexpected environment response.');
    if (request.view === 'client' && (result.snapshot.audience !== 'client' || result.snapshot.canManage || result.snapshot.environments.some(item => item.visibility !== 'client'))) throw new Error('The client audience could not be verified.');
  } else if (result.kind === 'deployment') {
    if (request.operation !== 'readDeployment' || result.item.id !== request.id || result.item.projectId !== request.projectId) throw new Error('Unexpected deployment detail response.');
  } else if (request.operation === 'snapshot' || request.operation === 'readDeployment' || request.id && result.id !== request.id) throw new Error('Unexpected deployment change response.');
  return result;
}
export async function probeEnvironment(input: EnvironmentProbeRequest) {
  const request = environmentProbeRequestSchema.parse(input);
  if (!window.nexusDesktop?.environmentProbe) throw new Error('Local HTTP observations are available on the desktop app.');
  const result = environmentProbeResponseSchema.parse(await window.nexusDesktop.environmentProbe.request(request));
  if (!result.ok) throw new DeploymentFailure(result.code, result.message);
  const expected = new URL(request.url); if (expected.hostname === 'localhost') expected.hostname = '127.0.0.1';
  if (result.observation.projectId !== request.projectId || new URL(result.observation.url).href !== expected.href) throw new Error('Unexpected local observation response.');
  return result.observation;
}

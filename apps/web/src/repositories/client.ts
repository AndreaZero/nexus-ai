import { gitRequestSchema, gitResponseSchema, repositoriesRequestSchema, repositoriesResponseSchema } from '@nexus-ai/contracts';
import type { GitRequest, RepositoriesRequest } from '@nexus-ai/contracts';
import { accountServerUrl } from '../auth/configuration.js';

export class RepositoryFailure extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
export async function repositoryRequest(input: RepositoriesRequest, signal?: AbortSignal) {
  const request = repositoriesRequestSchema.parse(input); let value: unknown; let httpOk = true;
  if (window.nexusDesktop?.repositories) value = await window.nexusDesktop.repositories.request(request);
  else {
    const server = accountServerUrl(); if (!server) throw new Error('Configure the account server first.');
    const response = await fetch(new URL('api/repositories', server), { method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(request), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
    httpOk = response.ok; value = await response.json();
  }
  const result = repositoriesResponseSchema.parse(value);
  if (!result.ok) throw new RepositoryFailure(result.code, result.message);
  if (!httpOk) throw new Error('The repository service is unavailable. Retry.');
  if (result.kind === 'snapshot' && (result.snapshot.projectId !== request.projectId || result.snapshot.repositoryId !== request.repositoryId)) throw new Error('The response belongs to another repository.');
  if (['snapshot', 'synchronize', 'connect', 'disconnect'].includes(request.operation) && result.kind !== 'snapshot') throw new Error('Unexpected repository snapshot response.');
  if (request.operation === 'getPull' && (result.kind !== 'pull' || result.pull.number !== request.number || result.page !== request.page)) throw new Error('Unexpected pull request response.');
  if (request.operation === 'resolveActivity' && (result.kind !== 'activity' || result.id !== request.id)) throw new Error('Unexpected repository activity response.');
  if ((request.operation === 'snapshot' || request.operation === 'synchronize') && result.kind === 'snapshot' && result.snapshot.page !== request.page) throw new Error('Unexpected repository page.');
  if (['createPull', 'review', 'configureWebhook'].includes(request.operation) && result.kind !== 'done') throw new Error('Unexpected repository mutation response.');
  if (request.operation === 'createPull' && result.kind === 'done' && !githubUrl(result.url)) throw new Error('The pull request result could not be verified. Inspect GitHub before retrying.');
  return result;
}
export async function gitRequest(input: GitRequest) {
  const request = gitRequestSchema.parse(input);
  if (!window.nexusDesktop?.git) throw new Error('Local Git requires the Nexus desktop app.');
  const result = gitResponseSchema.parse(await window.nexusDesktop.git.request(request));
  if (!result.ok) throw new RepositoryFailure(result.code, result.message);
  if (result.snapshot.projectId !== request.projectId || result.snapshot.repositoryId !== request.repositoryId) throw new Error('The Git response belongs to another repository.');
  return result;
}
export function githubUrl(value: string | null | undefined) {
  try { const url = new URL(value ?? ''); const anchor = !url.hash || /^#pullrequestreview-\d+$/.test(url.hash) && /^\/[^/]+\/[^/]+\/pull\/\d+$/.test(url.pathname); return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password && !url.port && !url.search && anchor ? url.href : null; } catch { return null; }
}

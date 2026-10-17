import { gitCommitSchema, pullRequestSchema, pullReviewSchema, pullFileSchema, type GitCommit, type PullRequest, type RepositoriesResponse } from '@nexus-ai/contracts';

type ErrorCode = Extract<RepositoriesResponse, { ok: false }>['code'];
export class GithubError extends Error {
  constructor(readonly code: ErrorCode, message: string, readonly definite = true) { super(message); }
}
export interface GithubRepository { owner: string; name: string; fullName: string; path: string; url: string; }
export function parseGithubRepository(remote: string): GithubRepository {
  let url: URL;
  try { url = new URL(remote); } catch { throw new GithubError('invalid_request', 'Configure an HTTPS github.com repository first.'); }
  const parts = url.pathname.replace(/\.git\/?$/, '').replace(/\/$/, '').split('/').filter(Boolean);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(part)) || parts.some(part => part === '.' || part === '..')) {
    throw new GithubError('invalid_request', 'Only an HTTPS github.com owner/repository URL is supported.');
  }
  const owner = parts[0]!; const name = parts[1]!;
  return { owner, name, fullName: `${owner}/${name}`, path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, url: `https://github.com/${owner}/${name}` };
}
export function githubObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GithubError('unavailable', 'GitHub returned an invalid response.');
  return value as Record<string, unknown>;
}
export const githubText = (value: unknown, limit: number): string => typeof value === 'string' ? value.slice(0, limit) : '';
const displayBody = (value: unknown): string => githubText(value, 20000).replace(/\n?\n?<!-- nexus-request:[a-f0-9]{64} -->/g, '');
export const githubDate = (value: unknown): string => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new GithubError('unavailable', 'GitHub returned an invalid date.');
  return new Date(value).toISOString();
};
export const githubInteger = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new GithubError('unavailable', 'GitHub returned an invalid identifier.');
  return value;
};
export function githubArray(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length > limit) throw new GithubError('unavailable', 'GitHub returned an invalid list.');
  return value;
}
function githubSha(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{40,64}$/.test(value)) throw new GithubError('unavailable', 'GitHub returned an invalid commit.');
  return value;
}
export function parseGithubCommit(value: unknown, repo: GithubRepository): GitCommit {
  const row = githubObject(value); const commit = githubObject(row['commit']); const author = githubObject(commit['author']);
  const sha = githubSha(row['sha']);
  return gitCommitSchema.parse({ sha, title: githubText(commit['message'], 500).split('\n')[0]!, author: githubText(author['name'], 200), authoredAt: githubDate(author['date']), url: `${repo.url}/commit/${sha}` });
}
export function parseGithubPull(value: unknown, repo: GithubRepository): PullRequest {
  const row = githubObject(value); const head = githubObject(row['head']); const base = githubObject(row['base']); const user = githubObject(row['user']);
  const number = githubInteger(row['number']);
  return pullRequestSchema.parse({ number, title: githubText(row['title'], 500), body: displayBody(row['body']), state: row['merged'] === true || row['merged_at'] ? 'merged' : row['state'] === 'closed' ? 'closed' : 'open', draft: row['draft'] === true,
    head: githubText(head['ref'], 200), headSha: githubSha(head['sha']), base: githubText(base['ref'], 200), author: githubText(user['login'], 200), url: `${repo.url}/pull/${number}`, updatedAt: githubDate(row['updated_at']) });
}
export function parseGithubReview(value: unknown, repo: GithubRepository, number: number) {
  const row = githubObject(value); const id = githubInteger(row['id']); const user = githubObject(row['user']);
  return pullReviewSchema.parse({ id, author: githubText(user['login'], 200), state: githubText(row['state'], 100), body: displayBody(row['body']), commitSha: row['commit_id'] ? githubSha(row['commit_id']) : null,
    submittedAt: row['submitted_at'] ? githubDate(row['submitted_at']) : null, url: `${repo.url}/pull/${number}#pullrequestreview-${id}` });
}
export function parseGithubFile(value: unknown) {
  const row = githubObject(value); const additions = row['additions']; const deletions = row['deletions'];
  return pullFileSchema.parse({ path: githubText(row['filename'], 2000), status: githubText(row['status'], 100), additions, deletions, patch: typeof row['patch'] === 'string' ? row['patch'].slice(0, 65536) : null });
}

/** Paths are constructed by the service; redirects and caller-supplied URLs are never followed. */
export function createGithubClient(token: string, fetcher: typeof fetch = fetch) {
  const deadline = Date.now() + 30_000;
  return { async request(path: string, method: 'GET' | 'POST' = 'GET', body?: Record<string, unknown>): Promise<unknown> {
    if (!/^\/(?:user|repos\/[^/?#]+\/[^/?#]+)(?:[/?][^#]*)?$/.test(path) || path.includes('://') || path.includes('\\')) throw new GithubError('invalid_request', 'Invalid GitHub API path.');
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new GithubError('unavailable', 'GitHub request deadline reached. Retry this action after checking the connection.', false);
      const response = await fetcher(`https://api.github.com${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(Math.min(12_000, remaining)),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'Nexus-AI', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 429 || response.status === 403 && (response.headers.has('retry-after') || response.headers.get('x-ratelimit-remaining') === '0')) throw new GithubError('rate_limited', 'GitHub rate limit reached. Wait before synchronizing again.');
        if (response.status === 401) throw new GithubError('not_connected', 'GitHub rejected this token. Reconnect with a valid token.');
        if (response.status === 403) throw new GithubError('forbidden', 'GitHub denied this action. Check repository token permissions.');
        if (response.status === 404) throw new GithubError('not_found', 'GitHub repository or pull request is unavailable to this account.');
        if (response.status === 409 || response.status === 422) throw new GithubError('conflict', 'GitHub could not apply this action. Check branches, permissions and existing pull requests.');
        throw new GithubError('unavailable', 'GitHub is temporarily unavailable.', response.status < 500);
      }
      const maxBytes = 2 * 1024 * 1024;
      const length = Number(response.headers.get('content-length') ?? 0);
      if (length > maxBytes) { await response.body?.cancel(); throw new GithubError('unavailable', 'GitHub response is too large.'); }
      if (!response.body) throw new GithubError('unavailable', 'GitHub returned an empty response.', false);
      const reader = response.body.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
      try {
        for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > maxBytes) { await reader.cancel(); throw new GithubError('unavailable', 'GitHub response is too large.', false); } chunks.push(part.value); }
      } finally { reader.releaseLock(); }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; } catch { throw new GithubError('unavailable', 'GitHub returned invalid JSON.', false); }
    } catch (error) {
      if (error instanceof GithubError) throw error;
      throw new GithubError('unavailable', 'GitHub could not be reached. Check the connection before retrying.', false);
    }
  } };
}

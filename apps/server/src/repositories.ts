import { createHash } from 'node:crypto';
import type { DatabaseBoundary } from '@nexus-ai/db';
import { repositoriesRequestSchema, repositoriesResponseSchema, repositorySnapshotSchema, type RepositoriesRequest, type RepositoriesResponse, type RepositorySnapshot } from '@nexus-ai/contracts';
import { authorizeWork, WorkError, type WorkAccess, type WorkDb } from './work-common.js';
import { decryptGithubSecret, encryptGithubSecret } from './github-crypto.js';
import { createGithubClient, GithubError, githubArray, githubInteger, githubObject, githubText, parseGithubCommit, parseGithubFile, parseGithubPull, parseGithubRepository, parseGithubReview, type GithubRepository } from './github-client.js';
import { appendRepositoryActivity, processGithubWebhook } from './repositories-webhook.js';

type Actor = WorkAccess['actor'];
type Repository = { id: string; project_id: string; remote_url: string; default_branch: string };
type Connection = { remoteUrl: string; token: string; githubId: number; login: string };
type CachePage = Pick<RepositorySnapshot, 'commits' | 'pulls' | 'observedAt' | 'hasMore'>;
type Cache = { githubId: number; private: boolean; pages: Record<string, CachePage> };
type Context = { db: WorkDb; access: WorkAccess; repository: Repository; repo: GithubRepository; cache: Cache | null; connection: Connection | null };
type GithubClient = ReturnType<typeof createGithubClient>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const contextKey = (repositoryId: string, actorId: string) => `connection:${repositoryId}:${actorId}`;
export function requireRepositoryTechnical(access: WorkAccess): void {
  if (access.role !== 'owner' && access.role !== 'developer') throw new GithubError('forbidden', 'Git and GitHub are available only to project owners and developers.');
}
function fail(error: unknown): Extract<RepositoriesResponse, { ok: false }> {
  if (error instanceof GithubError) return { ok: false, code: error.code, message: error.message };
  if (error instanceof WorkError && (error.code === 'forbidden' || error.code === 'invalid_request' || error.code === 'not_found')) return { ok: false, code: error.code, message: error.message };
  return { ok: false, code: 'unavailable', message: 'Repository service unavailable. Check the connection and retry.' };
}
function decodeConnection(secret: string | null, repository: Repository, actorId: string, cipher: string | undefined): Connection | null {
  if (!secret || !cipher) return null;
  try {
    const row = githubObject(JSON.parse(decryptGithubSecret(secret, contextKey(repository.id, actorId), cipher)));
    if (row['remoteUrl'] !== repository.remote_url || typeof row['token'] !== 'string' || typeof row['login'] !== 'string') return null;
    return { remoteUrl: repository.remote_url, token: row['token'], login: row['login'], githubId: githubInteger(row['githubId']) };
  } catch { return null; }
}
async function authorizeRepository(db: WorkDb, actor: Actor, projectId: string, repositoryId: string, secret: string | null): Promise<Context> {
  const access = await authorizeWork(db, actor, projectId); requireRepositoryTechnical(access);
  const repository = (await db.query<Repository>('SELECT id,project_id,remote_url,default_branch FROM repository WHERE id=$1 AND project_id=$2 FOR UPDATE', [repositoryId, projectId])).rows[0];
  if (!repository) throw new GithubError('not_found', 'Repository unavailable in this project.');
  const repo = parseGithubRepository(repository.remote_url);
  const saved = (await db.query<{ remote_url: string; snapshot: Cache }>('SELECT remote_url,snapshot FROM repository_sync WHERE repository_id=$1', [repositoryId])).rows[0];
  let cache: Cache | null = null;
  if (saved?.remote_url !== undefined && saved.remote_url !== repository.remote_url) {
    for (const table of ['repository_connection', 'repository_webhook', 'repository_delivery', 'repository_receipt', 'repository_activity', 'repository_sync']) await db.query(`DELETE FROM ${table} WHERE repository_id=$1`, [repositoryId]);
  } else if (saved) cache = saved.snapshot;
  const connectionRow = (await db.query<{ token_cipher: string }>('SELECT token_cipher FROM repository_connection WHERE repository_id=$1 AND user_id=$2', [repositoryId, actor.id])).rows[0];
  return { db, access, repository, repo, cache, connection: decodeConnection(secret, repository, actor.id, connectionRow?.token_cipher) };
}
function needConnection(context: Context): Connection {
  if (!context.connection) throw new GithubError('not_connected', 'Connect your GitHub account to this repository first.');
  return context.connection;
}
async function validateRemote(client: GithubClient, repo: GithubRepository, expectedId?: number): Promise<{ id: number; private: boolean }> {
  const row = githubObject(await client.request(repo.path)); const id = githubInteger(row['id']);
  if (githubText(row['full_name'], 201).toLowerCase() !== repo.fullName.toLowerCase() || expectedId !== undefined && id !== expectedId) throw new GithubError('conflict', 'The GitHub repository identity changed. Reconnect this repository.');
  if (typeof row['private'] !== 'boolean') throw new GithubError('unavailable', 'GitHub returned an invalid repository.');
  return { id, private: row['private'] };
}
async function saveCache(context: Context): Promise<void> {
  await context.db.query(`INSERT INTO repository_sync(repository_id,remote_url,snapshot,updated_at) VALUES($1,$2,$3::jsonb,now())
    ON CONFLICT(repository_id) DO UPDATE SET remote_url=EXCLUDED.remote_url,snapshot=EXCLUDED.snapshot,updated_at=now()`, [context.repository.id, context.repository.remote_url, JSON.stringify(context.cache)]);
}
async function snapshot(context: Context, page: number, secret: string | null): Promise<RepositoriesResponse> {
  const webhook = secret ? (await context.db.query<{ secret_cipher: string }>('SELECT secret_cipher FROM repository_webhook WHERE repository_id=$1', [context.repository.id])).rows[0] : undefined;
  let webhookConfigured = false;
  if (webhook && secret) {
    try { webhookConfigured = githubObject(JSON.parse(decryptGithubSecret(secret, `webhook:${context.repository.id}`, webhook.secret_cipher)))['remoteUrl'] === context.repository.remote_url; } catch { /* A rotated key requires explicit reconfiguration. */ }
  }
  const saved = context.cache?.pages?.[String(page)];
  return { ok: true, kind: 'snapshot', snapshot: repositorySnapshotSchema.parse({ projectId: context.access.projectId, repositoryId: context.repository.id, remoteUrl: context.repository.remote_url,
    connected: !!context.connection, login: context.connection?.login ?? null, private: context.cache?.private ?? null,
    commits: saved?.commits ?? [], pulls: saved?.pulls ?? [], observedAt: saved?.observedAt ?? null, webhookConfigured, page, hasMore: saved?.hasMore ?? false }) };
}
async function simpleOperation(context: Context, request: RepositoriesRequest, secret: string | null, fetcher: typeof fetch): Promise<RepositoriesResponse> {
  const { db, access, repository, repo } = context;
  if (request.operation === 'snapshot') return snapshot(context, request.page, secret);
  if (request.operation === 'resolveActivity') {
    const row = (await db.query<{ id: string; kind: 'commit' | 'pull' | 'review'; url: string; sha: string | null; pull_number: number | null }>('SELECT id,kind,url,sha,pull_number FROM repository_activity WHERE id=$1 AND project_id=$2 AND repository_id=$3', [request.id, access.projectId, repository.id])).rows[0];
    if (!row) throw new GithubError('not_found', 'Repository activity is no longer available. Refresh the feed.');
    return { ok: true, kind: 'activity', id: row.id, activityKind: row.kind, url: row.url, sha: row.sha, pullNumber: row.pull_number };
  }
  if (request.operation === 'disconnect') {
    await db.query('DELETE FROM repository_connection WHERE repository_id=$1 AND user_id=$2', [repository.id, access.actor.id]);
    context.connection = null; return snapshot(context, 1, secret);
  }
  if (!secret) throw new GithubError('unavailable', 'GitHub credential encryption is unavailable. Configure the Nexus account secret on the server.');
  if (request.operation === 'connect') {
    if (!request.token.startsWith('github_pat_')) throw new GithubError('invalid_request', 'Use a fine-grained GitHub personal access token limited to this repository.');
    const api = createGithubClient(request.token, fetcher);
    const [user, identity] = await Promise.all([api.request('/user').then(githubObject), validateRemote(api, repo)]);
    const login = githubText(user['login'], 200);
    if (!login) throw new GithubError('unavailable', 'GitHub returned an invalid account.');
    githubInteger(user['id']);
    if (context.cache && context.cache.githubId !== identity.id) {
      for (const table of ['repository_connection', 'repository_webhook', 'repository_delivery', 'repository_receipt', 'repository_activity']) await db.query(`DELETE FROM ${table} WHERE repository_id=$1`, [repository.id]);
    }
    const connection: Connection = { remoteUrl: repository.remote_url, token: request.token, githubId: identity.id, login };
    const cipher = encryptGithubSecret(secret, contextKey(repository.id, access.actor.id), JSON.stringify(connection));
    await db.query(`INSERT INTO repository_connection(repository_id,user_id,token_cipher,login,created_at,updated_at) VALUES($1,$2,$3,$4,now(),now())
      ON CONFLICT(repository_id,user_id) DO UPDATE SET token_cipher=EXCLUDED.token_cipher,login=EXCLUDED.login,updated_at=now()`, [repository.id, access.actor.id, cipher, login]);
    context.connection = connection;
    context.cache = context.cache?.githubId === identity.id ? { ...context.cache, private: identity.private } : { githubId: identity.id, private: identity.private, pages: {} };
    await saveCache(context); return snapshot(context, 1, secret);
  }
  if (request.operation === 'configureWebhook') {
    if (access.role !== 'owner') throw new GithubError('forbidden', 'Only a project owner can configure this webhook.');
    if (request.secret === null) {
      await db.query('DELETE FROM repository_webhook WHERE repository_id=$1', [repository.id]);
      await db.query('DELETE FROM repository_delivery WHERE repository_id=$1', [repository.id]);
      return { ok: true, kind: 'done', url: null };
    }
    const connection = needConnection(context); await validateRemote(createGithubClient(connection.token, fetcher), repo, connection.githubId);
    const cipher = encryptGithubSecret(secret, `webhook:${repository.id}`, JSON.stringify({ remoteUrl: repository.remote_url, githubId: connection.githubId, secret: request.secret }));
    await db.query(`INSERT INTO repository_webhook(repository_id,secret_cipher,configured_by,created_at,updated_at) VALUES($1,$2,$3,now(),now())
      ON CONFLICT(repository_id) DO UPDATE SET secret_cipher=EXCLUDED.secret_cipher,configured_by=EXCLUDED.configured_by,updated_at=now()`, [repository.id, cipher, access.actor.id]);
    return { ok: true, kind: 'done', url: null };
  }
  const connection = needConnection(context); const api = createGithubClient(connection.token, fetcher);
  const identity = await validateRemote(api, repo, connection.githubId);
  if (request.operation === 'synchronize') {
    const query = `per_page=30&page=${request.page}`;
    const [commits, pulls] = await Promise.all([
      api.request(`${repo.path}/commits?${query}`).catch((error: unknown) => { if (error instanceof GithubError && error.code === 'conflict') return []; throw error; }),
      api.request(`${repo.path}/pulls?state=open&${query}`),
    ]);
    const commitList = githubArray(commits, 30).map(row => parseGithubCommit(row, repo)); const pullList = githubArray(pulls, 30).map(row => parseGithubPull(row, repo));
    const saved: CachePage = { commits: commitList, pulls: pullList, observedAt: new Date().toISOString(), hasMore: commitList.length === 30 || pullList.length === 30 };
    context.cache = context.cache?.githubId === identity.id ? { ...context.cache, private: identity.private } : { githubId: identity.id, private: identity.private, pages: {} };
    context.cache.pages[String(request.page)] = saved; await saveCache(context);
    for (const [index, commit] of commitList.entries()) {
      const sourceAuthor = githubObject(githubArray(commits, 30)[index])['author'];
      const githubLogin = sourceAuthor && typeof sourceAuthor === 'object' ? githubText(githubObject(sourceAuthor)['login'], 200) || null : null;
      await appendRepositoryActivity(db, access, repository.id, { kind: 'commit', title: commit.title, url: commit.url!, sha: commit.sha, pullNumber: null, key: `commit:${commit.sha}`, occurredAt: commit.authoredAt, githubLogin });
    }
    for (const pull of pullList) await appendRepositoryActivity(db, access, repository.id, { kind: 'pull', title: `PR #${pull.number}: ${pull.title}`, url: pull.url, sha: pull.headSha, pullNumber: pull.number, key: `pull:${pull.number}`, occurredAt: pull.updatedAt, githubLogin: pull.author });
    return snapshot(context, request.page, secret);
  }
  if (request.operation === 'getPull') {
    const [pull, reviews, files] = await Promise.all([api.request(`${repo.path}/pulls/${request.number}`), api.request(`${repo.path}/pulls/${request.number}/reviews?per_page=100&page=${request.page}`), api.request(`${repo.path}/pulls/${request.number}/files?per_page=100&page=${request.page}`)]);
    const reviewList = githubArray(reviews, 100).map(row => parseGithubReview(row, repo, request.number)); const fileList = githubArray(files, 100).map(parseGithubFile);
    const parsedPull = parseGithubPull(pull, repo);
    if (parsedPull.number !== request.number) throw new GithubError('unavailable', 'GitHub returned a different pull request.');
    return { ok: true, kind: 'pull', pull: parsedPull, reviews: reviewList, files: fileList, page: request.page, hasMore: reviewList.length === 100 || fileList.length === 100 };
  }
  throw new GithubError('invalid_request', 'Unsupported repository operation.');
}

type RemoteMutation = Extract<RepositoriesRequest, { operation: 'createPull' | 'review' }>;
const requestMarker = (actorId: string, requestId: string) => `<!-- nexus-request:${hash(`${actorId}:${requestId}`)} -->`;
async function reconcile(context: Context, request: RemoteMutation, api: GithubClient): Promise<string | null> {
  const marker = requestMarker(context.access.actor.id, request.requestId); const { repo } = context;
  if (request.operation === 'createPull') {
    const rows = githubArray(await api.request(`${repo.path}/pulls?state=all&head=${encodeURIComponent(`${repo.owner}:${request.head}`)}&base=${encodeURIComponent(request.base)}&per_page=100&page=1`), 100);
    const found = rows.find(value => githubText(githubObject(value)['body'], 20000).includes(marker));
    return found ? parseGithubPull(found, repo).url : null;
  }
  // A receipt remains uncertain beyond this bounded history; it is never reposted automatically.
  for (let page = 1; page <= 10; page++) {
    const rows = githubArray(await api.request(`${repo.path}/pulls/${request.number}/reviews?per_page=100&page=${page}`), 100);
    const found = rows.find(value => githubText(githubObject(value)['body'], 20000).includes(marker));
    if (found) return parseGithubReview(found, repo, request.number).url;
    if (rows.length < 100) break;
  }
  return null;
}
export function createRepositoriesService(database: DatabaseBoundary, secret: string | null, reportError?: (error: unknown) => void, fetcher: typeof fetch = fetch) {
  const report = () => reportError?.(new Error('GitHub repository operation failed. Sensitive upstream details omitted.'));
  async function execute(actor: Actor, input: RepositoriesRequest): Promise<RepositoriesResponse> {
    const parsed = repositoriesRequestSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: 'invalid_request', message: 'Invalid repository request.' };
    if (!database.pool) return { ok: false, code: 'unavailable', message: 'Database unavailable.' };
    const request = parsed.data; const db = await database.pool.connect();
    let committedReceipt = false;
    try {
      await db.query('BEGIN'); let context = await authorizeRepository(db, actor, request.projectId, request.repositoryId, secret);
      if (request.operation !== 'createPull' && request.operation !== 'review') {
        const result = repositoriesResponseSchema.parse(await simpleOperation(context, request, secret, fetcher));
        await db.query('COMMIT'); return result;
      }
      const connection = needConnection(context); const api = createGithubClient(connection.token, fetcher);
      const requestHash = hash(JSON.stringify(request));
      const receipt = (await db.query<{ payload_hash: string; response: unknown | null }>('SELECT payload_hash,response FROM repository_receipt WHERE repository_id=$1 AND actor_id=$2 AND request_id=$3', [request.repositoryId, actor.id, request.requestId])).rows[0];
      if (receipt) {
        if (receipt.payload_hash !== requestHash) throw new GithubError('conflict', 'This request ID was already used for different content.');
        if (receipt.response !== null) { await db.query('COMMIT'); return repositoriesResponseSchema.parse(receipt.response); }
        const url = await reconcile(context, request, api);
        if (!url) throw new GithubError('uncertain', 'GitHub may have received this action. Check the pull request on GitHub before submitting a new action. Retrying this request will only check its outcome.');
        const response: RepositoriesResponse = { ok: true, kind: 'done', url };
        await db.query('UPDATE repository_receipt SET response=$4::jsonb WHERE repository_id=$1 AND actor_id=$2 AND request_id=$3', [request.repositoryId, actor.id, request.requestId, JSON.stringify(response)]);
        await db.query('COMMIT'); return response;
      }
      await validateRemote(api, context.repo, connection.githubId);
      if (request.operation === 'review') {
        const pull = parseGithubPull(await api.request(`${context.repo.path}/pulls/${request.number}`), context.repo);
        if (pull.number !== request.number || pull.headSha !== request.headSha) throw new GithubError('conflict', 'The pull request has new commits. Refresh and review the current head before submitting.');
      }
      const count = Number((await db.query<{ count: string }>('SELECT count(*)::text AS count FROM repository_receipt WHERE repository_id=$1', [request.repositoryId])).rows[0]?.count ?? '0');
      if (count >= 100000) throw new GithubError('conflict', 'This repository has reached its mutation receipt limit.');
      await db.query('INSERT INTO repository_receipt(repository_id,actor_id,request_id,payload_hash,response) VALUES($1,$2,$3,$4,NULL)', [request.repositoryId, actor.id, request.requestId, requestHash]);
      // Commit the pending receipt before sending a remote write. Crashes cannot cause duplicate POSTs.
      await db.query('COMMIT'); committedReceipt = true;
      const marker = requestMarker(actor.id, request.requestId); let response: RepositoriesResponse; let activity: Parameters<typeof appendRepositoryActivity>[3] | null = null;
      try {
        if (request.operation === 'createPull') {
          const pull = parseGithubPull(await api.request(`${context.repo.path}/pulls`, 'POST', { title: request.title, body: `${request.body}\n\n${marker}`, head: request.head, base: request.base, draft: request.draft, maintainer_can_modify: false }), context.repo);
          response = { ok: true, kind: 'done', url: pull.url };
          activity = { kind: 'pull', title: `PR #${pull.number}: ${pull.title}`, url: pull.url, sha: pull.headSha, pullNumber: pull.number, key: `pull:${pull.number}`, occurredAt: pull.updatedAt, githubLogin: pull.author };
        } else {
          const review = parseGithubReview(await api.request(`${context.repo.path}/pulls/${request.number}/reviews`, 'POST', { commit_id: request.headSha, body: `${request.body}\n\n${marker}`, event: request.event }), context.repo, request.number);
          response = { ok: true, kind: 'done', url: review.url };
          activity = { kind: 'review', title: `PR #${request.number}: ${review.state}`, url: review.url, sha: request.headSha, pullNumber: request.number, key: `review:${review.id}`, occurredAt: review.submittedAt ?? new Date().toISOString(), githubLogin: review.author };
        }
      } catch (error) {
        if (!(error instanceof GithubError) || !error.definite || !['forbidden', 'not_connected', 'not_found', 'conflict', 'rate_limited'].includes(error.code)) throw new GithubError('uncertain', 'GitHub may have received this action. Retry this same request to check the outcome; do not submit it again with a new request ID.');
        response = fail(error);
      }
      await db.query('BEGIN'); context = await authorizeRepository(db, actor, request.projectId, request.repositoryId, secret);
      if (context.repository.remote_url !== connection.remoteUrl) throw new GithubError('uncertain', 'The repository changed during the action. Check its outcome on GitHub.');
      if (activity) await appendRepositoryActivity(db, context.access, request.repositoryId, activity);
      const result = repositoriesResponseSchema.parse(response);
      await db.query('UPDATE repository_receipt SET response=$4::jsonb WHERE repository_id=$1 AND actor_id=$2 AND request_id=$3', [request.repositoryId, actor.id, request.requestId, JSON.stringify(result)]);
      await db.query('COMMIT'); return result;
    } catch (error) {
      await db.query('ROLLBACK').catch(() => undefined);
      if (!(error instanceof GithubError) && !(error instanceof WorkError)) report();
      if (committedReceipt && !(error instanceof GithubError && error.code === 'uncertain')) return { ok: false, code: 'uncertain', message: 'The remote action may have completed. Check GitHub; retrying this request will only reconcile its outcome.' };
      return fail(error);
    } finally { db.release(); }
  }
  return {
    execute,
    async credential(actor: Actor, projectId: string, repositoryId: string): Promise<{ token: string; remoteUrl: string } | null> {
      if (!database.pool || !secret) return null;
      const db = await database.pool.connect();
      try {
        await db.query('BEGIN'); const context = await authorizeRepository(db, actor, projectId, repositoryId, secret);
        const connection = needConnection(context); await db.query('COMMIT'); return { token: connection.token, remoteUrl: connection.remoteUrl };
      } catch { await db.query('ROLLBACK').catch(() => undefined); return null; } finally { db.release(); }
    },
    webhook(repositoryId: string, headers: { delivery: string; event: string; signature: string }, rawBody: Buffer) {
      return processGithubWebhook(database, secret, repositoryId, headers, rawBody, report);
    },
  };
}

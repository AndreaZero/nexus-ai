import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseBoundary } from '@nexus-ai/db';
import { authorizeWork, WorkError, type WorkAccess, type WorkDb } from './work-common.js';
import { appendRealtimeEvent } from './realtime-events.js';
import { decryptGithubSecret, validGithubSignature } from './github-crypto.js';
import { GithubError, githubArray, githubDate, githubInteger, githubObject, githubText, parseGithubPull, parseGithubRepository, parseGithubReview } from './github-client.js';

export interface RepositoryActivity {
  kind: 'commit' | 'pull' | 'review'; title: string; url: string; sha: string | null; pullNumber: number | null; key: string; occurredAt: string; githubLogin: string | null;
}
/** Metadata only; permission checks happen before calling and again when projecting the feed. */
export async function appendRepositoryActivity(db: WorkDb, access: WorkAccess, repositoryId: string, input: RepositoryActivity): Promise<void> {
  const matches = input.githubLogin ? (await db.query<{ user_id: string }>(`SELECT c.user_id FROM repository_connection c JOIN repository r ON r.id=c.repository_id
    JOIN project p ON p.id=r.project_id JOIN workspace_member wm ON wm.workspace_id=p.workspace_id AND wm.user_id=c.user_id
    LEFT JOIN project_member pm ON pm.project_id=p.id AND pm.user_id=c.user_id
    WHERE c.repository_id=$1 AND lower(c.login)=lower($2) AND (wm.role='owner' OR pm.role IN ('owner','developer')) LIMIT 2`, [repositoryId, input.githubLogin])).rows : [];
  const actorId = matches.length === 1 ? matches[0]!.user_id : null;
  const row = (await db.query<{ id: string }>(`INSERT INTO repository_activity(id,project_id,repository_id,actor_id,kind,title,url,sha,pull_number,external_key,occurred_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::timestamptz)
    ON CONFLICT(repository_id,external_key) DO UPDATE SET title=EXCLUDED.title,url=EXCLUDED.url,sha=EXCLUDED.sha,pull_number=EXCLUDED.pull_number,occurred_at=EXCLUDED.occurred_at,actor_id=EXCLUDED.actor_id
    WHERE EXCLUDED.occurred_at >= repository_activity.occurred_at AND (repository_activity.title IS DISTINCT FROM EXCLUDED.title OR repository_activity.sha IS DISTINCT FROM EXCLUDED.sha OR repository_activity.occurred_at IS DISTINCT FROM EXCLUDED.occurred_at OR repository_activity.actor_id IS DISTINCT FROM EXCLUDED.actor_id) RETURNING id`,
  [randomUUID(), access.projectId, repositoryId, actorId, input.kind, input.title.slice(0, 500), input.url, input.sha, input.pullNumber, input.key, input.occurredAt])).rows[0];
  if (row) await appendRealtimeEvent(db, access.projectId, access.actor.id, 'repository.changed', row.id);
  // Keep a bounded technical history, independently of retained realtime invalidations.
  await db.query(`DELETE FROM repository_activity WHERE repository_id=$1 AND id NOT IN
    (SELECT id FROM repository_activity WHERE repository_id=$1 ORDER BY occurred_at DESC,id DESC LIMIT 1000)`, [repositoryId]);
}
export interface GithubWebhookResult { status: number; ok: boolean; message: string; }
const result = (status: number, message: string): GithubWebhookResult => ({ status, ok: status >= 200 && status < 300, message });
export async function processGithubWebhook(database: DatabaseBoundary, secret: string | null, repositoryId: string, headers: { delivery: string; event: string; signature: string }, rawBody: Buffer, reportError?: () => void): Promise<GithubWebhookResult> {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(repositoryId) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(headers.delivery) || rawBody.length > 1024 * 1024) return result(400, 'Invalid webhook delivery.');
  if (!database.pool || !secret) return result(503, 'Webhook service unavailable.');
  const db = await database.pool.connect();
  try {
    await db.query('BEGIN');
    const initial = (await db.query<{ project_id: string }>('SELECT project_id FROM repository WHERE id=$1', [repositoryId])).rows[0];
    if (!initial) { await db.query('ROLLBACK'); return result(404, 'Webhook unavailable.'); }
    // Lock in the same order as membership/repository mutations before reading the current verifier.
    await db.query('SELECT w.id FROM workspace w JOIN project p ON p.workspace_id=w.id WHERE p.id=$1 FOR UPDATE OF w', [initial.project_id]);
    await db.query('SELECT id FROM project WHERE id=$1 FOR UPDATE', [initial.project_id]);
    const row = (await db.query<{ remote_url: string; secret_cipher: string; configured_by: string }>(`SELECT r.remote_url,h.secret_cipher,h.configured_by FROM repository r JOIN repository_webhook h ON h.repository_id=r.id WHERE r.id=$1 AND r.project_id=$2 FOR UPDATE OF r,h`, [repositoryId, initial.project_id])).rows[0];
    if (!row) { await db.query('ROLLBACK'); return result(404, 'Webhook unavailable.'); }
    let config: Record<string, unknown>;
    try { config = githubObject(JSON.parse(decryptGithubSecret(secret, `webhook:${repositoryId}`, row.secret_cipher))); } catch { await db.query('ROLLBACK'); return result(503, 'Webhook verifier unavailable.'); }
    if (config['remoteUrl'] !== row.remote_url || typeof config['secret'] !== 'string') { await db.query('ROLLBACK'); return result(409, 'Repository changed; reconfigure this webhook.'); }
    if (!validGithubSignature(config['secret'], rawBody, headers.signature)) { await db.query('ROLLBACK'); return result(401, 'Invalid webhook signature.'); }
    const access = await authorizeWork(db, { id: row.configured_by, email: '' }, initial.project_id);
    if (access.role !== 'owner') { await db.query('ROLLBACK'); return result(403, 'Webhook owner access revoked.'); }
    const repo = parseGithubRepository(row.remote_url);
    let payload: Record<string, unknown>;
    try { payload = githubObject(JSON.parse(rawBody.toString('utf8'))); } catch { await db.query('ROLLBACK'); return result(400, 'Invalid webhook payload.'); }
    const identity = githubObject(payload['repository']);
    if (githubInteger(identity['id']) !== config['githubId'] || githubText(identity['full_name'], 201).toLowerCase() !== repo.fullName.toLowerCase()) { await db.query('ROLLBACK'); return result(409, 'Webhook repository does not match.'); }
    if (!['push', 'pull_request', 'pull_request_review', 'ping'].includes(headers.event)) { await db.query('ROLLBACK'); return result(202, 'Webhook event ignored.'); }
    const hash = createHash('sha256').update(headers.event).update('\0').update(rawBody).digest('hex');
    const previous = (await db.query<{ payload_hash: string }>('SELECT payload_hash FROM repository_delivery WHERE repository_id=$1 AND delivery_id=$2', [repositoryId, headers.delivery])).rows[0];
    if (previous) { await db.query('ROLLBACK'); return previous.payload_hash === hash ? result(200, 'Webhook delivery already received.') : result(409, 'Delivery ID was used for a different payload.'); }
    const count = Number((await db.query<{ count: string }>('SELECT count(*)::text AS count FROM repository_delivery WHERE repository_id=$1', [repositoryId])).rows[0]?.count ?? '0');
    if (count >= 100000) { await db.query('ROLLBACK'); return result(429, 'Webhook delivery receipt limit reached.'); }
    const activities: RepositoryActivity[] = [];
    if (headers.event === 'push') {
      const commits = githubArray(payload['commits'] ?? [], 2048).slice(-30);
      for (const value of commits) {
        const commit = githubObject(value); const sha = githubText(commit['id'], 65);
        if (!/^[a-f0-9]{40,64}$/.test(sha)) throw new GithubError('invalid_request', 'Invalid webhook commit.');
        const author = commit['author']; const githubLogin = author && typeof author === 'object' ? githubText(githubObject(author)['username'], 200) || null : null;
        activities.push({ kind: 'commit', title: githubText(commit['message'], 500).split('\n')[0]!, url: `${repo.url}/commit/${sha}`, sha, pullNumber: null, key: `commit:${sha}`, occurredAt: githubDate(commit['timestamp']), githubLogin });
      }
    } else if (headers.event === 'pull_request' || headers.event === 'pull_request_review') {
      const pull = parseGithubPull(payload['pull_request'], repo);
      if (headers.event === 'pull_request') activities.push({ kind: 'pull', title: `PR #${pull.number}: ${pull.title}`, url: pull.url, sha: pull.headSha, pullNumber: pull.number, key: `pull:${pull.number}`, occurredAt: pull.updatedAt, githubLogin: pull.author });
      else {
        const review = parseGithubReview(payload['review'], repo, pull.number);
        activities.push({ kind: 'review', title: `PR #${pull.number}: ${review.state}`, url: review.url, sha: review.commitSha, pullNumber: pull.number, key: `review:${review.id}`, occurredAt: review.submittedAt ?? pull.updatedAt, githubLogin: review.author });
      }
    }
    await db.query('INSERT INTO repository_delivery(repository_id,delivery_id,payload_hash) VALUES($1,$2,$3)', [repositoryId, headers.delivery, hash]);
    for (const activity of activities) await appendRepositoryActivity(db, access, repositoryId, activity);
    // Incoming metadata invalidates cached snapshots; refresh still requires an explicit GitHub request.
    await db.query(`UPDATE repository_sync SET snapshot=jsonb_set(snapshot,'{pages}','{}'::jsonb),updated_at=now() WHERE repository_id=$1`, [repositoryId]);
    await db.query('COMMIT'); return result(200, 'Webhook delivery received.');
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    if (error instanceof GithubError) return result(error.code === 'invalid_request' || error.code === 'unavailable' ? 400 : 403, 'Invalid webhook payload.');
    if (error instanceof WorkError) return result(403, 'Webhook owner access revoked.');
    reportError?.(); return result(503, 'Webhook service unavailable.');
  } finally { db.release(); }
}

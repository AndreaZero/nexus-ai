import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseBoundary } from '@nexus-ai/db';
import { deploymentsRequestSchema, deploymentsResponseSchema, type Deployment, type DeploymentEnvironment,
  type DeploymentsRequest, type DeploymentsResponse, type HealthObservation } from '@nexus-ai/contracts';
import { authorizeWork, requireTechnical, WorkError, type WorkAccess, type WorkDb } from './work-common.js';
import { appendRealtimeEvent } from './realtime-events.js';
import { computeEnvironmentHealth, thumbnailBytes, validateObservationTime } from './deployments-health.js';

type EnvironmentRow = { id: string; project_id: string; name: string; kind: DeploymentEnvironment['kind']; visibility: DeploymentEnvironment['visibility'];
  preview_url: string | null; required_checks: DeploymentEnvironment['requiredChecks']; version: number; created_at: Date; updated_at: Date };
type DeploymentRow = { id: string; project_id: string; environment_id: string; title: string; status: Deployment['status']; commit_sha: string | null;
  branch: string | null; build_url: string | null; preview_url: string | null; notes: string; thumbnail: string | null; version: number;
  created_by: string; observed_at: Date; created_at: Date; updated_at: Date };
type ObservationRow = { id: string; project_id: string; environment_id: string; check_name: HealthObservation['check']; status: HealthObservation['status'];
  value: number | null; unit: string | null; summary: string; source_url: string | null; version: number; observed_at: Date;
  expires_at: Date; created_at: Date; updated_at: Date };
const missing = (): never => { throw new WorkError('not_found', 'Environment or deployment unavailable in this project.'); };
function conflict(): never { throw new WorkError('conflict', 'This item changed. Reload before saving.'); }
const invalid = (message: string): never => { throw new WorkError('invalid_request', message); };
const changed = (id: string, version: number): DeploymentsResponse => ({ ok: true, kind: 'changed', id, version });
const environmentItem = (row: EnvironmentRow): DeploymentEnvironment => ({ id: row.id, projectId: row.project_id, name: row.name, kind: row.kind,
  visibility: row.visibility, previewUrl: row.preview_url, requiredChecks: row.required_checks, version: row.version,
  createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() });
const deploymentItem = (row: DeploymentRow): Deployment => ({ id: row.id, projectId: row.project_id, environmentId: row.environment_id,
  title: row.title, status: row.status, commitSha: row.commit_sha, branch: row.branch, buildUrl: row.build_url, previewUrl: row.preview_url,
  notes: row.notes, thumbnail: row.thumbnail, version: row.version, source: 'manual', authorId: row.created_by,
  observedAt: row.observed_at.toISOString(), createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() });
const observationItem = (row: ObservationRow, now: Date): HealthObservation => ({ id: row.id, projectId: row.project_id,
  environmentId: row.environment_id, check: row.check_name, status: row.status, value: row.value, unit: row.unit, summary: row.summary,
  sourceUrl: row.source_url, source: 'manual', version: row.version, observedAt: row.observed_at.toISOString(), expiresAt: row.expires_at.toISOString(),
  stale: row.expires_at <= now || row.observed_at > now, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() });

async function environment(db: WorkDb, access: WorkAccess, id: string): Promise<EnvironmentRow> {
  const row = (await db.query<EnvironmentRow>(`SELECT * FROM deployment_environment WHERE project_id=$1 AND id=$2
    AND ($3::boolean OR visibility='client')`, [access.projectId, id, access.team])).rows[0];
  return row ?? missing();
}
async function deployment(db: WorkDb, access: WorkAccess, id: string): Promise<DeploymentRow> {
  const row = (await db.query<DeploymentRow>(`SELECT d.* FROM project_deployment d JOIN deployment_environment e
    ON e.id=d.environment_id AND e.project_id=d.project_id WHERE d.project_id=$1 AND d.id=$2
    AND ($3::boolean OR e.visibility='client')`, [access.projectId, id, access.team])).rows[0];
  return row ?? missing();
}
async function snapshot(db: WorkDb, access: WorkAccess, request: Extract<DeploymentsRequest, { operation: 'snapshot' }>): Promise<DeploymentsResponse> {
  const now = new Date();
  const environments = (await db.query<EnvironmentRow>(`SELECT * FROM deployment_environment WHERE project_id=$1
    AND ($2::boolean OR visibility='client') ORDER BY created_at,id LIMIT 30`, [access.projectId, access.team])).rows.map(environmentItem);
  const total = Number((await db.query<{ total: string }>(`SELECT count(*)::text AS total FROM project_deployment d
    JOIN deployment_environment e ON e.id=d.environment_id AND e.project_id=d.project_id
    WHERE d.project_id=$1 AND ($2::boolean OR e.visibility='client')`, [access.projectId, access.team])).rows[0]?.total ?? 0);
  const deployments = (await db.query<DeploymentRow>(`SELECT d.* FROM project_deployment d JOIN deployment_environment e
    ON e.id=d.environment_id AND e.project_id=d.project_id WHERE d.project_id=$1 AND ($2::boolean OR e.visibility='client')
    ORDER BY d.observed_at DESC,d.id DESC LIMIT $3 OFFSET $4`, [access.projectId, access.team, request.limit, request.offset])).rows.map(deploymentItem);
  const observations = (await db.query<ObservationRow>(`SELECT h.* FROM health_observation h JOIN deployment_environment e
    ON e.id=h.environment_id AND e.project_id=h.project_id WHERE h.project_id=$1 AND ($2::boolean OR e.visibility='client')
    ORDER BY h.environment_id,h.check_name LIMIT 150`, [access.projectId, access.team])).rows.map(row => observationItem(row, now));
  return { ok: true, kind: 'snapshot', snapshot: { projectId: access.projectId, audience: access.team ? 'team' : 'client',
    canManage: access.team, environments, deployments, health: environments.map(item => computeEnvironmentHealth(item, observations.filter(o => o.environmentId === item.id), now)),
    total, nextOffset: request.offset + deployments.length < total ? request.offset + deployments.length : null, observedAt: now.toISOString() } };
}

async function saveEnvironment(db: WorkDb, access: WorkAccess, request: Extract<DeploymentsRequest, { operation: 'saveEnvironment' }>): Promise<DeploymentsResponse> {
  if ((request.id === null) !== (request.expectedVersion === 0)) invalid('New environment and expected version do not match.');
  if (new Set(request.requiredChecks).size !== request.requiredChecks.length) invalid('Choose each required health check once.');
  const id = request.id ?? randomUUID(); let version = 1;
  if (request.id === null) {
    const total = Number((await db.query<{ total: string }>('SELECT count(*)::text AS total FROM deployment_environment WHERE project_id=$1', [access.projectId])).rows[0]?.total ?? 0);
    if (total >= 30) invalid('This project already has the maximum 30 environments.');
    await db.query(`INSERT INTO deployment_environment(id,project_id,name,kind,visibility,preview_url,required_checks,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`, [id, access.projectId, request.name, request.kind, request.visibility, request.previewUrl, JSON.stringify(request.requiredChecks), access.actor.id]);
  } else {
    await environment(db, access, id);
    const row = (await db.query<{ version: number }>(`UPDATE deployment_environment SET name=$3,kind=$4,visibility=$5,
      preview_url=$6,required_checks=$7::jsonb,version=version+1,updated_at=now() WHERE project_id=$1 AND id=$2 AND version=$8 RETURNING version`,
    [access.projectId, id, request.name, request.kind, request.visibility, request.previewUrl, JSON.stringify(request.requiredChecks), request.expectedVersion])).rows[0];
    if (!row) conflict(); version = row.version;
  }
  await appendRealtimeEvent(db, access.projectId, access.actor.id, 'deployment.changed', id);
  return changed(id, version);
}

async function saveDeployment(db: WorkDb, access: WorkAccess, request: Extract<DeploymentsRequest, { operation: 'saveDeployment' }>): Promise<DeploymentsResponse> {
  if ((request.id === null) !== (request.expectedVersion === 0)) invalid('New deployment and expected version do not match.');
  validateObservationTime(request.observedAt); const bytes = thumbnailBytes(request.thumbnail);
  await environment(db, access, request.environmentId);
  if (request.id !== null) await deployment(db, access, request.id);
  const quota = (await db.query<{ total: string; bytes: string }>(`SELECT count(*)::text AS total,
    coalesce(sum(CASE WHEN thumbnail IS NULL THEN 0 ELSE octet_length(decode(split_part(thumbnail,',',2),'base64')) END),0)::text AS bytes
    FROM project_deployment WHERE project_id=$1 AND ($2::text IS NULL OR id<>$2)`, [access.projectId, request.id])).rows[0];
  if (request.id === null && Number(quota?.total ?? 0) >= 1000) invalid('This project already has the maximum 1000 deployments.');
  if (Number(quota?.bytes ?? 0) + bytes > 10 * 1024 * 1024) invalid('Project thumbnails exceed the 10 MiB limit. Remove an older thumbnail first.');
  const id = request.id ?? randomUUID(); let version = 1;
  const values = [access.projectId, id, request.environmentId, request.title, request.status, request.commitSha, request.branch,
    request.buildUrl, request.previewUrl, request.notes, request.thumbnail, request.observedAt];
  if (request.id === null) await db.query(`INSERT INTO project_deployment(project_id,id,environment_id,title,status,commit_sha,branch,
    build_url,preview_url,notes,thumbnail,observed_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [...values, access.actor.id]);
  else {
    const row = (await db.query<{ version: number }>(`UPDATE project_deployment SET environment_id=$3,title=$4,status=$5,commit_sha=$6,
      branch=$7,build_url=$8,preview_url=$9,notes=$10,thumbnail=$11,observed_at=$12,version=version+1,updated_at=now()
      WHERE project_id=$1 AND id=$2 AND version=$13 RETURNING version`, [...values, request.expectedVersion])).rows[0];
    if (!row) conflict(); version = row.version;
  }
  await appendRealtimeEvent(db, access.projectId, access.actor.id, 'deployment.changed', id);
  return changed(id, version);
}

async function saveObservation(db: WorkDb, access: WorkAccess, request: Extract<DeploymentsRequest, { operation: 'saveObservation' }>): Promise<DeploymentsResponse> {
  if ((request.id === null) !== (request.expectedVersion === 0)) invalid('New observation and expected version do not match.');
  const observedAt = validateObservationTime(request.observedAt);
  const expiresAt = new Date(observedAt.getTime() + request.ttlSeconds * 1000);
  await environment(db, access, request.environmentId);
  const current = (await db.query<ObservationRow>(`SELECT * FROM health_observation WHERE project_id=$1 AND environment_id=$2 AND check_name=$3`,
    [access.projectId, request.environmentId, request.check])).rows[0];
  if (request.id === null && current) conflict();
  if (request.id !== null && (!current || current.id !== request.id)) missing();
  if (current && (current.version !== request.expectedVersion || current.observed_at > observedAt)) conflict();
  const id = request.id ?? randomUUID(); let version = 1;
  const values = [access.projectId, id, request.environmentId, request.check, request.status, request.value, request.unit,
    request.summary, request.sourceUrl, observedAt.toISOString(), expiresAt.toISOString()];
  if (request.id === null) await db.query(`INSERT INTO health_observation(project_id,id,environment_id,check_name,status,value,unit,
    summary,source_url,observed_at,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [...values, access.actor.id]);
  else {
    const row = (await db.query<{ version: number }>(`UPDATE health_observation SET status=$5,value=$6,unit=$7,summary=$8,source_url=$9,
      observed_at=$10,expires_at=$11,version=version+1,updated_at=now() WHERE project_id=$1 AND id=$2 AND environment_id=$3
      AND check_name=$4 AND version=$12 RETURNING version`, [...values, request.expectedVersion])).rows[0];
    if (!row) conflict(); version = row.version;
  }
  await appendRealtimeEvent(db, access.projectId, access.actor.id, 'deployment.changed', request.environmentId);
  return changed(id, version);
}

async function executeRequest(db: WorkDb, access: WorkAccess, request: DeploymentsRequest): Promise<DeploymentsResponse> {
  switch (request.operation) {
    case 'snapshot': return snapshot(db, access, request);
    case 'readDeployment': return { ok: true, kind: 'deployment', item: deploymentItem(await deployment(db, access, request.id)) };
    case 'saveEnvironment': return saveEnvironment(db, access, request);
    case 'saveDeployment': return saveDeployment(db, access, request);
    case 'saveObservation': return saveObservation(db, access, request);
    case 'deleteEnvironment':
    case 'deleteDeployment': {
      const table = request.operation === 'deleteEnvironment' ? 'deployment_environment' : 'project_deployment';
      if (request.operation === 'deleteEnvironment') await environment(db, access, request.id); else await deployment(db, access, request.id);
      const row = (await db.query<{ id: string }>(`DELETE FROM ${table} WHERE project_id=$1 AND id=$2 AND version=$3 RETURNING id`,
        [access.projectId, request.id, request.expectedVersion])).rows[0];
      if (!row) conflict();
      await appendRealtimeEvent(db, access.projectId, access.actor.id, 'deployment.changed', request.id);
      return changed(request.id, 0);
    }
  }
}

/** Current project membership is checked before every receipt replay, read or mutation. */
export function createDeploymentsService(database: DatabaseBoundary, reportError?: (error: unknown) => void) {
  return { async execute(actor: { id: string; email: string }, input: DeploymentsRequest): Promise<DeploymentsResponse> {
    const parsed = deploymentsRequestSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: 'invalid_request', message: 'Invalid environment or deployment request.' };
    if (!database.pool) return { ok: false, code: 'unavailable', message: 'Database unavailable.' };
    let db: (WorkDb & { release(): void }) | undefined;
    try {
      db = await database.pool.connect(); await db.query('BEGIN'); const request = parsed.data;
      const access = await authorizeWork(db, actor, request.projectId, 'view' in request && request.view === 'client');
      const mutation = 'requestId' in request; let hash = '';
      if (mutation) {
        requireTechnical(access); hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
        const receipt = (await db.query<{ payload_hash: string; response: unknown }>(`SELECT payload_hash,response FROM deployment_receipt
          WHERE project_id=$1 AND actor_id=$2 AND request_id=$3`, [request.projectId, actor.id, request.requestId])).rows[0];
        if (receipt) {
          if (receipt.payload_hash !== hash) conflict();
          const response = deploymentsResponseSchema.parse(receipt.response); await db.query('COMMIT'); return response;
        }
        const total = Number((await db.query<{ total: string }>('SELECT count(*)::text AS total FROM deployment_receipt WHERE project_id=$1', [request.projectId])).rows[0]?.total ?? 0);
        if (total >= 100000) invalid('This project has reached its mutation receipt limit.');
      }
      const response = deploymentsResponseSchema.parse(await executeRequest(db, access, request));
      if (mutation) await db.query(`INSERT INTO deployment_receipt(project_id,actor_id,request_id,payload_hash,response)
        VALUES($1,$2,$3,$4,$5::jsonb)`, [request.projectId, actor.id, request.requestId, hash, JSON.stringify(response)]);
      await db.query('COMMIT'); return response;
    } catch (error) {
      await db?.query('ROLLBACK').catch(() => undefined);
      if (error instanceof WorkError) return { ok: false, code: error.code === 'quota_exceeded' ? 'invalid_request' : error.code, message: error.message };
      reportError?.(error); return { ok: false, code: 'unavailable', message: 'Environments are temporarily unavailable. Check the connection and retry.' };
    } finally { db?.release(); }
  } };
}

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseBoundary } from '@nexus-ai/db';
import {
  collaborationResponseSchema, type CollaborationRequest, type CollaborationResponse,
  type CollaborationScope, type Invitation, type InvitationPreview, type Member,
  type Project, type Repository, type Workspace,
} from '@nexus-ai/contracts';
import { EmailDeliveryError, type EmailSender } from './email.js';

// Reuse the typed DB boundary without adding a second pg type dependency here.
type Client = Pick<NonNullable<DatabaseBoundary['pool']>, 'query'>;
type Actor = { id: string; email: string };
type WorkspaceRow = { id: string; name: string; created_at: Date; role: 'owner' | 'member' };
type ProjectRow = {
  id: string; workspace_id: string; name: string; description: string;
  default_visibility: Project['defaultVisibility']; created_at: Date; updated_at: Date;
  workspace_role: 'owner' | 'member'; project_role: Project['role'] | null;
};
type InvitationRow = {
  id: string; workspace_id: string; project_id: string | null; email: string;
  role: Invitation['role']; status: 'pending' | 'accepted' | 'revoked';
  created_at: Date; expires_at: Date;
};
type ErrorCode = Extract<CollaborationResponse, { ok: false }>['code'];
export class CollaborationError extends Error {
  constructor(readonly code: ErrorCode, message: string) { super(message); }
}
function deny(): never { throw new CollaborationError('not_found', 'Risorsa non disponibile per questo account.'); }
function forbidden(): never { throw new CollaborationError('forbidden', 'Il tuo ruolo non consente questa operazione.'); }
function conflict(message: string): never { throw new CollaborationError('conflict', message); }
function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
const iso = (value: Date): string => value.toISOString();

/** Role validation is independent of UI and SQL constraints. Scope changes never promote members. */
export function validateScopeRole(scope: CollaborationScope, role: Invitation['role']): void {
  const valid = scope.kind === 'workspace'
    ? ['owner', 'member'].includes(role)
    : ['owner', 'developer', 'client', 'viewer'].includes(role);
  if (!valid) throw new CollaborationError('invalid_request', 'Ruolo non valido per questo ambito.');
}
export function projectAccess(row: Pick<ProjectRow, 'workspace_role' | 'project_role'>): Project['role'] {
  if (row.workspace_role === 'owner') return 'owner';
  if (!row.project_role) return deny();
  return row.project_role;
}
export function canViewRepository(role: Project['role']): boolean { return role === 'owner' || role === 'developer'; }

async function workspaceAccess(db: Client, actor: Actor, id: string, lock = false): Promise<WorkspaceRow> {
  if (lock) await db.query('SELECT id FROM workspace WHERE id = $1 FOR UPDATE', [id]);
  const result = await db.query<WorkspaceRow>(`SELECT w.id, w.name, w.created_at, m.role FROM workspace w
    JOIN workspace_member m ON m.workspace_id = w.id AND m.user_id = $2 WHERE w.id = $1`, [id, actor.id]);
  return result.rows[0] ?? deny();
}
async function projectAccessRow(db: Client, actor: Actor, id: string, lock = false): Promise<ProjectRow> {
  if (lock) {
    // All mutations acquire workspace before project, including workspace member removal.
    await db.query('SELECT w.id FROM workspace w JOIN project p ON p.workspace_id = w.id WHERE p.id = $1 FOR UPDATE OF w', [id]);
    await db.query('SELECT id FROM project WHERE id = $1 FOR UPDATE', [id]);
  }
  const result = await db.query<ProjectRow>(`SELECT p.*, wm.role AS workspace_role, pm.role AS project_role
    FROM project p JOIN workspace_member wm ON wm.workspace_id = p.workspace_id AND wm.user_id = $2
    LEFT JOIN project_member pm ON pm.project_id = p.id AND pm.user_id = $2
    WHERE p.id = $1 AND (wm.role = 'owner' OR pm.user_id IS NOT NULL)`, [id, actor.id]);
  return result.rows[0] ?? deny();
}
async function requireManager(db: Client, actor: Actor, scope: CollaborationScope, lock = false): Promise<string> {
  if (scope.kind === 'workspace') {
    const workspace = await workspaceAccess(db, actor, scope.workspaceId, lock);
    if (workspace.role !== 'owner') forbidden();
    return workspace.id;
  }
  const project = await projectAccessRow(db, actor, scope.projectId, lock);
  if (projectAccess(project) !== 'owner') forbidden();
  return project.workspace_id;
}
function workspaceDTO(row: WorkspaceRow): Workspace { return { id: row.id, name: row.name, role: row.role, createdAt: iso(row.created_at) }; }
function repositoryDTO(row: { id: string; project_id: string; remote_url: string; default_branch: string }): Repository {
  return { id: row.id, projectId: row.project_id, remoteUrl: row.remote_url, defaultBranch: row.default_branch };
}
async function projectDTO(db: Client, row: ProjectRow): Promise<Project> {
  const role = projectAccess(row);
  const technical = canViewRepository(role);
  const repository = technical ? (await db.query<{ id: string; project_id: string; remote_url: string; default_branch: string }>(
    'SELECT id, project_id, remote_url, default_branch FROM repository WHERE project_id = $1', [row.id])).rows[0] : undefined;
  return {
    id: row.id, workspaceId: row.workspace_id, name: row.name, description: row.description,
    defaultVisibility: row.default_visibility, role, repository: repository ? repositoryDTO(repository) : null,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    capabilities: { manageMembers: role === 'owner', editProject: role === 'owner', viewRepository: technical },
  };
}
function invitationScope(row: InvitationRow): CollaborationScope {
  return row.project_id ? { kind: 'project', projectId: row.project_id } : { kind: 'workspace', workspaceId: row.workspace_id };
}
function invitationDTO(row: InvitationRow): Invitation {
  return {
    id: row.id, scope: invitationScope(row), email: row.email, role: row.role,
    status: row.status === 'pending' && row.expires_at.getTime() <= Date.now() ? 'expired' : row.status,
    createdAt: iso(row.created_at), expiresAt: iso(row.expires_at),
  };
}
function requirePending(row: InvitationRow): void {
  if (row.status !== 'pending') throw new CollaborationError('invitation_used', 'Questo invito è già stato utilizzato o revocato.');
  if (row.expires_at.getTime() <= Date.now()) throw new CollaborationError('invitation_expired', 'Questo invito è scaduto. Richiedi un nuovo invito.');
}

export function createCollaborationService(database: DatabaseBoundary, mail: EmailSender | null, webURL: string) {
  return {
    async execute(actor: Actor, request: CollaborationRequest): Promise<CollaborationResponse> {
      if (!database.pool) return { ok: false, code: 'unavailable', message: 'Database non disponibile.' };
      const db = await database.pool.connect();
      try {
        await db.query('BEGIN');
        const response = await dispatch(db, actor, request, mail, webURL);
        const validated = collaborationResponseSchema.parse(response);
        await recordMutation(db, actor, request, validated);
        await db.query('COMMIT');
        return validated;
      } catch (error) {
        await db.query('ROLLBACK').catch(() => undefined);
        if (error instanceof CollaborationError) return { ok: false, code: error.code, message: error.message };
        if (error instanceof EmailDeliveryError) return { ok: false, code: 'email_unavailable', message: error.message };
        // Database errors may contain SQL parameters and must never cross this boundary.
        return { ok: false, code: 'unavailable', message: 'Operazione non disponibile. Riprova tra poco.' };
      } finally { db.release(); }
    },
  };
}

async function recordMutation(db: Client, actor: Actor, request: CollaborationRequest, response: CollaborationResponse): Promise<void> {
  if (!response.ok || ['listWorkspaces', 'listProjects', 'getProject', 'listMembers', 'listInvitations', 'previewInvitation'].includes(request.operation)) return;
  let workspaceId: string | undefined;
  let projectId: string | null = null;
  const payload: Record<string, string> = {};
  if ('workspaceId' in request) workspaceId = request.workspaceId;
  if ('projectId' in request) projectId = request.projectId;
  if ('scope' in request) {
    if (request.scope.kind === 'workspace') workspaceId = request.scope.workspaceId;
    else projectId = request.scope.projectId;
  }
  if ('userId' in request) payload['userId'] = request.userId;
  if (response.kind === 'workspace') workspaceId = response.item.id;
  if (response.kind === 'project') { projectId = response.item.id; workspaceId = response.item.workspaceId; }
  if (request.operation === 'revokeInvitation' || request.operation === 'acceptInvitation') {
    const invitation = request.operation === 'revokeInvitation'
      ? (await db.query<InvitationRow>('SELECT * FROM invitation WHERE id = $1', [request.invitationId])).rows[0]
      : (await db.query<InvitationRow>('SELECT * FROM invitation WHERE token_hash = $1', [hashToken(request.token)])).rows[0];
    if (!invitation) return deny();
    workspaceId = invitation.workspace_id;
    projectId = invitation.project_id;
    payload['invitationId'] = invitation.id;
  }
  if (projectId && !workspaceId) workspaceId = (await db.query<{ workspace_id: string }>('SELECT workspace_id FROM project WHERE id = $1', [projectId])).rows[0]?.workspace_id;
  if (!workspaceId) throw new Error('Missing collaboration event scope.');
  await db.query(`INSERT INTO collaboration_event (id, workspace_id, project_id, actor_id, event_type, payload)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, [randomUUID(), workspaceId, projectId, actor.id, request.operation, JSON.stringify(payload)]);
}

async function dispatch(db: Client, actor: Actor, request: CollaborationRequest, mail: EmailSender | null, webURL: string): Promise<CollaborationResponse> {
  switch (request.operation) {
    case 'listWorkspaces': {
      const rows = await db.query<WorkspaceRow>(`SELECT w.id, w.name, w.created_at, m.role FROM workspace w
        JOIN workspace_member m ON m.workspace_id = w.id WHERE m.user_id = $1 ORDER BY w.created_at, w.id`, [actor.id]);
      return { ok: true, kind: 'workspaces', items: rows.rows.map(workspaceDTO) };
    }
    case 'createWorkspace': {
      const id = randomUUID();
      await db.query('INSERT INTO workspace (id, name) VALUES ($1, $2)', [id, request.name]);
      await db.query("INSERT INTO workspace_member (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [id, actor.id]);
      return { ok: true, kind: 'workspace', item: workspaceDTO(await workspaceAccess(db, actor, id)) };
    }
    case 'updateWorkspace': {
      await requireManager(db, actor, { kind: 'workspace', workspaceId: request.workspaceId }, true);
      await db.query('UPDATE workspace SET name = $2, updated_at = now() WHERE id = $1', [request.workspaceId, request.name]);
      return { ok: true, kind: 'workspace', item: workspaceDTO(await workspaceAccess(db, actor, request.workspaceId)) };
    }
    case 'listProjects': {
      const workspace = await workspaceAccess(db, actor, request.workspaceId);
      const rows = await db.query<ProjectRow>(`SELECT p.*, $3::text AS workspace_role, pm.role AS project_role
        FROM project p LEFT JOIN project_member pm ON pm.project_id = p.id AND pm.user_id = $2
        WHERE p.workspace_id = $1 AND ($3 = 'owner' OR pm.user_id IS NOT NULL) ORDER BY p.created_at, p.id`, [workspace.id, actor.id, workspace.role]);
      return { ok: true, kind: 'projects', items: await Promise.all(rows.rows.map(row => projectDTO(db, row))) };
    }
    case 'createProject': {
      await requireManager(db, actor, { kind: 'workspace', workspaceId: request.workspaceId }, true);
      const id = randomUUID();
      await db.query('INSERT INTO project (id, workspace_id, name, description, default_visibility) VALUES ($1, $2, $3, $4, $5)',
        [id, request.workspaceId, request.name, request.description, request.defaultVisibility]);
      await db.query("INSERT INTO project_member (project_id, user_id, role) VALUES ($1, $2, 'owner')", [id, actor.id]);
      return { ok: true, kind: 'project', item: await projectDTO(db, await projectAccessRow(db, actor, id)) };
    }
    case 'getProject': return { ok: true, kind: 'project', item: await projectDTO(db, await projectAccessRow(db, actor, request.projectId)) };
    case 'updateProject': {
      await requireManager(db, actor, { kind: 'project', projectId: request.projectId }, true);
      await db.query('UPDATE project SET name = $2, description = $3, default_visibility = $4, updated_at = now() WHERE id = $1',
        [request.projectId, request.name, request.description, request.defaultVisibility]);
      return { ok: true, kind: 'project', item: await projectDTO(db, await projectAccessRow(db, actor, request.projectId)) };
    }
    case 'listMembers': return listMembers(db, actor, request.scope);
    case 'changeMemberRole': {
      validateScopeRole(request.scope, request.role);
      await requireManager(db, actor, request.scope, true);
      await changeMembership(db, request.scope, request.userId, request.role);
      return { ok: true, kind: 'done' };
    }
    case 'removeMember': {
      await requireManager(db, actor, request.scope, true);
      await changeMembership(db, request.scope, request.userId, null);
      return { ok: true, kind: 'done' };
    }
    case 'createInvitation': return createInvitation(db, actor, request, mail, webURL);
    case 'listInvitations': {
      await requireManager(db, actor, request.scope);
      const rows = request.scope.kind === 'workspace'
        ? await db.query<InvitationRow>('SELECT * FROM invitation WHERE workspace_id = $1 AND project_id IS NULL ORDER BY created_at DESC LIMIT 200', [request.scope.workspaceId])
        : await db.query<InvitationRow>('SELECT * FROM invitation WHERE project_id = $1 ORDER BY created_at DESC LIMIT 200', [request.scope.projectId]);
      return { ok: true, kind: 'invitations', items: rows.rows.map(invitationDTO) };
    }
    case 'revokeInvitation': {
      // Lock scope containers before the invitation, matching acceptance lock order.
      const current = (await db.query<InvitationRow>('SELECT * FROM invitation WHERE id = $1', [request.invitationId])).rows[0] ?? deny();
      await requireManager(db, actor, invitationScope(current), true);
      const row = (await db.query<InvitationRow>('SELECT * FROM invitation WHERE id = $1 FOR UPDATE', [request.invitationId])).rows[0] ?? deny();
      requirePending(row);
      await db.query("UPDATE invitation SET status = 'revoked' WHERE id = $1", [row.id]);
      return { ok: true, kind: 'done' };
    }
    case 'previewInvitation': return { ok: true, kind: 'invitation', item: await previewInvitation(db, actor, request.token) };
    case 'acceptInvitation': return acceptInvitation(db, actor, request.token);
    case 'setRepository': {
      await requireManager(db, actor, { kind: 'project', projectId: request.projectId }, true);
      const row = (await db.query<{ id: string; project_id: string; remote_url: string; default_branch: string }>(`INSERT INTO repository (id, project_id, remote_url, default_branch)
        VALUES ($1, $2, $3, $4) ON CONFLICT (project_id) DO UPDATE SET remote_url = EXCLUDED.remote_url, default_branch = EXCLUDED.default_branch RETURNING *`,
      [randomUUID(), request.projectId, request.remoteUrl, request.defaultBranch])).rows[0];
      if (!row) return deny();
      await db.query('UPDATE project SET updated_at = now() WHERE id = $1', [request.projectId]);
      return { ok: true, kind: 'repository', item: repositoryDTO(row) };
    }
  }
}

async function listMembers(db: Client, actor: Actor, scope: CollaborationScope): Promise<CollaborationResponse> {
  let revealEmail: boolean;
  if (scope.kind === 'workspace') revealEmail = (await workspaceAccess(db, actor, scope.workspaceId)).role === 'owner';
  else revealEmail = canViewRepository(projectAccess(await projectAccessRow(db, actor, scope.projectId)));
  const query = scope.kind === 'workspace'
    ? 'SELECT u.id AS user_id, u.name, u.email, u.image, m.role, m.joined_at FROM workspace_member m JOIN "user" u ON u.id = m.user_id WHERE m.workspace_id = $1 ORDER BY m.joined_at, u.id'
    : 'SELECT u.id AS user_id, u.name, u.email, u.image, m.role, m.joined_at FROM project_member m JOIN "user" u ON u.id = m.user_id WHERE m.project_id = $1 ORDER BY m.joined_at, u.id';
  const rows = await db.query<{ user_id: string; name: string; email: string; image: string | null; role: Member['role']; joined_at: Date }>(query,
    [scope.kind === 'workspace' ? scope.workspaceId : scope.projectId]);
  return { ok: true, kind: 'members', items: rows.rows.map(row => ({
    userId: row.user_id, name: row.name, email: revealEmail || row.user_id === actor.id ? row.email : null,
    image: row.image, role: row.role, joinedAt: iso(row.joined_at),
  })) };
}

/** Container lock is held by the caller, so concurrent owner changes serialize. */
async function changeMembership(db: Client, scope: CollaborationScope, userId: string, role: Invitation['role'] | null): Promise<void> {
  const workspace = scope.kind === 'workspace';
  const table = workspace ? 'workspace_member' : 'project_member';
  const column = workspace ? 'workspace_id' : 'project_id';
  const id = workspace ? scope.workspaceId : scope.projectId;
  const current = (await db.query<{ role: string }>(`SELECT role FROM ${table} WHERE ${column} = $1 AND user_id = $2`, [id, userId])).rows[0] ?? deny();
  if (current.role === 'owner' && role !== 'owner') {
    const owners = await db.query(`SELECT user_id FROM ${table} WHERE ${column} = $1 AND role = 'owner'`, [id]);
    if (owners.rows.length <= 1) conflict('Deve rimanere almeno un owner esplicito. Assegna prima un altro owner.');
  }
  if (workspace && role === null) {
    await db.query('SELECT id FROM project WHERE workspace_id = $1 ORDER BY id FOR UPDATE', [id]);
    const stranded = await db.query(`SELECT p.id FROM project p JOIN project_member mine ON mine.project_id = p.id AND mine.user_id = $2 AND mine.role = 'owner'
      WHERE p.workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM project_member other WHERE other.project_id = p.id AND other.role = 'owner' AND other.user_id <> $2) LIMIT 1`, [id, userId]);
    if (stranded.rows.length) conflict('Questo membro è l’ultimo owner di un progetto. Assegna prima un altro owner al progetto.');
    await db.query('DELETE FROM project_member WHERE user_id = $2 AND project_id IN (SELECT id FROM project WHERE workspace_id = $1)', [id, userId]);
  }
  if (role === null) await db.query(`DELETE FROM ${table} WHERE ${column} = $1 AND user_id = $2`, [id, userId]);
  else await db.query(`UPDATE ${table} SET role = $3 WHERE ${column} = $1 AND user_id = $2`, [id, userId, role]);
}

async function createInvitation(db: Client, actor: Actor, request: Extract<CollaborationRequest, { operation: 'createInvitation' }>, mail: EmailSender | null, webURL: string): Promise<CollaborationResponse> {
  validateScopeRole(request.scope, request.role);
  const workspaceId = await requireManager(db, actor, request.scope, true);
  if (!mail) throw new EmailDeliveryError();
  const target = (await db.query<{ id: string }>('SELECT id FROM "user" WHERE lower(email) = $1', [request.email])).rows[0];
  if (target) {
    const existing = request.scope.kind === 'workspace'
      ? await db.query('SELECT 1 FROM workspace_member WHERE workspace_id = $1 AND user_id = $2', [workspaceId, target.id])
      : await db.query('SELECT 1 FROM project_member WHERE project_id = $1 AND user_id = $2', [request.scope.projectId, target.id]);
    if (existing.rows.length) conflict('L’account è già membro. Usa il cambio ruolo esplicito per modificarne i permessi.');
  }
  const recent = await db.query<{ count: string }>("SELECT count(*)::text FROM invitation WHERE workspace_id = $1 AND created_by = $2 AND created_at > now() - interval '5 minutes'", [workspaceId, actor.id]);
  if (Number(recent.rows[0]?.count ?? 0) >= 20) conflict('Troppi inviti recenti. Attendi qualche minuto e riprova.');
  const token = randomBytes(32).toString('base64url');
  const projectId = request.scope.kind === 'project' ? request.scope.projectId : null;
  // A replacement invalidates older unused invitations to the same scope and recipient.
  await db.query("UPDATE invitation SET status = 'revoked' WHERE workspace_id = $1 AND project_id IS NOT DISTINCT FROM $2::text AND email = $3 AND status = 'pending'", [workspaceId, projectId, request.email]);
  await db.query(`INSERT INTO invitation (id, workspace_id, project_id, email, role, token_hash, created_by, status, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', now() + interval '72 hours')`,
  [randomUUID(), workspaceId, projectId, request.email, request.role, hashToken(token), actor.id]);
  const url = new URL('/', webURL);
  url.hash = `/invitations?token=${token}`;
  await mail.send(request.email, 'invitation', url.toString());
  return { ok: true, kind: 'done' };
}

async function findRecipientInvitation(db: Client, actor: Actor, token: string, lock = false): Promise<InvitationRow> {
  const row = (await db.query<InvitationRow>(`SELECT * FROM invitation WHERE token_hash = $1${lock ? ' FOR UPDATE' : ''}`, [hashToken(token)])).rows[0];
  if (!row || row.email.toLowerCase() !== actor.email.toLowerCase()) return deny();
  requirePending(row);
  return row;
}
async function previewInvitation(db: Client, actor: Actor, token: string): Promise<InvitationPreview> {
  const row = await findRecipientInvitation(db, actor, token);
  const names = (await db.query<{ workspace_name: string; project_name: string | null }>(`SELECT w.name AS workspace_name, p.name AS project_name
    FROM workspace w LEFT JOIN project p ON p.id = $2 AND p.workspace_id = w.id WHERE w.id = $1`, [row.workspace_id, row.project_id])).rows[0] ?? deny();
  return { id: row.id, scope: invitationScope(row), workspaceName: names.workspace_name, projectName: names.project_name,
    role: row.role, expiresAt: iso(row.expires_at) };
}
async function acceptInvitation(db: Client, actor: Actor, token: string): Promise<CollaborationResponse> {
  const initial = await findRecipientInvitation(db, actor, token);
  await db.query('SELECT id FROM workspace WHERE id = $1 FOR UPDATE', [initial.workspace_id]);
  if (initial.project_id) await db.query('SELECT id FROM project WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [initial.project_id, initial.workspace_id]);
  const row = await findRecipientInvitation(db, actor, token, true);
  const scope = invitationScope(row);
  validateScopeRole(scope, row.role);
  // The invitation must still have a current issuer entitled to grant access.
  await requireManager(db, { id: (await db.query<{ created_by: string }>('SELECT created_by FROM invitation WHERE id = $1', [row.id])).rows[0]?.created_by ?? '', email: '' }, scope);
  if (row.project_id) {
    const existing = await db.query('SELECT 1 FROM project_member WHERE project_id = $1 AND user_id = $2', [row.project_id, actor.id]);
    if (existing.rows.length) conflict('Sei già membro del progetto. Un invito non può modificarne il ruolo.');
    await db.query("INSERT INTO workspace_member (workspace_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT (workspace_id, user_id) DO NOTHING", [row.workspace_id, actor.id]);
    await db.query('INSERT INTO project_member (project_id, user_id, role) VALUES ($1, $2, $3)', [row.project_id, actor.id, row.role]);
  } else {
    const existing = await db.query('SELECT 1 FROM workspace_member WHERE workspace_id = $1 AND user_id = $2', [row.workspace_id, actor.id]);
    if (existing.rows.length) conflict('Sei già membro del workspace. Un invito non può modificarne il ruolo.');
    await db.query('INSERT INTO workspace_member (workspace_id, user_id, role) VALUES ($1, $2, $3)', [row.workspace_id, actor.id, row.role]);
  }
  await db.query("UPDATE invitation SET status = 'accepted', accepted_at = now() WHERE id = $1", [row.id]);
  return { ok: true, kind: 'done' };
}

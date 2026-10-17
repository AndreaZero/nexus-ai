import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseBoundary } from '@nexus-ai/db';
import type { CollaborationScope } from '@nexus-ai/contracts';
import { canViewRepository, CollaborationError, createCollaborationService, projectAccess, validateScopeRole } from './collaboration.js';

const workspaceId = '21a22c8f-2729-48bd-953d-8d6057ea6663';
const projectId = 'c588dc20-9f17-4f13-9354-8b7ed43be890';
const actor = { id: 'account-a', email: 'a@example.test' };
const now = new Date();

test('workspace role cannot be used to smuggle a project or administrative role', () => {
  const workspace: CollaborationScope = { kind: 'workspace', workspaceId };
  const project: CollaborationScope = { kind: 'project', projectId };
  for (const role of ['owner', 'member'] as const) assert.doesNotThrow(() => validateScopeRole(workspace, role));
  for (const role of ['developer', 'client', 'viewer'] as const) assert.throws(() => validateScopeRole(workspace, role), CollaborationError);
  assert.throws(() => validateScopeRole(project, 'member'), CollaborationError);
  for (const role of ['owner', 'developer', 'client', 'viewer'] as const) assert.doesNotThrow(() => validateScopeRole(project, role));
});

test('workspace membership alone never grants a project and client/viewer cannot read repositories', () => {
  assert.throws(() => projectAccess({ workspace_role: 'member', project_role: null }), CollaborationError);
  assert.equal(projectAccess({ workspace_role: 'owner', project_role: null }), 'owner');
  assert.equal(projectAccess({ workspace_role: 'member', project_role: 'client' }), 'client');
  for (const role of ['owner', 'developer'] as const) assert.equal(canViewRepository(role), true);
  for (const role of ['client', 'viewer'] as const) assert.equal(canViewRepository(role), false);
});

function fakeDatabase(answer: (sql: string, values: readonly unknown[]) => unknown[]) {
  const statements: string[] = [];
  const client = {
    async query(sql: string, values: readonly unknown[] = []) { statements.push(sql); return { rows: answer(sql, values) }; },
    release() {},
  };
  return { statements, boundary: { pool: { connect: async () => client } } as unknown as DatabaseBoundary };
}

test('project projection excludes repository query and URL for clients; outsiders receive no project details', async () => {
  const fake = fakeDatabase(sql => sql.includes('SELECT p.*') ? [{
    id: projectId, workspace_id: workspaceId, name: 'Allowed project', description: '', default_visibility: 'team',
    created_at: now, updated_at: now, workspace_role: 'member', project_role: 'client',
  }] : []);
  const service = createCollaborationService(fake.boundary, null, 'https://example.test');
  const response = await service.execute(actor, { operation: 'getProject', projectId });
  assert.ok(response.ok && response.kind === 'project');
  assert.equal(response.item.repository, null);
  assert.equal(response.item.capabilities.viewRepository, false);
  assert.equal(fake.statements.some(sql => sql.includes('FROM repository')), false);
  const outsider = fakeDatabase(() => []);
  const denied = await createCollaborationService(outsider.boundary, null, 'https://example.test').execute(actor, { operation: 'getProject', projectId });
  assert.deepEqual(denied, { ok: false, code: 'not_found', message: 'Risorsa non disponibile per questo account.' });
  assert.ok(outsider.statements.includes('ROLLBACK'));
});

test('last workspace owner cannot be demoted and the container is locked before checking owners', async () => {
  const fake = fakeDatabase(sql => {
    if (sql.includes('JOIN workspace_member m')) return [{ id: workspaceId, name: 'Workspace', role: 'owner', created_at: now }];
    if (sql.startsWith('SELECT role FROM workspace_member')) return [{ role: 'owner' }];
    if (sql.startsWith('SELECT user_id FROM workspace_member')) return [{ user_id: actor.id }];
    return [];
  });
  const result = await createCollaborationService(fake.boundary, null, 'https://example.test').execute(actor, {
    operation: 'changeMemberRole', scope: { kind: 'workspace', workspaceId }, userId: actor.id, role: 'member',
  });
  assert.ok(!result.ok && result.code === 'conflict');
  const lock = fake.statements.findIndex(sql => sql.includes('FOR UPDATE'));
  const owners = fake.statements.findIndex(sql => sql.startsWith('SELECT user_id FROM workspace_member'));
  assert.ok(lock > 0 && owners > lock);
  assert.equal(fake.statements.some(sql => sql.startsWith('UPDATE workspace_member')), false);
  assert.ok(fake.statements.includes('ROLLBACK'));
});

test('invitation token never reveals a different recipient or creates membership for them', async () => {
  const fake = fakeDatabase(sql => sql.includes('FROM invitation') ? [{
    id: projectId, workspace_id: workspaceId, project_id: null, email: 'another@example.test',
    role: 'owner', status: 'pending', created_at: now, expires_at: new Date(Date.now() + 10_000),
  }] : []);
  const response = await createCollaborationService(fake.boundary, null, 'https://example.test').execute(actor, {
    operation: 'acceptInvitation', token: 'A'.repeat(43),
  });
  assert.ok(!response.ok && response.code === 'not_found');
  assert.equal(JSON.stringify(response).includes('another@example.test'), false);
  assert.equal(fake.statements.some(sql => sql.startsWith('INSERT')), false);
});

test('a consumed invitation is rejected before membership changes', async () => {
  const fake = fakeDatabase(sql => sql.includes('FROM invitation') ? [{
    id: projectId, workspace_id: workspaceId, project_id: null, email: actor.email,
    role: 'owner', status: 'accepted', created_at: now, expires_at: new Date(Date.now() + 10_000),
  }] : []);
  const response = await createCollaborationService(fake.boundary, null, 'https://example.test').execute(actor, {
    operation: 'acceptInvitation', token: 'B'.repeat(43),
  });
  assert.ok(!response.ok && response.code === 'invitation_used');
  assert.equal(fake.statements.some(sql => sql.startsWith('INSERT')), false);
});

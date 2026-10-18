import { z } from 'zod';

const id = z.uuid();
const userId = z.string().min(1).max(128);
const name = z.string().trim().min(1).max(100);
export const workspaceRoleSchema = z.enum(['owner', 'member']);
export const projectRoleSchema = z.enum(['owner', 'developer', 'client', 'viewer']);
export const visibilitySchema = z.enum(['private', 'team', 'client']);
export const collaborationScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('workspace'), workspaceId: id }).strict(),
  z.object({ kind: z.literal('project'), projectId: id }).strict(),
]);
export const remoteRepositoryUrlSchema = z.url().max(500).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}, 'Use an HTTPS repository URL without credentials, query or fragment.');
// An empty location explicitly means local work without a configured remote.
export const repositoryLocationSchema = z.union([z.literal(''), remoteRepositoryUrlSchema]);
export const repositorySchema = z.object({
  id, projectId: id, remoteUrl: repositoryLocationSchema,
  defaultBranch: z.string().trim().min(1).max(100),
}).strict();
export const workspaceSchema = z.object({
  id, name, role: workspaceRoleSchema, createdAt: z.iso.datetime(),
}).strict();
export const projectSchema = z.object({
  id, workspaceId: id, name, description: z.string().max(2000),
  defaultVisibility: visibilitySchema, role: projectRoleSchema,
  repository: repositorySchema.nullable(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  capabilities: z.object({ manageMembers: z.boolean(), editProject: z.boolean(), viewRepository: z.boolean() }).strict(),
}).strict();
export const memberSchema = z.object({
  userId, name: z.string(), email: z.email().nullable(), image: z.string().nullable(),
  role: z.enum(['owner', 'member', 'developer', 'client', 'viewer']), joinedAt: z.iso.datetime(),
}).strict();
export const invitationSchema = z.object({
  id, scope: collaborationScopeSchema, email: z.email(),
  role: z.enum(['owner', 'member', 'developer', 'client', 'viewer']),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
  createdAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
}).strict();
export const invitationPreviewSchema = z.object({
  id, scope: collaborationScopeSchema, workspaceName: name, projectName: name.nullable(),
  role: z.enum(['owner', 'member', 'developer', 'client', 'viewer']), expiresAt: z.iso.datetime(),
}).strict();
const scope = { scope: collaborationScopeSchema };
const project = { projectId: id };
const invitationToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const collaborationRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('listWorkspaces') }).strict(),
  z.object({ operation: z.literal('createWorkspace'), name }).strict(),
  z.object({ operation: z.literal('updateWorkspace'), workspaceId: id, name }).strict(),
  z.object({ operation: z.literal('listProjects'), workspaceId: id }).strict(),
  z.object({ operation: z.literal('createProject'), workspaceId: id, name, description: z.string().trim().max(2000), defaultVisibility: visibilitySchema }).strict(),
  z.object({ operation: z.literal('getProject'), ...project }).strict(),
  z.object({ operation: z.literal('updateProject'), ...project, name, description: z.string().trim().max(2000), defaultVisibility: visibilitySchema }).strict(),
  z.object({ operation: z.literal('listMembers'), ...scope }).strict(),
  z.object({ operation: z.literal('changeMemberRole'), ...scope, userId, role: z.enum(['owner', 'member', 'developer', 'client', 'viewer']) }).strict(),
  z.object({ operation: z.literal('removeMember'), ...scope, userId }).strict(),
  z.object({ operation: z.literal('createInvitation'), ...scope, email: z.email().max(254).transform(value => value.toLowerCase()), role: z.enum(['owner', 'member', 'developer', 'client', 'viewer']) }).strict(),
  z.object({ operation: z.literal('listInvitations'), ...scope }).strict(),
  z.object({ operation: z.literal('revokeInvitation'), invitationId: id }).strict(),
  z.object({ operation: z.literal('previewInvitation'), token: invitationToken }).strict(),
  z.object({ operation: z.literal('acceptInvitation'), token: invitationToken }).strict(),
  z.object({ operation: z.literal('setRepository'), ...project, remoteUrl: repositoryLocationSchema, defaultBranch: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/) }).strict(),
]);
export const collaborationErrorSchema = z.object({
  ok: z.literal(false), code: z.enum(['auth_required', 'forbidden', 'not_found', 'conflict', 'invalid_request', 'unavailable', 'email_unavailable', 'invitation_expired', 'invitation_used']),
  message: z.string().max(500),
}).strict();
export const collaborationResponseSchema = z.union([
  collaborationErrorSchema,
  z.object({ ok: z.literal(true), kind: z.literal('workspaces'), items: z.array(workspaceSchema) }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('workspace'), item: workspaceSchema }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('projects'), items: z.array(projectSchema) }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('project'), item: projectSchema }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('members'), items: z.array(memberSchema) }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('invitations'), items: z.array(invitationSchema) }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('invitation'), item: invitationPreviewSchema }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('repository'), item: repositorySchema }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('done') }).strict(),
]);
export const localBindingRequestSchema = z.object({
  operation: z.enum(['get', 'select', 'remove']), projectId: id, repositoryId: id,
}).strict();
export const localBindingSchema = z.object({
  projectId: id, repositoryId: id, deviceId: id, rootPath: z.string().min(1), label: z.string().min(1), updatedAt: z.iso.datetime(),
}).strict();
export const localBindingResponseSchema = z.union([
  collaborationErrorSchema,
  z.object({ ok: z.literal(true), binding: localBindingSchema.nullable() }).strict(),
]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type ProjectRole = z.infer<typeof projectRoleSchema>;
export type Visibility = z.infer<typeof visibilitySchema>;
export type CollaborationScope = z.infer<typeof collaborationScopeSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Repository = z.infer<typeof repositorySchema>;
export type Member = z.infer<typeof memberSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;
export type CollaborationRequest = z.infer<typeof collaborationRequestSchema>;
export type CollaborationResponse = z.infer<typeof collaborationResponseSchema>;
export type LocalBindingRequest = z.infer<typeof localBindingRequestSchema>;
export type LocalBindingResponse = z.infer<typeof localBindingResponseSchema>;
export type LocalBinding = z.infer<typeof localBindingSchema>;

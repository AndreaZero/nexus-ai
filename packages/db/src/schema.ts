import { sql } from 'drizzle-orm';
import { bigint, boolean, check, doublePrecision, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// Better Auth 1.7.10 model keys; physical column names remain explicit SQL identifiers.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [index('session_user_id_idx').on(table.userId), index('session_expires_at_idx').on(table.expiresAt)]);

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('account_user_id_idx').on(table.userId),
  uniqueIndex('account_provider_identity_idx').on(table.providerId, table.accountId),
]);

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('verification_identifier_idx').on(table.identifier), index('verification_expires_at_idx').on(table.expiresAt)]);

export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});

export const authSchema = { user, session, account, verification, rateLimit };

export const workspace = pgTable('workspace', {
  id: text('id').primaryKey(), name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const workspaceMember = pgTable('workspace_member', {
  workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'member'] }).notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.userId] }), index('workspace_member_user_idx').on(table.userId),
  check('workspace_member_role_check', sql`${table.role} IN ('owner', 'member')`),
]);
export const project = pgTable('project', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), description: text('description').notNull().default(''),
  defaultVisibility: text('default_visibility', { enum: ['private', 'team', 'client'] }).notNull().default('team'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('project_workspace_idx').on(table.workspaceId), uniqueIndex('project_workspace_identity_idx').on(table.id, table.workspaceId),
  check('project_visibility_check', sql`${table.defaultVisibility} IN ('private', 'team', 'client')`),
]);
export const projectMember = pgTable('project_member', {
  projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'developer', 'client', 'viewer'] }).notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.userId] }), index('project_member_user_idx').on(table.userId),
  check('project_member_role_check', sql`${table.role} IN ('owner', 'developer', 'client', 'viewer')`),
]);
export const repository = pgTable('repository', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }).unique(),
  remoteUrl: text('remote_url').notNull(), defaultBranch: text('default_branch').notNull(),
});
export const invitation = pgTable('invitation', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  projectId: text('project_id'), email: text('email').notNull(),
  role: text('role', { enum: ['owner', 'member', 'developer', 'client', 'viewer'] }).notNull(),
  tokenHash: text('token_hash').notNull().unique(), createdBy: text('created_by').notNull().references(() => user.id),
  status: text('status', { enum: ['pending', 'accepted', 'revoked'] }).notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
}, (table) => [
  foreignKey({ columns: [table.projectId, table.workspaceId], foreignColumns: [project.id, project.workspaceId], name: 'invitation_project_workspace_fk' }).onDelete('cascade'),
  index('invitation_scope_idx').on(table.workspaceId, table.projectId), index('invitation_expiry_idx').on(table.expiresAt),
  check('invitation_status_check', sql`${table.status} IN ('pending', 'accepted', 'revoked')`),
  check('invitation_scope_role_check', sql`(${table.projectId} IS NULL AND ${table.role} IN ('owner', 'member')) OR (${table.projectId} IS NOT NULL AND ${table.role} IN ('owner', 'developer', 'client', 'viewer'))`),
]);
export const collaborationEvent = pgTable('collaboration_event', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  projectId: text('project_id').references(() => project.id, { onDelete: 'cascade' }),
  actorId: text('actor_id').notNull().references(() => user.id), eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('collaboration_event_scope_idx').on(table.workspaceId, table.createdAt)]);

// Task foundations arrive in T11. T06 session rows contain only explicitly
// published excerpts; private runtime history and credentials stay local.
export const milestone = pgTable('milestone', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  title: text('title').notNull(), createdBy: text('created_by').notNull().references(() => user.id),
  visibility: text('visibility', { enum: ['team', 'client'] }).notNull().default('team'),
  description: text('description').notNull().default(''), version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  dueAt: timestamp('due_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('milestone_project_idx').on(table.projectId), check('milestone_visibility_check', sql`${table.visibility} IN ('team', 'client')`)]);
export const task = pgTable('task', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  milestoneId: text('milestone_id').references(() => milestone.id), title: text('title').notNull(),
  description: text('description').notNull().default(''), sourceSessionId: text('source_session_id').references(() => aiSession.id, {onDelete:'set null'}),
  createdBy: text('created_by').notNull().references(() => user.id), assigneeId: text('assignee_id').references(() => user.id),
  status: text('status', { enum: ['todo', 'in_progress', 'review', 'done'] }).notNull().default('todo'),
  visibility: text('visibility', { enum: ['team', 'client'] }).notNull().default('team'), version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('task_project_idx').on(table.projectId), check('task_status_check', sql`${table.status} IN ('todo', 'in_progress', 'review', 'done')`), check('task_visibility_check', sql`${table.visibility} IN ('team', 'client')`)]);
export const aiSession = pgTable('ai_session', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').notNull().references(() => user.id), driverUserId: text('driver_user_id').notNull().references(() => user.id),
  deviceId: text('device_id').notNull(), title: text('title').notNull(),
  status: text('status', { enum: ['created', 'running', 'completed', 'interrupted', 'failed'] }).notNull().default('created'),
  visibility: text('visibility', { enum: ['team', 'client'] }).notNull().default('team'),
  version: integer('version').notNull().default(1),
  messages: jsonb('messages').$type<{ id: string; role: 'user' | 'assistant'; text: string }[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('ai_session_project_idx').on(table.projectId), check('ai_session_visibility_check', sql`${table.visibility} IN ('team', 'client')`), check('ai_session_status_check', sql`${table.status} IN ('created', 'running', 'completed', 'interrupted', 'failed')`), check('ai_session_version_check', sql`${table.version} > 0`), check('ai_session_messages_check', sql`jsonb_typeof(${table.messages}) = 'array' AND jsonb_array_length(${table.messages}) <= 20`)]);

export const collaborationSchema = { workspace, workspaceMember, project, projectMember, repository, invitation, collaborationEvent, milestone, task, aiSession };
export const projectRealtimeCursor = pgTable('project_realtime_cursor', {
  projectId: text('project_id').primaryKey().references(() => project.id, { onDelete: 'cascade' }), sequence: bigint('sequence', { mode: 'bigint' }).notNull().default(0n),
}, table => [check('project_realtime_cursor_sequence_check', sql`${table.sequence} >= 0`)]);
export const liveShare = pgTable('live_share', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }), authorId: text('author_id').notNull().references(() => user.id), deviceId: text('device_id').notNull(),
  title: text('title').notNull(), visibility: text('visibility').notNull(), status: text('status').notNull().default('active'), messages: jsonb('messages').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('live_share_project_idx').on(table.projectId, table.updatedAt), check('live_share_title_check', sql`char_length(${table.title}) BETWEEN 1 AND 140`), check('live_share_visibility_check', sql`${table.visibility} IN ('team', 'client')`), check('live_share_status_check', sql`${table.status} IN ('active', 'stopped')`), check('live_share_messages_check', sql`jsonb_typeof(${table.messages}) = 'array' AND jsonb_array_length(${table.messages}) BETWEEN 1 AND 20`)]);
export const realtimeEvent = pgTable('realtime_event', {
  projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }), sequence: bigint('sequence', { mode: 'bigint' }).notNull(), eventId: text('event_id').notNull().unique(), kind: text('kind').notNull(), entityId: text('entity_id').notNull(), actorId: text('actor_id').notNull().references(() => user.id), occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.projectId, table.sequence] }), check('realtime_event_sequence_check', sql`${table.sequence} > 0`), check('realtime_event_kind_check', sql`${table.kind} IN ('session.changed', 'live.changed', 'work.changed', 'repository.changed', 'deployment.changed')`)]);
export const realtimeUpload = pgTable('realtime_upload', {
  projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }), batchId: text('batch_id').notNull(), authorId: text('author_id').notNull().references(() => user.id), shareId: text('share_id').notNull().references(() => liveShare.id, { onDelete: 'cascade' }), payloadHash: text('payload_hash').notNull(), sequence: bigint('sequence', { mode: 'bigint' }).notNull(), committedAt: timestamp('committed_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.projectId, table.batchId] }), check('realtime_upload_sequence_check', sql`${table.sequence} > 0`)]);
export const realtimeSchema = { projectRealtimeCursor, liveShare, realtimeEvent, realtimeUpload };
export const overviewReadCursor = pgTable('overview_read_cursor', {
  projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  sequence: bigint('sequence', { mode: 'bigint' }).notNull().default(0n),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.projectId, table.userId] }), check('overview_read_cursor_sequence_check', sql`${table.sequence} >= 0`)]);
export const overviewSchema = { overviewReadCursor };


const workTimestamps = () => ({createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow()});
const workIdentity = () => ({id:text('id').primaryKey(),projectId:text('project_id').notNull().references(()=>project.id,{onDelete:'cascade'}),createdBy:text('created_by').notNull().references(()=>user.id)});
const workContentColumns = () => ({...workIdentity(),title:text('title').notNull(),body:text('body').notNull(),visibility:text('visibility').notNull(),version:integer('version').notNull().default(1),sourceSessionId:text('source_session_id').references(()=>aiSession.id,{onDelete:'set null'}),taskId:text('task_id').references(()=>task.id,{onDelete:'set null'}),documentId:text('document_id'),...workTimestamps()});
export const projectDocument=pgTable('project_document',workContentColumns());
export const projectUpdate=pgTable('project_update',workContentColumns());
export const deliverable=pgTable('deliverable',{...workIdentity(),title:text('title').notNull(),visibility:text('visibility').notNull(),version:integer('version').notNull(),status:text('status').notNull().default('pending'),...workTimestamps()});
export const deliverableVersion=pgTable('deliverable_version',{deliverableId:text('deliverable_id').notNull().references(()=>deliverable.id,{onDelete:'cascade'}),version:integer('version').notNull(),title:text('title').notNull(),body:text('body').notNull(),visibility:text('visibility').notNull(),createdBy:text('created_by').notNull().references(()=>user.id),sourceSessionId:text('source_session_id').references(()=>aiSession.id,{onDelete:'set null'}),taskId:text('task_id').references(()=>task.id,{onDelete:'set null'}),documentId:text('document_id').references(()=>projectDocument.id,{onDelete:'set null'}),attachmentIds:jsonb('attachment_ids').notNull().default([]),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),decision:text('decision'),decidedBy:text('decided_by').references(()=>user.id),decisionBody:text('decision_body').notNull().default(''),decidedAt:timestamp('decided_at',{withTimezone:true})},table=>[primaryKey({columns:[table.deliverableId,table.version]})]);
export const clientFeedback=pgTable('client_feedback',{...workIdentity(),targetKind:text('target_kind').notNull(),targetId:text('target_id'),body:text('body').notNull(),sentiment:text('sentiment'),...workTimestamps()});
export const workComment=pgTable('work_comment',{...workIdentity(),targetKind:text('target_kind').notNull(),targetId:text('target_id').notNull(),body:text('body').notNull(),...workTimestamps()});
export const workAttachment=pgTable('work_attachment',{...workIdentity(),name:text('name').notNull(),mime:text('mime').notNull(),size:integer('size').notNull(),sha256:text('sha256').notNull(),base64:text('base64').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()});
export const workReceipt=pgTable('work_receipt',{projectId:text('project_id').notNull().references(()=>project.id,{onDelete:'cascade'}),actorId:text('actor_id').notNull().references(()=>user.id,{onDelete:'cascade'}),requestId:text('request_id').notNull(),payloadHash:text('payload_hash').notNull(),response:jsonb('response').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()},table=>[primaryKey({columns:[table.projectId,table.actorId,table.requestId]})]);
export const workChange=pgTable('work_change',{id:text('id').primaryKey(),projectId:text('project_id').notNull().references(()=>project.id,{onDelete:'cascade'}),targetKind:text('target_kind').notNull(),targetId:text('target_id').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()});
export const workSchema={projectDocument,projectUpdate,deliverable,deliverableVersion,clientFeedback,workComment,workAttachment,workReceipt,workChange};
export const repositoryConnection = pgTable('repository_connection', {
  repositoryId: text('repository_id').notNull().references(() => repository.id,{onDelete:'cascade'}), userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),
  tokenCipher:text('token_cipher').notNull(),login:text('login').notNull(),...workTimestamps(),
}, t=>[primaryKey({columns:[t.repositoryId,t.userId]})]);
export const repositorySync=pgTable('repository_sync',{repositoryId:text('repository_id').primaryKey().references(()=>repository.id,{onDelete:'cascade'}),remoteUrl:text('remote_url').notNull(),snapshot:jsonb('snapshot').notNull(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow()});
export const repositoryWebhook=pgTable('repository_webhook',{repositoryId:text('repository_id').primaryKey().references(()=>repository.id,{onDelete:'cascade'}),secretCipher:text('secret_cipher').notNull(),configuredBy:text('configured_by').notNull().references(()=>user.id),...workTimestamps()});
export const repositoryDelivery=pgTable('repository_delivery',{repositoryId:text('repository_id').notNull().references(()=>repository.id,{onDelete:'cascade'}),deliveryId:text('delivery_id').notNull(),payloadHash:text('payload_hash').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()},t=>[primaryKey({columns:[t.repositoryId,t.deliveryId]})]);
export const repositoryReceipt=pgTable('repository_receipt',{repositoryId:text('repository_id').notNull().references(()=>repository.id,{onDelete:'cascade'}),actorId:text('actor_id').notNull().references(()=>user.id,{onDelete:'cascade'}),requestId:text('request_id').notNull(),payloadHash:text('payload_hash').notNull(),response:jsonb('response'),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()},t=>[primaryKey({columns:[t.repositoryId,t.actorId,t.requestId]})]);
export const repositoryActivity=pgTable('repository_activity',{id:text('id').primaryKey(),projectId:text('project_id').notNull().references(()=>project.id,{onDelete:'cascade'}),repositoryId:text('repository_id').notNull().references(()=>repository.id,{onDelete:'cascade'}),actorId:text('actor_id').references(()=>user.id,{onDelete:'set null'}),kind:text('kind').notNull(),title:text('title').notNull(),url:text('url').notNull(),sha:text('sha'),pullNumber:integer('pull_number'),externalKey:text('external_key').notNull(),occurredAt:timestamp('occurred_at',{withTimezone:true}).notNull().defaultNow()},t=>[uniqueIndex('repository_activity_external_idx').on(t.repositoryId,t.externalKey),index('repository_activity_project_idx').on(t.projectId,t.occurredAt)]);
export const repositoriesSchema={repositoryConnection,repositorySync,repositoryWebhook,repositoryDelivery,repositoryReceipt,repositoryActivity};
export const deploymentEnvironment=pgTable('deployment_environment',{...workIdentity(),name:text('name').notNull(),kind:text('kind').notNull(),visibility:text('visibility').notNull(),previewUrl:text('preview_url'),requiredChecks:jsonb('required_checks').notNull().default([]),version:integer('version').notNull().default(1),...workTimestamps()});
export const projectDeployment=pgTable('project_deployment',{...workIdentity(),environmentId:text('environment_id').notNull().references(()=>deploymentEnvironment.id,{onDelete:'cascade'}),title:text('title').notNull(),status:text('status').notNull(),commitSha:text('commit_sha'),branch:text('branch'),buildUrl:text('build_url'),previewUrl:text('preview_url'),notes:text('notes').notNull().default(''),thumbnail:text('thumbnail'),version:integer('version').notNull().default(1),observedAt:timestamp('observed_at',{withTimezone:true}).notNull(),...workTimestamps()},t=>[index('project_deployment_project_idx').on(t.projectId,t.observedAt,t.id)]);
export const healthObservation=pgTable('health_observation',{...workIdentity(),environmentId:text('environment_id').notNull().references(()=>deploymentEnvironment.id,{onDelete:'cascade'}),checkName:text('check_name').notNull(),status:text('status').notNull(),value:doublePrecision('value'),unit:text('unit'),summary:text('summary').notNull().default(''),sourceUrl:text('source_url'),version:integer('version').notNull().default(1),observedAt:timestamp('observed_at',{withTimezone:true}).notNull(),expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),...workTimestamps()},t=>[uniqueIndex('health_observation_check_idx').on(t.environmentId,t.checkName)]);
export const deploymentReceipt=pgTable('deployment_receipt',{projectId:text('project_id').notNull().references(()=>project.id,{onDelete:'cascade'}),actorId:text('actor_id').notNull().references(()=>user.id,{onDelete:'cascade'}),requestId:text('request_id').notNull(),payloadHash:text('payload_hash').notNull(),response:jsonb('response').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()},t=>[primaryKey({columns:[t.projectId,t.actorId,t.requestId]})]);
export const deploymentsSchema={deploymentEnvironment,projectDeployment,healthObservation,deploymentReceipt};
export const userPreferences=pgTable('user_preferences',{userId:text('user_id').primaryKey().references(()=>user.id,{onDelete:'cascade'}),version:integer('version').notNull(),preferences:jsonb('preferences').notNull(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow()},t=>[check('user_preferences_version_check',sql`${t.version}>0`),check('user_preferences_object_check',sql`jsonb_typeof(${t.preferences})='object'`)]);
export const databaseSchema={...authSchema,...collaborationSchema,...realtimeSchema,...overviewSchema,...workSchema,...repositoriesSchema,...deploymentsSchema,userPreferences};

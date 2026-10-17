import { z } from 'zod';

const scope = { projectId: z.uuid(), repositoryId: z.uuid() };
export const repositoryScopeSchema = z.object(scope).strict();
const sha = z.string().regex(/^[a-f0-9]{40,64}$/);
export const gitBranchSchema = z.string().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/).refine(value => !value.includes('..') && !value.includes('//') && !value.endsWith('/') && !value.endsWith('.') && !value.endsWith('.lock') && !value.includes('@{'));
export const repositoryErrorSchema = z.object({ ok: z.literal(false), code: z.enum(['auth_required', 'forbidden', 'invalid_request', 'unavailable', 'conflict', 'not_found', 'not_connected', 'rate_limited', 'uncertain']), message: z.string().max(1000) }).strict();
export const gitCommitSchema = z.object({ sha, title: z.string().max(500), author: z.string().max(200), authoredAt: z.iso.datetime(), url: z.url().nullable() }).strict();
export const gitChangeSchema = z.object({ id: z.uuid(), path: z.string().max(2000), kind: z.enum(['add', 'update', 'delete', 'rename']), additions: z.number().int().nonnegative(), deletions: z.number().int().nonnegative(), diff: z.string().max(65536), truncated: z.boolean() }).strict();
export const gitSnapshotSchema = z.object({ ...scope, isGit: z.boolean(), branch: z.string().max(200).nullable(), head: sha.nullable(), branches: z.array(z.string().max(200)).max(200), ahead: z.number().int().nonnegative().nullable(), behind: z.number().int().nonnegative().nullable(), dirty: z.boolean(), conflicts: z.array(z.string().max(2000)).max(100), staged: z.boolean(), changes: z.array(gitChangeSchema).max(50), commits: z.array(gitCommitSchema).max(30), truncated: z.boolean(), observedAt: z.iso.datetime(), snapshotId: z.uuid() }).strict();
export const gitRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('snapshot'), ...scope }).strict(),
  z.object({ operation: z.literal('commit'), ...scope, snapshotId: z.uuid(), fileIds: z.array(z.uuid()).min(1).max(50), message: z.string().trim().min(1).max(2000), authorName: z.string().trim().min(1).max(100).refine(value=>![...value].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127||'<>'.includes(character))), authorEmail: z.email().max(254) }).strict(),
  z.object({ operation: z.literal('createBranch'), ...scope, snapshotId: z.uuid(), branch: gitBranchSchema }).strict(),
  z.object({ operation: z.literal('switchBranch'), ...scope, snapshotId: z.uuid(), branch: gitBranchSchema }).strict(),
  z.object({ operation: z.literal('fetch'), ...scope, snapshotId: z.uuid() }).strict(),
  z.object({ operation: z.literal('pull'), ...scope, snapshotId: z.uuid() }).strict(),
  z.object({ operation: z.literal('push'), ...scope, snapshotId: z.uuid() }).strict(),
]);
export const gitResponseSchema = z.union([repositoryErrorSchema, z.object({ ok: z.literal(true), snapshot: gitSnapshotSchema, notice: z.string().max(1000).nullable() }).strict()]);
export const pullRequestSchema = z.object({ number: z.number().int().positive(), title: z.string().max(500), body: z.string().max(20000), state: z.enum(['open', 'closed', 'merged']), draft: z.boolean(), head: z.string().max(200), headSha: sha, base: z.string().max(200), author: z.string().max(200), url: z.url(), updatedAt: z.iso.datetime() }).strict();
export const pullReviewSchema = z.object({ id: z.number().int().positive(), author: z.string().max(200), state: z.string().max(100), body: z.string().max(20000), commitSha: sha.nullable(), submittedAt: z.iso.datetime().nullable(), url: z.url() }).strict();
export const pullFileSchema = z.object({ path: z.string().max(2000), status: z.string().max(100), additions: z.number().int().nonnegative(), deletions: z.number().int().nonnegative(), patch: z.string().max(65536).nullable() }).strict();
export const repositorySnapshotSchema = z.object({ ...scope, remoteUrl: z.url(), connected: z.boolean(), login: z.string().max(200).nullable(), private: z.boolean().nullable(), commits: z.array(gitCommitSchema).max(30), pulls: z.array(pullRequestSchema).max(30), observedAt: z.iso.datetime().nullable(), webhookConfigured: z.boolean(), page: z.number().int().min(1), hasMore: z.boolean() }).strict();
export const repositoriesRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('snapshot'), ...scope, page: z.number().int().min(1).max(100) }).strict(),
  z.object({ operation: z.literal('connect'), ...scope, token: z.string().trim().min(20).max(500).regex(/^[A-Za-z0-9_]+$/) }).strict(),
  z.object({ operation: z.literal('disconnect'), ...scope }).strict(),
  z.object({ operation: z.literal('synchronize'), ...scope, page: z.number().int().min(1).max(100) }).strict(),
  z.object({ operation: z.literal('getPull'), ...scope, number: z.number().int().positive(), page: z.number().int().min(1).max(100) }).strict(),
  z.object({ operation: z.literal('resolveActivity'), ...scope, id: z.uuid() }).strict(),
  z.object({ operation: z.literal('createPull'), ...scope, requestId: z.uuid(), title: z.string().trim().min(1).max(500), body: z.string().max(19000), head: gitBranchSchema, base: gitBranchSchema, draft: z.boolean() }).strict(),
  z.object({ operation: z.literal('review'), ...scope, requestId: z.uuid(), number: z.number().int().positive(), headSha: sha, event: z.enum(['COMMENT', 'APPROVE', 'REQUEST_CHANGES']), body: z.string().trim().min(1).max(19000) }).strict(),
  z.object({ operation: z.literal('configureWebhook'), ...scope, secret: z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/).nullable() }).strict(),
]);
export const repositoriesResponseSchema = z.union([repositoryErrorSchema,
  z.object({ ok: z.literal(true), kind: z.literal('snapshot'), snapshot: repositorySnapshotSchema }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('pull'), pull: pullRequestSchema, reviews: z.array(pullReviewSchema).max(100), files: z.array(pullFileSchema).max(100), page: z.number().int().positive(), hasMore: z.boolean() }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('done'), url: z.url().nullable() }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('activity'), id: z.uuid(), activityKind: z.enum(['commit','pull','review']), url: z.url(), sha: sha.nullable(), pullNumber: z.number().int().positive().nullable() }).strict(),
]);
export type GitRequest = z.infer<typeof gitRequestSchema>;
export type GitResponse = z.infer<typeof gitResponseSchema>;
export type GitSnapshot = z.infer<typeof gitSnapshotSchema>;
export type GitCommit = z.infer<typeof gitCommitSchema>;
export type RepositoriesRequest = z.infer<typeof repositoriesRequestSchema>;
export type RepositoriesResponse = z.infer<typeof repositoriesResponseSchema>;
export type RepositorySnapshot = z.infer<typeof repositorySnapshotSchema>;
export type PullRequest = z.infer<typeof pullRequestSchema>;

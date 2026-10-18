import { z } from 'zod';

const id = z.uuid();
export const codexModelSchema = z.object({
  id: z.string().min(1).max(200), model: z.string().min(1).max(200), name: z.string().max(200),
  description: z.string().max(2000), isDefault: z.boolean(),
  defaultEffort: z.string().max(30), efforts: z.array(z.string().max(30)).max(20),
}).strict();
export const codexMessageSchema = z.object({
  id: z.string().min(1).max(200), role: z.enum(['user', 'assistant']), text: z.string().max(131072),
  status: z.enum(['streaming', 'complete', 'interrupted', 'failed']),
}).strict();
export const codexActivitySchema = z.object({
  id: z.string().min(1).max(200), kind: z.enum(['command', 'fileChange', 'plan', 'tool']),
  title: z.string().max(500), detail: z.string().max(32768),
  status: z.enum(['running', 'completed', 'failed', 'blocked']),
  exitCode: z.number().int().nullable().default(null), durationMs: z.number().nonnegative().nullable().default(null),
  outputTruncated: z.boolean().default(false),
}).strict();
export const codexApprovalSchema = z.object({
  id, threadId: z.string().min(1).max(200), turnId: z.string().min(1).max(200), itemId: z.string().min(1).max(200),
  kind: z.enum(['command', 'fileChange']), command: z.string().max(16000).nullable(), cwd: z.string().max(2000).nullable(),
  reason: z.string().max(4000).nullable(), requestedRoot: z.string().max(2000).nullable(),
  createdAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
}).strict();
export const codexFileChangeSchema = z.object({
  id: z.string().min(1).max(200), path: z.string().max(2000), kind: z.enum(['add', 'update', 'delete']),
  diff: z.string().max(65536), truncated: z.boolean(), status: z.enum(['running', 'completed', 'failed', 'blocked']),
}).strict();
export const codexTestReportSchema = z.object({
  itemId: z.string().min(1).max(200), format: z.enum(['tap', 'jest-json']), total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative().nullable(), observedAt: z.iso.datetime(),
}).strict();
export const codexSessionSchema = z.object({
  projectId: id, repositoryId: id, threadId: z.string().min(1).max(200), turnId: z.string().max(200).nullable(),
  bindingUpdatedAt: z.iso.datetime().optional(),
  folderLabel: z.string().max(500), model: z.string().max(200),
  status: z.enum(['idle', 'running', 'completed', 'interrupted', 'failed']),
  messages: z.array(codexMessageSchema).max(200), activities: z.array(codexActivitySchema).max(100),
  error: z.string().max(1000).nullable(),
  plan: z.array(z.object({ step: z.string().max(1000), status: z.enum(['pending', 'inProgress', 'completed']) }).strict()).max(30).default([]),
  planExplanation: z.string().max(2000).nullable().default(null),
  usage: z.object({ totalTokens: z.number().int().nonnegative(), inputTokens: z.number().int().nonnegative(), cachedInputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), contextWindow: z.number().int().positive().nullable() }).strict().nullable().default(null),
  startedAt: z.iso.datetime().nullable().default(null),
  approvals: z.array(codexApprovalSchema).max(20).default([]),
  diff: z.string().max(262144).default(''), diffTruncated: z.boolean().default(false),
  fileChanges: z.array(codexFileChangeSchema).max(50).default([]),
  testReports: z.array(codexTestReportSchema).max(50).default([]),
}).strict();
export const codexStateSchema = z.object({
  runtime: z.enum(['stopped', 'starting', 'ready', 'missing', 'incompatible', 'error']),
  windowsSandbox: z.enum(['unknown', 'running', 'ready', 'failed', 'not_applicable']).optional(),
  version: z.string().max(100).nullable(), expectedVersion: z.literal('0.159.2'),
  runtimePath: z.string().max(2000).nullable(),
  account: z.object({ type: z.enum(['chatgpt', 'apiKey']), email: z.string().max(254).nullable(), plan: z.string().max(100).nullable() }).strict().nullable(),
  login: z.object({ method: z.enum(['browser', 'device']), userCode: z.string().max(50).nullable(), verificationUrl: z.string().max(500).nullable() }).strict().nullable(),
  models: z.array(codexModelSchema).max(300), session: codexSessionSchema.nullable(),
  policy: z.enum(['readOnly', 'workspaceWrite']), notice: z.string().max(1000).nullable(),
}).strict();
const context = { projectId: id, repositoryId: id };
export const codexRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('getState') }).strict(),
  z.object({ operation: z.literal('connect') }).strict(),
  z.object({ operation: z.literal('disconnect') }).strict(),
  z.object({ operation: z.literal('login'), method: z.enum(['browser', 'device']) }).strict(),
  z.object({ operation: z.literal('cancelLogin') }).strict(),
  z.object({ operation: z.literal('loginApiKey'), apiKey: z.string().min(20).max(512).regex(/^[A-Za-z0-9_-]+$/) }).strict(),
  z.object({ operation: z.literal('logout') }).strict(),
  z.object({ operation: z.literal('refreshModels') }).strict(),
  z.object({ operation: z.literal('setupSandbox') }).strict(),
  z.object({ operation: z.literal('openSession'), ...context, model: z.string().min(1).max(200) }).strict(),
  z.object({ operation: z.literal('newSession'), ...context, model: z.string().min(1).max(200) }).strict(),
  z.object({ operation: z.literal('send'), ...context, model: z.string().min(1).max(200), effort: z.string().max(30).nullable(), text: z.string().trim().min(1).max(32000), attachmentIds: z.array(z.uuid()).max(8).default([]) }).strict(),
  z.object({ operation: z.literal('interrupt'), ...context }).strict(),
  z.object({ operation: z.literal('setPolicy'), ...context, policy: z.enum(['readOnly', 'workspaceWrite']) }).strict(),
  z.object({ operation: z.literal('resolveApproval'), ...context, approvalId: id, decision: z.enum(['acceptOnce', 'decline']) }).strict(),
]);
export const codexResponseSchema = z.union([
  z.object({ ok: z.literal(true), state: codexStateSchema }).strict(),
  z.object({ ok: z.literal(false), code: z.enum(['auth_required', 'forbidden', 'runtime_missing', 'version_mismatch', 'not_connected', 'codex_auth_required', 'invalid_request', 'busy', 'unavailable']), message: z.string().max(1000), state: codexStateSchema }).strict(),
]);
export type CodexState = z.infer<typeof codexStateSchema>;
export type CodexSession = z.infer<typeof codexSessionSchema>;
export type CodexMessage = z.infer<typeof codexMessageSchema>;
export type CodexActivity = z.infer<typeof codexActivitySchema>;
export type CodexModel = z.infer<typeof codexModelSchema>;
export type CodexApproval = z.infer<typeof codexApprovalSchema>;
export type CodexFileChange = z.infer<typeof codexFileChangeSchema>;
export type CodexTestReport = z.infer<typeof codexTestReportSchema>;
export type CodexRequest = z.infer<typeof codexRequestSchema>;
export type CodexResponse = z.infer<typeof codexResponseSchema>;

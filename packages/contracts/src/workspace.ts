import { z } from 'zod';
const scope = { projectId: z.uuid(), repositoryId: z.uuid() };
export const workspaceFileSchema = z.object({
  id: z.uuid(), path: z.string().min(1).max(2000), kind: z.enum(['add', 'update', 'delete', 'rename']),
  oldPath: z.string().max(2000).nullable(), additions: z.number().int().nonnegative(), deletions: z.number().int().nonnegative(),
  diff: z.string().max(65536), truncated: z.boolean(),
}).strict();
export const workspaceSnapshotSchema = z.object({
  ...scope, isGit: z.boolean(), files: z.array(workspaceFileSchema).max(50), truncated: z.boolean(),
  observedAt: z.iso.datetime(), previewUrl: z.string().max(2000).nullable(),
}).strict();
export const workspaceRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('getChanges'), ...scope }).strict(),
  z.object({ operation: z.literal('openEditor'), ...scope, fileId: z.uuid().nullable() }).strict(),
  z.object({ operation: z.literal('setPreview'), ...scope, url: z.string().max(2000).nullable() }).strict(),
  z.object({ operation: z.literal('openPreview'), ...scope }).strict(),
]);
export const workspaceResponseSchema = z.union([
  z.object({ ok: z.literal(true), snapshot: workspaceSnapshotSchema }).strict(),
  z.object({ ok: z.literal(false), code: z.enum(['auth_required', 'forbidden', 'invalid_request', 'unavailable']), message: z.string().max(1000) }).strict(),
]);
export type WorkspaceRequest = z.infer<typeof workspaceRequestSchema>;
export type WorkspaceResponse = z.infer<typeof workspaceResponseSchema>;
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;
export type WorkspaceFile = z.infer<typeof workspaceFileSchema>;

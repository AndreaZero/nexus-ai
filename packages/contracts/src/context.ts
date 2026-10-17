import { z } from 'zod';
const ids = { projectId: z.uuid(), repositoryId: z.uuid() };
export const contextFileSchema = z.object({ id: z.uuid(), path: z.string().min(1).max(500), bytes: z.number().int().min(0).max(65536), modifiedAt: z.iso.datetime() }).strict();
export const repositoryObservationSchema = z.object({
  isGit: z.boolean(), branch: z.string().max(200).nullable(), head: z.string().max(64).nullable(),
  dirty: z.boolean().nullable(), ahead: z.number().int().nonnegative().nullable(), behind: z.number().int().nonnegative().nullable(), observedAt: z.iso.datetime(),
}).strict();
export const contextSnapshotSchema = z.object({ ...ids, folderLabel: z.string().max(500), files: z.array(contextFileSchema).max(8), repository: repositoryObservationSchema,
  draft: z.string().max(32000), updatedAt: z.iso.datetime() }).strict();
export const contextRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('get'), ...ids }).strict(),
  z.object({ operation: z.literal('pickFiles'), ...ids }).strict(),
  z.object({ operation: z.literal('removeFile'), ...ids, fileId: z.uuid() }).strict(),
  z.object({ operation: z.literal('readFile'), ...ids, fileId: z.uuid() }).strict(),
  z.object({ operation: z.literal('saveDraft'), ...ids, text: z.string().max(32000) }).strict(),
]);
export const contextResponseSchema = z.union([
  z.object({ ok: z.literal(true), context: contextSnapshotSchema, preview: z.object({ fileId: z.uuid(), text: z.string().max(65536) }).strict().nullable() }).strict(),
  z.object({ ok: z.literal(false), code: z.enum(['auth_required', 'forbidden', 'invalid_request', 'unavailable']), message: z.string().max(1000) }).strict(),
]);
export type ContextRequest = z.infer<typeof contextRequestSchema>;
export type ContextResponse = z.infer<typeof contextResponseSchema>;
export type ContextSnapshot = z.infer<typeof contextSnapshotSchema>;
export type ContextFile = z.infer<typeof contextFileSchema>;

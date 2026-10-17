import { z } from 'zod';
import { pulseProgressSchema } from './pulse.js';
const id = z.uuid();
const visibility = z.enum(['team', 'client']);
const version = z.number().int().positive();
const author = z.object({ id: z.string().min(1).max(128), name: z.string().max(200) }).strict();
export const workKindSchema = z.enum(['task', 'milestone', 'document', 'update', 'deliverable', 'feedback', 'comment']);
export const workTargetKindSchema = z.enum(['task', 'milestone', 'document', 'update', 'deliverable', 'feedback', 'project']);
export const workAttachmentSchema = z.object({ id, name: z.string().min(1).max(120), mime: z.string().max(100), size: z.number().int().min(1).max(1048576), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const decision = z.object({ by: author, decision: z.enum(['approved', 'changes_requested']), body: z.string().max(4000), at: z.iso.datetime() }).strict();
export const workItemSchema = z.object({
  id, projectId: id, kind: workKindSchema, title: z.string().max(300), body: z.string().max(65536), visibility, version,
  author, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  status: z.enum(['todo', 'in_progress', 'review', 'done', 'pending', 'approved', 'changes_requested']).nullable(),
  assignee: author.nullable(), milestoneId: id.nullable(), dueAt: z.iso.datetime().nullable(),
  sourceSessionId: id.nullable(), taskId: id.nullable(), documentId: id.nullable(),
  targetKind: workTargetKindSchema.nullable(), targetId: id.nullable(), sentiment: z.enum(['positive', 'neutral', 'negative']).nullable(),
  attachments: z.array(workAttachmentSchema).max(5), progress: pulseProgressSchema.nullable(), decision: decision.nullable(),
  revisions: z.array(z.object({ version, author, createdAt: z.iso.datetime(), decision: decision.nullable() }).strict()).max(50),
}).strict();
const base = { projectId: id, view: z.enum(['auto', 'client']).default('auto') };
const mutation = { projectId: id, requestId: id };
const editable = { id: id.nullable(), expectedVersion: z.number().int().nonnegative(), title: z.string().trim().min(1).max(300), body: z.string().max(65536), visibility };
const provenance = { sourceSessionId: id.nullable(), taskId: id.nullable(), documentId: id.nullable() };
export const workRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('list'), ...base, kind: workKindSchema, offset: z.number().int().min(0).max(1000000).default(0), limit: z.number().int().min(1).max(100).default(30), targetKind: workTargetKindSchema.nullable().default(null), targetId: id.nullable().default(null) }).strict(),
  z.object({ operation: z.literal('read'), ...base, kind: workKindSchema, id, revision: version.nullable().default(null) }).strict(),
  z.object({ operation: z.literal('saveTask'), ...mutation, ...editable, status: z.enum(['todo', 'in_progress', 'review', 'done']), assigneeId: z.string().min(1).max(128).nullable(), milestoneId: id.nullable(), sourceSessionId: id.nullable() }).strict(),
  z.object({ operation: z.literal('saveMilestone'), ...mutation, ...editable, dueAt: z.iso.datetime().nullable() }).strict(),
  z.object({ operation: z.literal('saveDocument'), ...mutation, ...editable, ...provenance }).strict(),
  z.object({ operation: z.literal('delete'), ...mutation, kind: z.enum(['task', 'milestone', 'document']), id, expectedVersion: version }).strict(),
  z.object({ operation: z.literal('publishUpdate'), ...mutation, title: editable.title, body: editable.body, visibility, ...provenance }).strict(),
  z.object({ operation: z.literal('publishDeliverable'), ...mutation, ...editable, ...provenance, attachmentIds: z.array(id).max(5).refine(items => new Set(items).size === items.length) }).strict(),
  z.object({ operation: z.literal('decideDeliverable'), ...mutation, id, expectedVersion: version, decision: z.enum(['approved', 'changes_requested']), body: z.string().max(4000) }).strict(),
  z.object({ operation: z.literal('addFeedback'), ...mutation, targetKind: z.enum(['project', 'document', 'update', 'deliverable']), targetId: id.nullable(), body: z.string().trim().min(1).max(4000), sentiment: z.enum(['positive', 'neutral', 'negative']).nullable() }).strict(),
  z.object({ operation: z.literal('addComment'), ...mutation, targetKind: workTargetKindSchema.exclude(['project']), targetId: id, body: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ operation: z.literal('uploadAttachment'), ...mutation, name: z.string().min(1).max(120), mime: z.string().max(100), base64: z.string().min(4).max(1398104).regex(/^[A-Za-z0-9+/]*={0,2}$/) }).strict(),
  z.object({ operation: z.literal('readAttachment'), ...base, id }).strict(),
  z.object({ operation: z.literal('deleteAttachment'), ...mutation, id }).strict(),
  z.object({ operation: z.literal('listAttachments'), ...base }).strict(),
]);
export const workResponseSchema = z.union([
  z.object({ ok: z.literal(true), kind: z.literal('attachmentDeleted'), projectId: id, id }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('uploads'), projectId: id, items: z.array(workAttachmentSchema).max(100) }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('saved'), projectId: id, saved: z.boolean() }).strict(),
  z.object({ ok: z.literal(false), code: z.enum(['auth_required', 'forbidden', 'not_found', 'conflict', 'invalid_request', 'unavailable', 'quota_exceeded']), message: z.string().max(1000) }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('list'), projectId: id, entityKind: workKindSchema, items: z.array(workItemSchema).max(100), total: z.number().int().nonnegative(), nextOffset: z.number().int().nonnegative().nullable() }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('item'), projectId: id, item: workItemSchema }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('changed'), projectId: id, entityKind: workKindSchema, id, version }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('attachment'), projectId: id, attachment: workAttachmentSchema, base64: z.string().max(1398104) }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('uploaded'), projectId: id, attachment: workAttachmentSchema }).strict(),
]);
export type WorkKind = z.infer<typeof workKindSchema>;
export type WorkItem = z.infer<typeof workItemSchema>;
export type WorkRequest = z.infer<typeof workRequestSchema>;
export type WorkResponse = z.infer<typeof workResponseSchema>;
export type WorkAttachment = z.infer<typeof workAttachmentSchema>;
export const workDownloadRequestSchema = z.object({ projectId: id, id, view: z.enum(['auto', 'client']).default('auto') }).strict();
export type WorkDownloadRequest = z.infer<typeof workDownloadRequestSchema>;

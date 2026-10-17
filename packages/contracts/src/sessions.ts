import { z } from 'zod';
const project = { projectId: z.uuid() };
const status = z.enum(['created', 'running', 'completed', 'interrupted', 'failed']);
const visibility = z.enum(['team', 'client']);
export const sharedMessageSchema = z.object({ id: z.string().min(1).max(200), role: z.enum(['user', 'assistant']), text: z.string().min(1).max(32768) }).strict();
export const sharedSessionSchema = z.object({
  id: z.uuid(), ...project, title: z.string().min(1).max(140), status, visibility,
  author: z.object({ id: z.string().min(1).max(128), name: z.string().max(200) }).strict(),
  version: z.number().int().positive(), messageCount: z.number().int().min(0).max(20), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).strict();
export const projectTaskSchema = z.object({ id: z.uuid(), title: z.string().max(300), status: z.enum(['todo', 'in_progress', 'review', 'done']), visibility }).strict();
export const sessionsRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('list'), ...project }).strict(),
  z.object({ operation: z.literal('read'), ...project, sessionId: z.uuid() }).strict(),
  z.object({ operation: z.literal('listProjectTasks'), ...project }).strict(),
  z.object({ operation: z.literal('publish'), ...project, sessionId: z.uuid(), expectedVersion: z.number().int().nonnegative(), deviceId: z.uuid(),
    title: z.string().trim().min(1).max(140), status, visibility,
    messages: z.array(sharedMessageSchema).min(1).max(20).refine(items => items.reduce((sum, item) => sum + item.text.length, 0) <= 131072, 'Select a smaller excerpt.').refine(items => new Set(items.map(item => item.id)).size === items.length, 'Select each message once.'),
  }).strict(),
]);
export const sessionsResponseSchema = z.union([
  z.object({ ok: z.literal(false), code: z.enum(['auth_required', 'forbidden', 'not_found', 'conflict', 'invalid_request', 'unavailable']), message: z.string().max(1000) }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('sessions'), items: z.array(sharedSessionSchema).max(100) }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('session'), item: sharedSessionSchema, messages: z.array(sharedMessageSchema).max(20) }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('tasks'), items: z.array(projectTaskSchema).max(100) }).strict(),
]);
export type SessionsRequest = z.infer<typeof sessionsRequestSchema>;
export type SessionsResponse = z.infer<typeof sessionsResponseSchema>;
export type SharedSession = z.infer<typeof sharedSessionSchema>;
export type SharedMessage = z.infer<typeof sharedMessageSchema>;
export type ProjectTask = z.infer<typeof projectTaskSchema>;

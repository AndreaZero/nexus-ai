import { z } from 'zod';
import { sharedSessionSchema } from './sessions.js';
const id = z.uuid();
export const realtimeCursorSchema = z.string().regex(/^(?:0|[1-9]\d{0,18})$/);
export const liveMessageSchema = z.object({ id: z.string().min(1).max(200), role: z.enum(['user', 'assistant']), text: z.string().max(131072), status: z.enum(['streaming', 'complete', 'interrupted', 'failed']) }).strict();
const messages = z.array(liveMessageSchema).min(1).max(20).refine(items => new Set(items.map(item => item.id)).size === items.length && items.reduce((sum, item) => sum + item.text.length, 0) <= 131072);
export const liveShareSummarySchema = z.object({ id, projectId: id, title: z.string().min(1).max(140), visibility: z.enum(['team', 'client']), author: z.object({ id: z.string().min(1).max(128), name: z.string().max(200) }).strict(), status: z.enum(['active', 'stopped']), updatedAt: z.iso.datetime() }).strict();
export const liveShareSchema = liveShareSummarySchema.extend({ messages });
export const realtimeChangeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), shareId: id, deviceId: id, title: z.string().trim().min(1).max(140), visibility: z.enum(['team', 'client']), messages }).strict(),
  z.object({ type: z.literal('append'), shareId: id, deviceId: id, updates: z.array(z.object({ messageId: z.string().min(1).max(200), offset: z.number().int().nonnegative().max(131072), text: z.string().max(16384), status: z.enum(['streaming', 'complete', 'interrupted', 'failed']) }).strict()).min(1).max(20).refine(items => new Set(items.map(item => item.messageId)).size === items.length && items.reduce((sum, item) => sum + item.text.length, 0) <= 16384) }).strict(),
  z.object({ type: z.literal('stop'), shareId: id, deviceId: id }).strict(),
]);
export const realtimeApiRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('snapshot'), projectId: id }).strict(),
  z.object({ operation: z.literal('readShare'), projectId: id, shareId: id }).strict(),
  z.object({ operation: z.literal('upload'), projectId: id, batchId: id, change: realtimeChangeSchema }).strict(),
]);
export const realtimeSnapshotSchema = z.object({ projectId: id, cursor: realtimeCursorSchema, sessions: z.array(sharedSessionSchema).max(100), shares: z.array(liveShareSummarySchema).max(100) }).strict();
export const realtimeApiResponseSchema = z.union([
  z.object({ ok: z.literal(true), kind: z.literal('snapshot'), snapshot: realtimeSnapshotSchema }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('share'), share: liveShareSchema }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('ack'), batchId: id, shareId: id, cursor: realtimeCursorSchema }).strict(),
  z.object({ ok: z.literal(false), code: z.enum(['auth_required', 'forbidden', 'not_found', 'conflict', 'invalid_request', 'unavailable']), message: z.string().max(1000) }).strict(),
]);
export const realtimePresenceSchema = z.object({ userId: z.string().min(1).max(128), name: z.string().max(200), role: z.enum(['owner', 'developer', 'client', 'viewer']), connections: z.number().int().min(1).max(20), lastSeenAt: z.iso.datetime() }).strict();
export const realtimeEventSchema = z.object({ eventId: id, projectId: id, sequence: realtimeCursorSchema, type: z.enum(['session.changed', 'live.changed']), entityId: id, occurredAt: z.iso.datetime() }).strict();
export const realtimeClientFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), projectId: id, cursor: realtimeCursorSchema.nullable(), deviceId: id }).strict(),
  z.object({ type: z.literal('heartbeat') }).strict(),
  z.object({ type: z.literal('ack'), cursor: realtimeCursorSchema }).strict(),
]);
export const realtimeServerFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot'), snapshot: realtimeSnapshotSchema, resync: z.boolean() }).strict(),
  z.object({ type: z.literal('events'), projectId: id, cursor: realtimeCursorSchema, events: z.array(realtimeEventSchema).max(100) }).strict(),
  z.object({ type: z.literal('presence'), projectId: id, members: z.array(realtimePresenceSchema).max(100) }).strict(),
  z.object({ type: z.literal('heartbeat'), serverTime: z.iso.datetime() }).strict(),
  z.object({ type: z.literal('denied'), code: z.enum(['auth_required', 'forbidden', 'invalid_request', 'unavailable']), message: z.string().max(1000) }).strict(),
]);
export const realtimeStateSchema = z.object({
  projectId: id.nullable(), connection: z.enum(['idle', 'connecting', 'online', 'reconnecting', 'offline', 'denied']),
  cursor: realtimeCursorSchema.nullable(), snapshot: realtimeSnapshotSchema.nullable(), presence: z.array(realtimePresenceSchema).max(100),
  pending: z.number().int().nonnegative().max(100), sharing: z.object({ shareId: id, repositoryId: id, messageIds: z.array(z.string().max(200)).max(20), visibility: z.enum(['team', 'client']), title: z.string().max(140) }).strict().nullable(),
  lastSyncedAt: z.iso.datetime().nullable(), notice: z.string().max(1000).nullable(),
}).strict();
export const realtimeRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('getState') }).strict(),
  z.object({ operation: z.literal('connect'), projectId: id }).strict(),
  z.object({ operation: z.literal('disconnect') }).strict(),
  z.object({ operation: z.literal('retry') }).strict(),
  z.object({ operation: z.literal('discardPending') }).strict(),
  z.object({ operation: z.literal('readShare'), projectId: id, shareId: id }).strict(),
  z.object({ operation: z.literal('startSharing'), projectId: id, repositoryId: id, title: z.string().trim().min(1).max(140), visibility: z.enum(['team', 'client']), messages }).strict(),
  z.object({ operation: z.literal('stopSharing') }).strict(),
]);
export const realtimeResponseSchema = z.union([
  z.object({ ok: z.literal(true), state: realtimeStateSchema, share: liveShareSchema.nullable().default(null) }).strict(),
  z.object({ ok: z.literal(false), code: z.enum(['auth_required', 'forbidden', 'invalid_request', 'conflict', 'unavailable']), message: z.string().max(1000), state: realtimeStateSchema }).strict(),
]);
export type RealtimeRequest = z.infer<typeof realtimeRequestSchema>;
export type RealtimeResponse = z.infer<typeof realtimeResponseSchema>;
export type RealtimeState = z.infer<typeof realtimeStateSchema>;
export type RealtimeApiRequest = z.infer<typeof realtimeApiRequestSchema>;
export type RealtimeApiResponse = z.infer<typeof realtimeApiResponseSchema>;
export type RealtimeChange = z.infer<typeof realtimeChangeSchema>;
export type RealtimeSnapshot = z.infer<typeof realtimeSnapshotSchema>;
export type RealtimeClientFrame = z.infer<typeof realtimeClientFrameSchema>;
export type RealtimeServerFrame = z.infer<typeof realtimeServerFrameSchema>;
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export type RealtimePresence = z.infer<typeof realtimePresenceSchema>;
export type LiveShare = z.infer<typeof liveShareSchema>;
export type LiveMessage = z.infer<typeof liveMessageSchema>;

import { z } from 'zod';
import { projectTaskSchema } from './sessions.js';
import { liveShareSummarySchema } from './realtime.js';

const cursor = z.string().regex(/^(?:0|[1-9]\d{0,18})$/);
const project = { projectId: z.uuid() };
export const overviewFilterSchema = z.enum(['all', 'sessions', 'commits', 'files', 'comments', 'deployments']);
export const overviewActivitySchema = z.object({
  id: z.uuid(), sequence: cursor, category: z.literal('sessions'),
  kind: z.enum(['excerpt.published', 'live.updated', 'live.stopped']),
  target: z.object({ kind: z.enum(['shared_session', 'live_share']), id: z.uuid() }).strict(),
  actor: z.object({ id: z.string().min(1).max(128), name: z.string().max(200) }).strict(),
  title: z.string().max(140), visibility: z.enum(['team', 'client']), occurredAt: z.iso.datetime(),
}).strict();
export const overviewSnapshotSchema = z.object({
  ...project, cursor, observedAt: z.iso.datetime(),
  activity: z.array(overviewActivitySchema).max(50), nextBefore: cursor.nullable(),
  authorizedTargets: z.array(overviewActivitySchema.shape.target).max(1000),
  notifications: z.array(overviewActivitySchema).max(30), unreadCount: z.number().int().min(0).max(1000), readThrough: cursor,
  tasks: z.array(projectTaskSchema).max(100), activeShares: z.array(liveShareSummarySchema).max(100),
  memberCount: z.number().int().nonnegative(),
}).strict();
export const overviewRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('snapshot'), ...project, filter: overviewFilterSchema.default('all'), before: cursor.nullable().default(null), limit: z.number().int().min(1).max(50).default(30) }).strict(),
  z.object({ operation: z.literal('markRead'), ...project, through: cursor }).strict(),
]);
export const overviewResponseSchema = z.union([
  z.object({ ok: z.literal(true), kind: z.literal('overview'), snapshot: overviewSnapshotSchema }).strict(),
  z.object({ ok: z.literal(true), kind: z.literal('read'), ...project, readThrough: cursor, unreadCount: z.number().int().min(0).max(1000) }).strict(),
  z.object({ ok: z.literal(false), code: z.enum(['auth_required', 'forbidden', 'invalid_request', 'unavailable']), message: z.string().max(1000) }).strict(),
]);

export const telemetrySampleSchema = z.object({ at: z.iso.datetime(), cpuPercent: z.number().min(0).max(100).nullable(), memoryPercent: z.number().min(0).max(100), memoryUsedBytes: z.number().nonnegative(), memoryTotalBytes: z.number().positive() }).strict();
export const telemetryStateSchema = z.object({
  ...project, enabled: z.boolean(), available: z.boolean(), source: z.literal('local_device'),
  intervalMs: z.literal(2000), samples: z.array(telemetrySampleSchema).max(60), networkBytesPerSecond: z.null(), notice: z.string().max(1000).nullable(),
}).strict();
export const telemetryRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('getState'), ...project, repositoryId: z.uuid() }).strict(),
  z.object({ operation: z.literal('setEnabled'), ...project, repositoryId: z.uuid(), enabled: z.boolean() }).strict(),
]);
export const telemetryResponseSchema = z.union([
  z.object({ ok: z.literal(true), state: telemetryStateSchema }).strict(),
  z.object({ ok: z.literal(false), code: z.enum(['auth_required', 'forbidden', 'invalid_request', 'unavailable']), message: z.string().max(1000) }).strict(),
]);
export type OverviewRequest = z.infer<typeof overviewRequestSchema>;
export type OverviewResponse = z.infer<typeof overviewResponseSchema>;
export type OverviewSnapshot = z.infer<typeof overviewSnapshotSchema>;
export type OverviewActivity = z.infer<typeof overviewActivitySchema>;
export type OverviewFilter = z.infer<typeof overviewFilterSchema>;
export type TelemetryRequest = z.infer<typeof telemetryRequestSchema>;
export type TelemetryResponse = z.infer<typeof telemetryResponseSchema>;
export type TelemetryState = z.infer<typeof telemetryStateSchema>;

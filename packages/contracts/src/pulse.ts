import { z } from 'zod';
import { overviewFilterSchema, overviewSnapshotSchema } from './overview.js';
import { sharedSessionSchema } from './sessions.js';

const count = z.number().int().nonnegative();
export const pulseProgressSchema = z.object({
  total: count, completed: count, inProgress: count, planned: count,
  percent: z.number().min(0).max(100).nullable(), source: z.literal('visible_tasks'),
}).strict().refine(value => value.total === value.completed + value.inProgress + value.planned, 'Invalid task scope.');
export const pulseMilestoneSchema = z.object({
  id: z.uuid(), title: z.string().max(300), visibility: z.enum(['team', 'client']), dueAt: z.iso.datetime().nullable(),
  state: z.enum(['completed', 'in_progress', 'planned']), progress: pulseProgressSchema,
}).strict();
export const pulseRequestSchema = z.object({
  operation: z.literal('snapshot'), projectId: z.uuid(), view: z.enum(['auto', 'client']).default('auto'),
  scope: z.enum(['project', 'mine']).default('project'), filter: overviewFilterSchema.default('all'),
  before: z.string().regex(/^(?:0|[1-9]\d{0,18})$/).nullable().default(null), limit: z.number().int().min(1).max(50).default(30),
}).strict();
export const pulseSnapshotSchema = z.object({
  projectId: z.uuid(), audience: z.enum(['team', 'client']), overview: overviewSnapshotSchema,
  milestones: z.array(pulseMilestoneSchema).max(100), milestoneCount: count, progress: pulseProgressSchema,
  summary: z.object({
    dayStart: z.iso.datetime(), dayEnd: z.iso.datetime(), scope: z.enum(['project', 'mine']),
    tasksUpdated: count, sharedUpdates: count, sharedSource: z.literal('retained_entities'),
    commits: z.number().int().nonnegative().nullable(), comments: count.nullable(), buildsDeploys: z.null(),
  }).strict(),
  outcomes: z.array(sharedSessionSchema).max(20),
}).strict();
export const pulseResponseSchema = z.union([
  z.object({ ok: z.literal(true), snapshot: pulseSnapshotSchema }).strict(),
  z.object({ ok: z.literal(false), code: z.enum(['auth_required', 'forbidden', 'invalid_request', 'unavailable']), message: z.string().max(1000) }).strict(),
]);
export type PulseRequest = z.infer<typeof pulseRequestSchema>;
export type PulseResponse = z.infer<typeof pulseResponseSchema>;
export type PulseSnapshot = z.infer<typeof pulseSnapshotSchema>;
export type PulseMilestone = z.infer<typeof pulseMilestoneSchema>;
export type PulseProgress = z.infer<typeof pulseProgressSchema>;

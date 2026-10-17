import { createHash } from 'node:crypto';
import { z } from 'zod';
import { liveMessageSchema, realtimeChangeSchema } from '@nexus-ai/contracts';

/** PostgreSQL JSONB requires Unicode scalar values and cannot store NUL text. */
export const validRealtimeText = (text: string): boolean => !text.includes('\0') && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text);

export const realtimeQueueSchema = z.object({
  version: z.literal(1), userId: z.string().min(1).max(128), projectId: z.uuid(), repositoryId: z.uuid(),
  cwd: z.string().min(1).max(32768), deviceId: z.uuid(), threadId: z.string().min(1).max(200),
  shareId: z.uuid(), title: z.string().min(1).max(140), visibility: z.enum(['team', 'client']),
  selected: z.array(liveMessageSchema).min(1).max(20), capturing: z.boolean(), blocked: z.boolean(), stopRequested: z.boolean().default(false),
  jobs: z.array(z.object({ batchId: z.uuid(), change: realtimeChangeSchema }).strict()).max(100),
}).strict().superRefine((value, context) => {
  const ids = new Set(value.selected.map(message => message.id));
  if (ids.size !== value.selected.length || value.selected.reduce((size, message) => size + message.text.length, 0) > 131072 ||
      value.selected.some(message => !validRealtimeText(message.text)) ||
      value.jobs.some(job => job.change.shareId !== value.shareId || job.change.deviceId !== value.deviceId ||
        (job.change.type === 'start' && job.change.messages.some(message => !validRealtimeText(message.text))) ||
        (job.change.type === 'append' && job.change.updates.some(update => !ids.has(update.messageId) || !validRealtimeText(update.text)))) ||
      Buffer.byteLength(JSON.stringify(value)) > 1048576) context.addIssue({ code: 'custom', message: 'Invalid realtime queue bounds or scope.' });
});

export type RealtimeQueue = z.infer<typeof realtimeQueueSchema>;
export const realtimeStorageKey = (userId: string, projectId: string): string =>
  `realtime:v1:${createHash('sha256').update(JSON.stringify([userId, projectId])).digest('hex')}`;

/** All values are passed only to the OS-encrypted storage adapter owned by main. */
export async function loadRealtimeQueue(storage: { getItem(key: string): Promise<string | null> }, userId: string, projectId: string): Promise<RealtimeQueue | null> {
  const text = await storage.getItem(realtimeStorageKey(userId, projectId));
  if (text === null || text === '') return null;
  if (Buffer.byteLength(text) > 1048576) throw new Error('Realtime queue exceeds its safe size.');
  const value = realtimeQueueSchema.parse(JSON.parse(text) as unknown);
  if (value.userId !== userId || value.projectId !== projectId) throw new Error('Realtime queue belongs to another scope.');
  return value;
}

export async function saveRealtimeQueue(storage: { setItem(key: string, value: string): Promise<void> }, queue: RealtimeQueue): Promise<void> {
  const value = realtimeQueueSchema.parse(queue);
  await storage.setItem(realtimeStorageKey(value.userId, value.projectId), JSON.stringify(value));
}

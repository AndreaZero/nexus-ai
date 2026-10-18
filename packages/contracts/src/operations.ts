import {z} from 'zod';
export const readinessResponseSchema=z.object({schemaVersion:z.literal(1),service:z.literal('nexus-server'),version:z.string().min(1),status:z.enum(['ready','not_ready']),checks:z.object({database:z.enum(['not_configured','not_connected','connected','unavailable']),schema:z.enum(['current','pending','mismatch','unavailable']),accounts:z.enum(['configured','not_configured']),email:z.enum(['configured','not_configured'])}).strict(),timestamp:z.iso.datetime()}).strict();
export type ReadinessResponse=z.infer<typeof readinessResponseSchema>;

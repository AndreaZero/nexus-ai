import { z } from 'zod';

export const DESKTOP_IPC = { getInfo: 'nexus:desktop:get-info' } as const;

export const desktopInfoSchema = z.object({
  appVersion: z.string().min(1),
  platform: z.enum(['win32', 'darwin', 'linux']),
  architecture: z.string().min(1),
  electronVersion: z.string().min(1),
  capabilities: z.object({
    canRunLocalSession: z.boolean(),
    canOpenLocalEditor: z.boolean(),
  }).strict(),
}).strict();

export type DesktopInfo = z.infer<typeof desktopInfoSchema>;

export interface DesktopBridge {
  getInfo(): Promise<DesktopInfo>;
}

export const healthResponseSchema = z.object({
  schemaVersion: z.literal(1),
  service: z.literal('nexus-server'),
  version: z.string().min(1),
  status: z.literal('ok'),
  database: z.enum(['not_configured', 'not_connected']),
  codex: z.literal('local_only'),
  timestamp: z.iso.datetime(),
}).strict();

export type HealthResponse = z.infer<typeof healthResponseSchema>;

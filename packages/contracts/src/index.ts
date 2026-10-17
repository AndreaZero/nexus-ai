import { z } from 'zod';
import type { CollaborationRequest, CollaborationResponse, LocalBindingRequest, LocalBindingResponse } from './collaboration.js';
import type { CodexRequest, CodexResponse, CodexState } from './codex.js';
import type { ContextRequest, ContextResponse } from './context.js';
import type { SessionsRequest, SessionsResponse } from './sessions.js';
import type { WorkspaceRequest, WorkspaceResponse } from './workspace.js';
export * from './collaboration.js';
export * from './codex.js';
export * from './context.js';
export * from './sessions.js';
export * from './workspace.js';

export const DESKTOP_IPC = {
  getInfo: 'nexus:desktop:get-info',
  authGetState: 'nexus:auth:get-state',
  authSignIn: 'nexus:auth:sign-in',
  authCancelSignIn: 'nexus:auth:cancel-sign-in',
  authSignOut: 'nexus:auth:sign-out',
  authStateChanged: 'nexus:auth:state-changed',
  collaborationRequest: 'nexus:collaboration:request',
  localBindingRequest: 'nexus:repository:local-binding',
  codexRequest: 'nexus:codex:request',
  codexStateChanged: 'nexus:codex:state-changed',
  contextRequest: 'nexus:context:request',
  sessionsRequest: 'nexus:sessions:request',
  workspaceRequest: 'nexus:workspace:request',
} as const;

export const nexusUserSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
}).strict();
export type NexusUser = z.infer<typeof nexusUserSchema>;

export const nexusAuthStateSchema = z.object({
  status: z.enum(['signed_out', 'signing_in', 'signed_in', 'unavailable']),
  user: nexusUserSchema.nullable(),
  expiresAt: z.iso.datetime().nullable(),
  persistent: z.boolean(),
  message: z.string().nullable(),
}).strict();
export type NexusAuthState = z.infer<typeof nexusAuthStateSchema>;

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
  readonly collaboration: { request(request: CollaborationRequest): Promise<CollaborationResponse> };
  readonly localBinding: { request(request: LocalBindingRequest): Promise<LocalBindingResponse> };
  readonly context: { request(request: ContextRequest): Promise<ContextResponse> };
  readonly sessions: { request(request: SessionsRequest): Promise<SessionsResponse> };
  readonly workspace: { request(request: WorkspaceRequest): Promise<WorkspaceResponse> };
  readonly codex: {
    request(request: CodexRequest): Promise<CodexResponse>;
    onStateChanged(callback: (state: CodexState) => void): () => void;
  };
  readonly auth: {
    getState(): Promise<NexusAuthState>;
    signIn(): Promise<NexusAuthState>;
    cancelSignIn(): Promise<NexusAuthState>;
    signOut(): Promise<NexusAuthState>;
    onStateChanged(callback: (state: NexusAuthState) => void): () => void;
  };
}

export const healthResponseSchema = z.object({
  schemaVersion: z.literal(1),
  service: z.literal('nexus-server'),
  version: z.string().min(1),
  status: z.literal('ok'),
  database: z.enum(['not_configured', 'not_connected', 'connected', 'unavailable']),
  codex: z.literal('local_only'),
  timestamp: z.iso.datetime(),
}).strict();

export type HealthResponse = z.infer<typeof healthResponseSchema>;

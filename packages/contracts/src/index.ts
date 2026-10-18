import { z } from 'zod';
import type { CollaborationRequest, CollaborationResponse, LocalBindingRequest, LocalBindingResponse } from './collaboration.js';
import type { CodexRequest, CodexResponse, CodexState } from './codex.js';
import type { ContextRequest, ContextResponse } from './context.js';
import type { SessionsRequest, SessionsResponse } from './sessions.js';
import type { WorkspaceRequest, WorkspaceResponse } from './workspace.js';
import type { RealtimeRequest, RealtimeResponse, RealtimeState } from './realtime.js';
import type { OverviewRequest, OverviewResponse, TelemetryRequest, TelemetryResponse } from './overview.js';
import type { PulseRequest, PulseResponse } from './pulse.js';
import type { WorkRequest, WorkResponse, WorkDownloadRequest } from './work.js';
import type { GitRequest, GitResponse, RepositoriesRequest, RepositoriesResponse } from './repositories.js';
import type { DeploymentsRequest,DeploymentsResponse,DeploymentPreviewRequest,EnvironmentProbeRequest,EnvironmentProbeResponse } from './deployments.js';
export * from './collaboration.js';
export * from './codex.js';
export * from './context.js';
export * from './sessions.js';
export * from './workspace.js';
export * from './realtime.js';
export * from './overview.js';
export * from './pulse.js';
export * from './work.js';
export * from './repositories.js';
export * from './deployments.js';

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
  realtimeRequest: 'nexus:realtime:request',
  realtimeStateChanged: 'nexus:realtime:state-changed',
  overviewRequest: 'nexus:overview:request',
  telemetryRequest: 'nexus:telemetry:request',
  pulseRequest: 'nexus:pulse:request',
  workRequest: 'nexus:work:request',
  workDownload: 'nexus:work:download',
  gitRequest: 'nexus:git:request',
  repositoriesRequest: 'nexus:repositories:request',
  deploymentsRequest:'nexus:deployments:request',
  deploymentPreview:'nexus:deployments:preview',
  environmentProbeRequest:'nexus:environment:probe',
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
  readonly realtime: { request(request: RealtimeRequest): Promise<RealtimeResponse>; onStateChanged(callback: (state: RealtimeState) => void): () => void };
  readonly overview: { request(request: OverviewRequest): Promise<OverviewResponse> };
  readonly telemetry: { request(request: TelemetryRequest): Promise<TelemetryResponse> };
  readonly pulse: { request(request: PulseRequest): Promise<PulseResponse> };
  readonly work: { request(request: WorkRequest): Promise<WorkResponse>; download(request: WorkDownloadRequest): Promise<WorkResponse> };
  readonly git: { request(request: GitRequest): Promise<GitResponse> };
  readonly repositories: { request(request: RepositoriesRequest): Promise<RepositoriesResponse> };
  readonly deployments:{request(request:DeploymentsRequest):Promise<DeploymentsResponse>;openPreview(request:DeploymentPreviewRequest):Promise<DeploymentsResponse>};
  readonly environmentProbe:{request(request:EnvironmentProbeRequest):Promise<EnvironmentProbeResponse>};
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

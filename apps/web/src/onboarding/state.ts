import type { CodexModel, CodexSession, LocalBinding, Project } from '@nexus-ai/contracts';

export const onboardingStepIds = ['account', 'workspace', 'project', 'folder', 'codex', 'session'] as const;
export type OnboardingStepId = typeof onboardingStepIds[number];
export type OnboardingMode = 'developer' | 'observer' | 'browser';
export interface OnboardingStep { id: OnboardingStepId; title: string; description: string; complete: boolean; available: boolean }
export interface OnboardingInput {
  account: { signedIn: boolean; verified: boolean; loading: boolean };
  collaboration: { ready: boolean; loading: boolean; error: string; workspaceId: string | null; project: Pick<Project, 'id' | 'workspaceId' | 'role' | 'repository'> | null };
  desktop: boolean;
  platform: string | null;
  codex: {
    enabled: boolean; error: string; bindingLoading: boolean; bindingError: string;
    binding: Pick<LocalBinding, 'projectId' | 'repositoryId' | 'deviceId' | 'updatedAt'> | null;
    runtime: string; accountPresent: boolean; model: Pick<CodexModel, 'id'> | null; modelIds: readonly string[];
    windowsSandbox: string; session: Pick<CodexSession, 'projectId' | 'repositoryId' | 'bindingUpdatedAt' | 'status' | 'messages'> | null;
  };
}
export interface CompletionReceipt { projectId: string; repositoryId: string; deviceId: string; bindingUpdatedAt: string; complete: true }
export interface OnboardingPreferences { version: 1; dismissed: boolean; stepId: OnboardingStepId | null; receipt: CompletionReceipt | null }
export const emptyOnboardingPreferences: OnboardingPreferences = { version: 1, dismissed: false, stepId: null, receipt: null };
export type OnboardingStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function onboardingStorageKey(authority: string, accountId: string | null): string {
  return `nexus.onboarding.v1.${encodeURIComponent(authority)}.${encodeURIComponent(accountId ?? 'guest')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export function isOnboardingStep(value: unknown): value is OnboardingStepId { return onboardingStepIds.some(id => id === value); }
function readReceipt(value: unknown): CompletionReceipt | null {
  if (!isRecord(value) || value['complete'] !== true) return null;
  const { projectId, repositoryId, deviceId, bindingUpdatedAt } = value;
  if (typeof projectId !== 'string' || !projectId || projectId.length > 128 || typeof repositoryId !== 'string' || !repositoryId || repositoryId.length > 128 || typeof deviceId !== 'string' || !deviceId || deviceId.length > 128 || typeof bindingUpdatedAt !== 'string' || !Number.isFinite(Date.parse(bindingUpdatedAt))) return null;
  return { projectId, repositoryId, deviceId, bindingUpdatedAt, complete: true };
}

export function readOnboardingPreferences(storage: OnboardingStorage | null, key: string): { preferences: OnboardingPreferences; available: boolean } {
  if (!storage) return { preferences: { ...emptyOnboardingPreferences }, available: false };
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? 'null');
    if (!isRecord(value) || value['version'] !== 1) return { preferences: { ...emptyOnboardingPreferences }, available: true };
    return { preferences: { version: 1, dismissed: value['dismissed'] === true, stepId: isOnboardingStep(value['stepId']) ? value['stepId'] : null, receipt: readReceipt(value['receipt']) }, available: true };
  } catch {
    // Malformed JSON is recoverable; a throwing storage implementation is optional too.
    try { storage.getItem(key); return { preferences: { ...emptyOnboardingPreferences }, available: true }; } catch { return { preferences: { ...emptyOnboardingPreferences }, available: false }; }
  }
}

export function saveOnboardingPreferences(storage: OnboardingStorage | null, key: string, preferences: OnboardingPreferences): boolean {
  if (!storage) return false;
  try {
    // Reconstruct the whitelist so paths, tokens, messages and unrelated fields never enter storage.
    storage.setItem(key, JSON.stringify({ version: 1, dismissed: preferences.dismissed === true, stepId: isOnboardingStep(preferences.stepId) ? preferences.stepId : null, receipt: readReceipt(preferences.receipt) }));
    return true;
  } catch { return false; }
}

export function completionScope(input: OnboardingInput): CompletionReceipt | null {
  const project = input.collaboration.project;
  const binding = input.codex.binding;
  if (!project?.repository || !binding || binding.projectId !== project.id || binding.repositoryId !== project.repository.id) return null;
  return { projectId: project.id, repositoryId: project.repository.id, deviceId: binding.deviceId, bindingUpdatedAt: binding.updatedAt, complete: true };
}

export function sameCompletionScope(left: CompletionReceipt | null, right: CompletionReceipt | null): boolean {
  return Boolean(left && right && left.projectId === right.projectId && left.repositoryId === right.repositoryId && left.deviceId === right.deviceId && left.bindingUpdatedAt === right.bindingUpdatedAt);
}

export function deriveOnboarding(input: OnboardingInput, receipt: CompletionReceipt | null = null) {
  const { account, collaboration, codex } = input;
  const project = collaboration.project;
  const mode: OnboardingMode = project?.role === 'client' || project?.role === 'viewer' ? 'observer' : input.desktop ? 'developer' : 'browser';
  const accountReady = account.signedIn && account.verified && !account.loading;
  const workspaceReady = accountReady && collaboration.ready && !collaboration.loading && !collaboration.error && Boolean(collaboration.workspaceId);
  const projectReady = workspaceReady && Boolean(project && project.workspaceId === collaboration.workspaceId);
  const local = mode === 'developer' && projectReady;
  const scope = completionScope(input);
  const folderReady = local && codex.enabled && !codex.bindingLoading && !codex.bindingError && Boolean(scope);
  const sandboxReady = input.platform !== null && (input.platform !== 'win32' || codex.windowsSandbox === 'ready');
  const codexReady = folderReady && !codex.error && codex.runtime === 'ready' && codex.accountPresent && Boolean(codex.model && codex.modelIds.includes(codex.model.id)) && sandboxReady;
  const session = codex.session;
  const responseObserved = codexReady && Boolean(session && scope && session.projectId === project?.id && session.repositoryId === project?.repository?.id && session.bindingUpdatedAt === scope.bindingUpdatedAt && session.status === 'completed' && session.messages.some(message => message.role === 'assistant' && message.status === 'complete' && message.text.trim().length > 0));
  const sessionReady = codexReady && (responseObserved || sameCompletionScope(receipt, scope));
  const steps: readonly OnboardingStep[] = [
    { id: 'account', title: 'Your Nexus account', description: 'Sign in and verify your email to keep your workspace connected.', complete: accountReady, available: true },
    { id: 'workspace', title: 'Choose a workspace', description: 'Create your workspace or open one shared with you.', complete: workspaceReady, available: accountReady },
    { id: 'project', title: 'Choose your project', description: 'Give your work a home, or select the project you were invited to.', complete: projectReady, available: workspaceReady },
    { id: 'folder', title: 'Connect your local folder', description: 'Link the project repository to its folder on this device.', complete: folderReady, available: local },
    { id: 'codex', title: 'Connect Codex', description: 'Connect your personal account and prepare the local runtime.', complete: codexReady, available: folderReady },
    { id: 'session', title: 'Your first AI session', description: 'Send a read only request and receive your first complete response.', complete: sessionReady, available: codexReady },
  ];
  const relevant = mode === 'developer' ? steps : steps.slice(0, 3);
  const completed = relevant.every(step => step.complete);
  const firstIncomplete = relevant.find(step => !step.complete && step.available)?.id ?? (mode === 'developer' ? 'session' : 'project');
  return { mode, steps, completed, firstIncomplete, observedReceipt: responseObserved ? scope : null };
}

export function resolveOnboardingStep(steps: readonly OnboardingStep[], preferred: OnboardingStepId | null, fallback: OnboardingStepId): OnboardingStepId {
  return preferred && steps.some(step => step.id === preferred && step.available) ? preferred : fallback;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAccount } from '../auth/AuthProvider.js';
import { accountServerUrl } from '../auth/configuration.js';
import { useCollaboration } from '../collaboration/CollaborationProvider.js';
import { useCodex } from '../codex/CodexProvider.js';
import { useDesktopInfo } from '../use-desktop-info.js';
import { deriveOnboarding, onboardingStorageKey, readOnboardingPreferences, resolveOnboardingStep, sameCompletionScope, saveOnboardingPreferences } from './state.js';
import type { OnboardingInput, OnboardingMode, OnboardingPreferences, OnboardingStep, OnboardingStepId, OnboardingStorage } from './state.js';

interface OnboardingContextValue {
  steps: readonly OnboardingStep[]; stepId: OnboardingStepId;
  selectStep(id: OnboardingStepId): void; next(): void; back(): void;
  completed: boolean; dismissed: boolean; storageAvailable: boolean; autoStart: boolean; mode: OnboardingMode;
  dismiss(): void; restart(): void;
}
const Context = createContext<OnboardingContextValue | null>(null);
function localStorage(): OnboardingStorage | null { try { return window.localStorage; } catch { return null; } }

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const collaboration = useCollaboration();
  const codex = useCodex();
  const desktop = useDesktopInfo();
  const user = account.state.status === 'signed_in' ? account.state.user : null;
  const authority = accountServerUrl()?.href ?? 'unconfigured';
  const storageKey = onboardingStorageKey(authority, user?.id ?? null);
  const input: OnboardingInput = {
    account: { signedIn: Boolean(user), verified: user?.emailVerified === true, loading: account.loading },
    collaboration: { ready: collaboration.ready, loading: collaboration.loading, error: collaboration.error, workspaceId: collaboration.workspace?.id ?? null, project: collaboration.project },
    desktop: account.desktop,
    platform: desktop.status === 'ready' ? desktop.info.platform : null,
    codex: { enabled: codex.enabled, error: codex.error, bindingLoading: codex.bindingLoading, bindingError: codex.bindingError, binding: codex.binding, runtime: codex.state.runtime, accountPresent: Boolean(codex.state.account), model: codex.model, modelIds: codex.state.models.map(item => item.id), windowsSandbox: codex.state.windowsSandbox ?? 'unknown', session: codex.state.session },
  };
  // No preferences or completion evidence can render under a different account/authority.
  return <OnboardingScope key={storageKey} storageKey={storageKey} input={input}>{children}</OnboardingScope>;
}

function OnboardingScope({ children, storageKey, input }: { children: ReactNode; storageKey: string; input: OnboardingInput }) {
  const storage = useMemo(localStorage, []);
  const [initial] = useState(() => readOnboardingPreferences(storage, storageKey));
  const [preferences, setPreferences] = useState(initial.preferences);
  const [storageAvailable, setStorageAvailable] = useState(initial.available);
  const result = deriveOnboarding(input, preferences.receipt);
  const stepId = resolveOnboardingStep(result.steps, preferences.stepId, result.firstIncomplete);
  const update = useCallback((change: (current: OnboardingPreferences) => OnboardingPreferences) => {
    setPreferences(current => change(current));
  }, []);
  useEffect(() => {
    setStorageAvailable(saveOnboardingPreferences(storage, storageKey, preferences));
  }, [storage, storageKey, preferences]);
  const observed = result.observedReceipt;
  const observedKey = observed ? JSON.stringify(observed) : null;
  useEffect(() => {
    if (!observedKey) return;
    const receipt = JSON.parse(observedKey) as NonNullable<OnboardingPreferences['receipt']>;
    // First value has been observed. Do not force setup again merely because the
    // runtime starts disconnected next launch; current readiness still derives live.
    setPreferences(current => sameCompletionScope(current.receipt, receipt) ? current : { ...current, receipt, dismissed: true });
  }, [observedKey]);
  function selectStep(id: OnboardingStepId) {
    if (result.steps.some(step => step.id === id && step.available)) update(current => ({ ...current, stepId: id }));
  }
  function move(direction: 1 | -1) {
    const index = result.steps.findIndex(step => step.id === stepId);
    const candidates = direction === 1 ? result.steps.slice(index + 1) : result.steps.slice(0, index).reverse();
    const target = candidates.find(step => step.available);
    if (target) selectStep(target.id);
  }
  const autoStart = !input.account.loading && (!input.account.signedIn || !input.collaboration.loading) && !preferences.dismissed && !result.completed;
  return <Context.Provider value={{ steps: result.steps, stepId, selectStep, next: () => move(1), back: () => move(-1), completed: result.completed, dismissed: preferences.dismissed, storageAvailable, autoStart, mode: result.mode, dismiss: () => update(current => ({ ...current, dismissed: true })), restart: () => update(current => ({ ...current, dismissed: false, stepId: result.firstIncomplete })) }}>{children}</Context.Provider>;
}

export function useOnboarding() { const value = useContext(Context); if (!value) throw new Error('Onboarding context is missing.'); return value; }

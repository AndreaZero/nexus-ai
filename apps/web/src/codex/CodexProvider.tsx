import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { codexStateSchema } from '@nexus-ai/contracts';
import type { CodexModel, CodexRequest, CodexState, LocalBinding } from '@nexus-ai/contracts';
import { useAccount } from '../auth/AuthProvider.js';
import { useCollaboration } from '../collaboration/CollaborationProvider.js';
import { errorMessage, localBindingRequest } from '../collaboration/client.js';
import { codexRequest } from './client.js';
import { CodexStartup } from './startup.js';

const emptyState: CodexState = { runtime: 'stopped', version: null, expectedVersion: '0.159.2', runtimePath: null, account: null, login: null, models: [], session: null, policy: 'readOnly', notice: null };
interface CodexContextValue {
  state: CodexState; error: string; busy: boolean; desktop: boolean; enabled: boolean;
  binding: LocalBinding | null; bindingLoading: boolean; bindingError: string;
  model: CodexModel | null; effort: string | null;
  selectModel(id: string): void; selectEffort(effort: string): void;
  request(request: CodexRequest): Promise<boolean>; refresh(): Promise<boolean>;
}
const Context = createContext<CodexContextValue | null>(null);

export function CodexProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const collaboration = useCollaboration();
  const accountId = account.state.status === 'signed_in' && account.state.user?.emailVerified ? account.state.user.id : null;
  const project = collaboration.project;
  const startup = useRef(new CodexStartup()).current;
  // Remount the whole domain before a different account/project can render old local data.
  const key = `${accountId ?? 'none'}:${project?.id ?? 'none'}:${project?.repository?.id ?? 'none'}:${project?.role ?? 'none'}`;
  return <CodexScope key={key} accountId={accountId} startup={startup}>{children}</CodexScope>;
}

function CodexScope({ children, accountId, startup }: { children: ReactNode; accountId: string | null; startup: CodexStartup }) {
  const { project } = useCollaboration();
  const projectId = project?.id;
  const repositoryId = project?.repository?.id;
  const technical = project?.role === 'owner' || project?.role === 'developer';
  const enabled = Boolean(accountId && window.nexusDesktop?.codex);
  const [state, setState] = useState<CodexState>(emptyState);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [binding, setBinding] = useState<LocalBinding | null>(null);
  const [bindingLoading, setBindingLoading] = useState(false);
  const [bindingError, setBindingError] = useState('');
  const [selection, setSelection] = useState(() => {
    try {
      const value: unknown = JSON.parse(window.localStorage.getItem(`nexus.codex.model.${accountId}`) ?? 'null');
      if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && 'effort' in value && typeof value.effort === 'string') return { id: value.id, effort: value.effort };
    } catch { /* Model selection is optional and never authorizes a model. */ }
    return { id: '', effort: '' };
  });
  const live = useRef(false);
  const revision = useRef(0);
  const bindingGeneration = useRef(0);
  const pending = useRef(0);
  const inFlight = useRef(new Map<string, Promise<boolean>>());
  const apply = useCallback((next: CodexState) => {
    const session = technical && next.session && next.session.projectId === projectId && next.session.repositoryId === repositoryId ? next.session : null;
    setState({ ...next, session, policy: session ? next.policy : 'readOnly' });
  }, [projectId, repositoryId, technical]);

  const request = useCallback((input: CodexRequest): Promise<boolean> => {
    if (!enabled) return Promise.resolve(false);
    // StrictMode and focus can request the same read/resume; attach to one operation.
    // API keys are deliberately excluded from lookup keys and persistent state.
    const deduplicate = input.operation === 'getState' || input.operation === 'connect' || input.operation === 'openSession';
    const key = deduplicate ? JSON.stringify(input) : '';
    const existing = key ? inFlight.current.get(key) : undefined;
    if (existing) return existing;
    const startRevision = revision.current;
    pending.current += 1; setBusy(true); setError('');
    const operation = codexRequest(input).then(result => {
      if (!live.current) return false;
      if (revision.current === startRevision) apply(result.state);
      if (!result.ok) setError(result.message);
      return result.ok;
    }).catch(() => {
      if (live.current) setError('The local Codex connection is unavailable. Reconnect and retry.');
      return false;
    }).finally(() => {
      if (key) inFlight.current.delete(key);
      pending.current -= 1;
      if (live.current) setBusy(pending.current > 0);
    });
    if (key) inFlight.current.set(key, operation);
    return operation;
  }, [enabled, apply]);
  const refresh = useCallback(() => request({ operation: 'getState' }), [request]);

  useEffect(() => {
    live.current = true;
    const operation = startup.operation(accountId);
    if (!enabled) return () => { live.current = false; };
    const unsubscribe = window.nexusDesktop?.codex.onStateChanged(value => {
      if (!live.current) return;
      const parsed = codexStateSchema.safeParse(value);
      if (parsed.success) { ++revision.current; apply(parsed.data); }
    });
    // Restore Nexus-owned credentials without opening a browser or starting a turn.
    // The parent gate survives project/role remounts and preserves Disconnect.
    void request({ operation });
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { live.current = false; unsubscribe?.(); window.removeEventListener('focus', onFocus); };
  }, [enabled, refresh, apply, request, startup, accountId]);

  useEffect(() => {
    if (!enabled || !projectId || !repositoryId || (project?.role !== 'owner' && project?.role !== 'developer')) return;
    const load = () => {
      const ticket = ++bindingGeneration.current;
      setBindingLoading(true); setBindingError(''); setBinding(null);
      void localBindingRequest({ operation: 'get', projectId, repositoryId }).then(value => {
        if (live.current && ticket === bindingGeneration.current) setBinding(value);
      }).catch(cause => {
        if (live.current && ticket === bindingGeneration.current) setBindingError(errorMessage(cause));
      }).finally(() => { if (live.current && ticket === bindingGeneration.current) setBindingLoading(false); });
    };
    load(); window.addEventListener('focus', load); window.addEventListener('hashchange', load);
    return () => { ++bindingGeneration.current; window.removeEventListener('focus', load); window.removeEventListener('hashchange', load); };
  }, [enabled, projectId, repositoryId, project?.role]);

  const model = state.models.find(item => item.id === selection.id) ?? state.models.find(item => item.isDefault) ?? state.models[0] ?? null;
  const effort = model?.efforts.includes(selection.effort) ? selection.effort : model?.efforts.includes(model.defaultEffort) ? model.defaultEffort : null;
  function saveSelection(next: { id: string; effort: string }) {
    setSelection(next);
    if (accountId) { try { window.localStorage.setItem(`nexus.codex.model.${accountId}`, JSON.stringify(next)); } catch { /* Optional selection only. */ } }
  }
  function selectModel(id: string) { const item = state.models.find(entry => entry.id === id); if (item) saveSelection({ id: item.id, effort: item.defaultEffort }); }
  function selectEffort(next: string) { if (model?.efforts.includes(next)) saveSelection({ id: model.id, effort: next }); }
  return <Context.Provider value={{ state, error, busy, desktop: Boolean(window.nexusDesktop), enabled, binding, bindingLoading, bindingError, model, effort, selectModel, selectEffort, request, refresh }}>{children}</Context.Provider>;
}

export function useCodex() { const context = useContext(Context); if (!context) throw new Error('Codex context is missing.'); return context; }

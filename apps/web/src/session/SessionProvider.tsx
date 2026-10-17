import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ContextRequest, ContextSnapshot } from '@nexus-ai/contracts';
import { useAccount } from '../auth/AuthProvider.js';
import { useCollaboration } from '../collaboration/CollaborationProvider.js';
import { useCodex } from '../codex/CodexProvider.js';
import { contextRequest } from './client.js';
import { DraftWriter, successfulDraftClear } from './draft.js';
import type { DraftStatus } from './draft.js';

let activeAccount: string | null = null;
const drafts = new Map<string, string>();
interface ContextValue { context: ContextSnapshot | null; draft: string; draftStatus: DraftStatus; preview: { fileId: string; text: string } | null; error: string; busy: boolean; enabled: boolean; setDraft(text: string): void; clearSent(text: string): void; flushDraft(): void; request(operation: 'get' | 'pickFiles' | 'removeFile' | 'readFile', fileId?: string): Promise<void>; }
const Context = createContext<ContextValue | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const account = useAccount(); const { project } = useCollaboration(); const codex = useCodex();
  const accountId = account.state.status === 'signed_in' ? account.state.user?.id ?? null : null;
  if (activeAccount !== accountId) drafts.clear();
  activeAccount = accountId;
  const identity = `${accountId}:${project?.id}:${project?.repository?.id}`;
  const binding = useRef({ identity, stamp: codex.binding?.updatedAt ?? '' });
  if (binding.current.identity !== identity) binding.current = { identity, stamp: codex.binding?.updatedAt ?? '' };
  else if (codex.binding) binding.current.stamp = codex.binding.updatedAt;
  const key = `${identity}:${binding.current.stamp}`;
  return <Scope key={key} scope={key} accountId={accountId}>{children}</Scope>;
}
function Scope({ children, scope, accountId }: { children: ReactNode; scope: string; accountId: string | null }) {
  const { project } = useCollaboration(); const codex = useCodex();
  const projectId = project?.id; const repositoryId = project?.repository?.id;
  const enabled = Boolean(accountId && window.nexusDesktop?.context && codex.binding && (project?.role === 'owner' || project?.role === 'developer') && projectId && repositoryId);
  const [context, setContext] = useState<ContextSnapshot | null>(null); const [preview, setPreview] = useState<ContextValue['preview']>(null);
  const [draft, updateDraft] = useState(drafts.get(scope) ?? ''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('saved');
  const live = useRef(false); const touched = useRef(drafts.has(scope)); const current = useRef(draft); const revision = useRef(0); const pending = useRef(0);
  const allowed = useRef(enabled); allowed.current = enabled;
  const writer = useRef(new DraftWriter(async text => { if (projectId && repositoryId) await contextRequest({ operation: 'saveDraft', projectId, repositoryId, text }); }, () => Boolean(allowed.current && activeAccount === accountId), () => { if (live.current) setError('The local draft could not be saved. Keep this window open and retry.'); }, value => { if (live.current) setDraftStatus(value); })).current;
  const request = useCallback(async (operation: 'get' | 'pickFiles' | 'removeFile' | 'readFile', fileId?: string) => {
    if (!enabled || !projectId || !repositoryId) return;
    const ticket = ++revision.current; pending.current++; setBusy(true); setError('');
    try {
      const input: ContextRequest = operation === 'removeFile' || operation === 'readFile' ? { operation, projectId, repositoryId, fileId: fileId! } : { operation, projectId, repositoryId };
      const result = await contextRequest(input);
      if (!live.current || ticket !== revision.current) return;
      setContext(result.context); setPreview(result.preview);
      if (!touched.current) { current.current = result.context.draft; updateDraft(result.context.draft); }
    } catch (cause) { if (live.current && ticket === revision.current) setError(cause instanceof Error ? cause.message : 'Local context is unavailable.'); }
    finally { pending.current--; if (live.current) setBusy(pending.current > 0); }
  }, [enabled, projectId, repositoryId]);
  useEffect(() => { live.current = true; void request('get'); return () => { live.current = false; ++revision.current; if (activeAccount === accountId) void writer.flush(); else writer.cancel(); }; }, [request, writer, accountId]);
  useEffect(() => {
    const flush = () => { if (activeAccount === accountId) void writer.flush(); else writer.cancel(); };
    window.addEventListener('blur', flush); window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('blur', flush); window.removeEventListener('pagehide', flush); };
  }, [writer, accountId]);
  function setDraft(text: string) { touched.current = true; current.current = text; drafts.delete(scope); drafts.set(scope, text); if (drafts.size > 64) drafts.delete(drafts.keys().next().value!); updateDraft(text); writer.schedule(text); }
  function clearSent(sent: string) { const next = successfulDraftClear(current.current, sent, true); if (next !== current.current) setDraft(next); void writer.flush(); }
  return <Context.Provider value={{ context, draft, draftStatus, preview, error, busy, enabled, setDraft, clearSent, flushDraft: () => { void writer.flush(); }, request }}>{children}</Context.Provider>;
}
export function useSessionContext() { const value = useContext(Context); if (!value) throw new Error('Session context is missing.'); return value; }

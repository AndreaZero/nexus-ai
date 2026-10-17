import { useCallback, useEffect, useRef, useState } from 'react';
import { workspaceRequestSchema, workspaceResponseSchema } from '@nexus-ai/contracts';
import type { WorkspaceRequest, WorkspaceSnapshot } from '@nexus-ai/contracts';
import { useAccount } from '../auth/AuthProvider.js';
import { useCodex } from '../codex/CodexProvider.js';
import { useCollaboration } from '../collaboration/CollaborationProvider.js';

export interface LocalWorkspace {
  snapshot: WorkspaceSnapshot | null; busy: boolean; error: string; enabled: boolean;
  request(input: { operation: 'getChanges' | 'openPreview' } | { operation: 'openEditor'; fileId: string | null } | { operation: 'setPreview'; url: string | null }): Promise<boolean>;
}
export function useLocalWorkspace(): LocalWorkspace {
  const { project } = useCollaboration(); const account = useAccount(); const codex = useCodex();
  const projectId = project?.id; const repositoryId = project?.repository?.id;
  const enabled = Boolean(account.state.status === 'signed_in' && window.nexusDesktop?.workspace && codex.binding && (project?.role === 'owner' || project?.role === 'developer'));
  const scope = `${account.state.user?.id}:${projectId}:${repositoryId}:${codex.binding?.updatedAt}:${project?.role}`;
  const active = useRef(scope); active.current = scope;
  const [value, setValue] = useState<{ scope: string; snapshot: WorkspaceSnapshot } | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const live = useRef(false); const revision = useRef(0); const pending = useRef(0);
  const request = useCallback(async (input: Parameters<LocalWorkspace['request']>[0]) => {
    if (!enabled || !projectId || !repositoryId || !window.nexusDesktop?.workspace) return false;
    const ticket = ++revision.current; pending.current++; setBusy(true); setError('');
    try {
      const operation = { ...input, projectId, repositoryId } as WorkspaceRequest;
      const result = workspaceResponseSchema.parse(await window.nexusDesktop.workspace.request(workspaceRequestSchema.parse(operation)));
      if (!live.current || active.current !== scope || ticket !== revision.current) return false;
      if (!result.ok) throw new Error(result.message);
      if (result.snapshot.projectId !== projectId || result.snapshot.repositoryId !== repositoryId) throw new Error('The local result belongs to a different repository. Refresh this workspace.');
      setValue({ scope, snapshot: result.snapshot }); return true;
    } catch (cause) { if (live.current && active.current === scope && ticket === revision.current) setError(cause instanceof Error ? cause.message : 'Local workspace unavailable. Refresh and retry.'); return false; }
    finally { pending.current--; if (live.current && active.current === scope) setBusy(pending.current > 0); }
  }, [enabled, projectId, repositoryId, scope]);
  useEffect(() => { live.current = true; setValue(null); setError(''); void request({ operation: 'getChanges' }); return () => { live.current = false; ++revision.current; }; }, [request]);
  const previousTurn = useRef('');
  useEffect(() => {
    const session = codex.state.session;
    const completed = session?.turnId && session.status !== 'running' ? `${session.threadId}:${session.turnId}:${session.status}` : '';
    if (completed && previousTurn.current !== completed) { previousTurn.current = completed; void request({ operation: 'getChanges' }); }
  }, [codex.state.session?.status, codex.state.session?.turnId, codex.state.session?.threadId, request]);
  return { snapshot: enabled && value?.scope === scope ? value.snapshot : null, error, busy, enabled, request };
}

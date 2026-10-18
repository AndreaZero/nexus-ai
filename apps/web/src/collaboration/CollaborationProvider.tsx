import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Project, Workspace } from '@nexus-ai/contracts';
import { useAccount } from '../auth/AuthProvider.js';
import { collaborationRequest, errorMessage } from './client.js';

interface Selection { workspaceId: string | null; projectId: string | null }
const emptySelection: Selection = { workspaceId: null, projectId: null };
function readSelection(accountId: string): Selection {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(`nexus.selection.${accountId}`) ?? 'null');
    if (stored && typeof stored === 'object' && 'workspaceId' in stored && 'projectId' in stored) {
      return { workspaceId: typeof stored.workspaceId === 'string' ? stored.workspaceId : null, projectId: typeof stored.projectId === 'string' ? stored.projectId : null };
    }
  } catch { /* Selection is optional, authorizations always come from the server. */ }
  return emptySelection;
}
function saveSelection(accountId: string, value: Selection) {
  try { window.localStorage.setItem(`nexus.selection.${accountId}`, JSON.stringify(value)); } catch { /* Private browsing can disable storage. */ }
}
interface CollaborationContextValue {
  workspaces: Workspace[]; projects: Project[]; workspace: Workspace | null; project: Project | null;
  loading: boolean; error: string; ready: boolean;
  refresh(selection?: Selection, options?: { requireExact: boolean }): Promise<boolean>;
  selectWorkspace(id: string): Promise<void>;
  selectProject(id: string): void;
}
const CollaborationContext = createContext<CollaborationContextValue | null>(null);

export function CollaborationProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const accountId = account.state.status === 'signed_in' && account.state.user?.emailVerified ? account.state.user.id : null;
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const selectionRef = useRef(selection);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const currentAccount = useRef(accountId);
  currentAccount.current = accountId;

  const refresh = useCallback(async (preferred?: Selection, options?: { requireExact: boolean }) => {
    if (!accountId) return false;
    const ticket = ++generation.current;
    const desired = preferred ?? selectionRef.current;
    setLoading(true); setError('');
    try {
      const result = await collaborationRequest({ operation: 'listWorkspaces' });
      if (result.kind !== 'workspaces') throw new Error('Invalid workspace response.');
      if (options?.requireExact && preferred?.workspaceId && preferred.projectId && !result.items.some(item => item.id === preferred.workspaceId)) throw new Error('This workspace is no longer available. Search again.');
      const workspace = result.items.find(item => item.id === desired.workspaceId) ?? result.items[0];
      let nextProjects: Project[] = [];
      if (workspace) {
        const response = await collaborationRequest({ operation: 'listProjects', workspaceId: workspace.id });
        if (response.kind !== 'projects') throw new Error('Invalid project response.');
        nextProjects = response.items;
      }
      if (options?.requireExact && preferred?.projectId && preferred.workspaceId && !nextProjects.some(item => item.id === preferred.projectId)) throw new Error('This project is no longer available. Search again.');
      if (ticket !== generation.current || currentAccount.current !== accountId) return false;
      const next = { workspaceId: workspace?.id ?? null, projectId: nextProjects.find(item => item.id === desired.projectId)?.id ?? nextProjects[0]?.id ?? null };
      setWorkspaces(result.items); setProjects(nextProjects); setSelection(next); selectionRef.current = next; saveSelection(accountId, next);
      return true;
    } catch (cause) {
      if (ticket !== generation.current || currentAccount.current !== accountId) return false;
      // Do not retain data from a possibly revoked workspace when its refresh fails.
      setWorkspaces([]); setProjects([]); setSelection(emptySelection); selectionRef.current = emptySelection; setError(errorMessage(cause));
      if (options?.requireExact && preferred?.workspaceId && preferred.projectId) throw cause;
      return false;
    } finally { if (ticket === generation.current && currentAccount.current === accountId) setLoading(false); }
  }, [accountId]);

  useEffect(() => {
    ++generation.current; setWorkspaces([]); setProjects([]); setSelection(emptySelection); selectionRef.current = emptySelection; setError(''); setLoading(false);
    if (accountId) void refresh(readSelection(accountId));
    return () => { ++generation.current; };
  }, [accountId, refresh]);
  useEffect(() => {
    const onFocus = () => { if (accountId) void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [accountId, refresh]);

  async function selectWorkspace(id: string) { if (!workspaces.some(item => item.id === id)) return; await refresh({ workspaceId: id, projectId: null }); }
  function selectProject(id: string) {
    if (!accountId || !projects.some(item => item.id === id)) return;
    const next = { workspaceId: selection.workspaceId, projectId: id };
    setSelection(next); selectionRef.current = next; saveSelection(accountId, next);
  }
  const workspace = workspaces.find(item => item.id === selection.workspaceId) ?? null;
  const project = projects.find(item => item.id === selection.projectId) ?? null;
  return <CollaborationContext.Provider value={{ workspaces, projects, workspace, project, loading, error, ready: Boolean(accountId), refresh, selectWorkspace, selectProject }}>{children}</CollaborationContext.Provider>;
}

export function useCollaboration() {
  const context = useContext(CollaborationContext);
  if (!context) throw new Error('Workspace context is missing.');
  return context;
}

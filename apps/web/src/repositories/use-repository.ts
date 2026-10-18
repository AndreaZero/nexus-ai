import { useCallback, useEffect, useRef, useState } from 'react';
import type { GitRequest, GitSnapshot, RepositoriesRequest, RepositorySnapshot } from '@nexus-ai/contracts';
import { useRealtime } from '../realtime/RealtimeProvider.js';
import { useAccount } from '../auth/AuthProvider.js';
import { useCollaboration } from '../collaboration/CollaborationProvider.js';
import { gitRequest, repositoryRequest, RepositoryFailure, githubUrl } from './client.js';

export function useRepositoryScope() {
  const { project } = useCollaboration(); const account = useAccount(); const realtime = useRealtime().state;
  const user = account.state.status === 'signed_in' && account.state.user?.emailVerified ? account.state.user.id : null;
  const role = realtime.presence.find(member => member.userId === user)?.role ?? project?.role;
  const allowed = Boolean(user && project?.repository && (role === 'owner' || role === 'developer'));
  const online = allowed && realtime.projectId === project?.id && realtime.connection === 'online';
  return { project, role, allowed, online, key: `${user}:${project?.id}:${project?.repository?.id}:${project?.repository?.remoteUrl}:${role}` };
}
export function useRepositoryData() {
  const scope = useRepositoryScope(); const projectId = scope.project?.id ?? ''; const repositoryId = scope.project?.repository?.id ?? '';
  const [remote, setRemote] = useState<RepositorySnapshot | null>(null); const [local, setLocal] = useState<GitSnapshot | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [denied, setDenied] = useState(false);
  const active = useRef(true); const generation = useRef(0); const current = useRef(''); const next = `${scope.key}:${scope.online}`;
  if (current.current !== next) { current.current = next; ++generation.current; }
  const receipts = useRef(new Map<string, string>());
  const discardDenied = useCallback((cause: unknown, ticket: number) => {
    if (active.current && ticket === generation.current && cause instanceof RepositoryFailure && ['auth_required', 'forbidden', 'not_connected', 'not_found'].includes(cause.code)) { ++generation.current; setRemote(null); setLocal(null); setDenied(true); setBusy(false); setError(cause.message); }
  }, []);
  useEffect(() => { active.current = true; return () => { active.current = false; ++generation.current; }; }, []);
  const request = useCallback(async (input: RepositoriesRequest) => {
    if (!scope.online || input.projectId !== projectId || input.repositoryId !== repositoryId) throw new Error('Reconnect to verify repository access.');
    const ticket = generation.current; let result;
    try { result = await repositoryRequest(input); } catch (cause) { discardDenied(cause, ticket); throw cause; }
    if (!active.current || ticket !== generation.current) throw new Error('Repository access changed. Reopen this view.');
    setDenied(false);
    if (result.kind === 'snapshot') setRemote(result.snapshot);
    return result;
  }, [scope.online, projectId, repositoryId, discardDenied]);
  const mutate = useCallback(async (input: RepositoriesRequest) => {
    const signature = JSON.stringify({ ...input, requestId: '' }); let requestId = receipts.current.get(signature);
    if (!requestId) { if (receipts.current.size >= 64) receipts.current.delete(receipts.current.keys().next().value!); requestId = crypto.randomUUID(); receipts.current.set(signature, requestId); }
    const result = await request('requestId' in input ? { ...input, requestId } : input); receipts.current.delete(signature); return result;
  }, [request]);
  const git = useCallback(async (input: GitRequest) => {
    if (!scope.online || input.projectId !== projectId || input.repositoryId !== repositoryId) throw new Error('Reconnect to verify repository access.');
    const ticket = generation.current; let result;
    try { result = await gitRequest(input); } catch (cause) { discardDenied(cause, ticket); throw cause; }
    if (!active.current || ticket !== generation.current) throw new Error('Repository access changed. Refresh before continuing.');
    setDenied(false);
    setLocal(result.snapshot); setNotice(result.notice ?? ''); return result;
  }, [scope.online, projectId, repositoryId, discardDenied]);
  async function run(action: () => Promise<unknown>) {
    if (busy || !scope.online) return false; const ticket = generation.current; setBusy(true); setError(''); setNotice('');
    try { await action(); return active.current && ticket === generation.current; }
    catch (cause) { if (active.current && ticket === generation.current) setError(cause instanceof Error ? cause.message : 'Repository unavailable. Retry.'); return false; }
    finally { if (active.current && ticket === generation.current) setBusy(false); }
  }
  useEffect(() => { setRemote(null); setLocal(null); setError(''); setNotice(''); setBusy(false); if (!scope.online || !githubUrl(scope.project?.repository?.remoteUrl)) return; let live = true; setBusy(true); void request({ operation: 'snapshot', projectId, repositoryId, page: 1 }).catch(cause => { if (live) setError(cause instanceof Error ? cause.message : 'Repository unavailable.'); }).finally(() => { if (live) setBusy(false); }); return () => { live = false; }; }, [scope.online, scope.project?.repository?.remoteUrl, projectId, repositoryId, request]);
  return { ...scope, projectId, repositoryId, remote: scope.online && !denied ? remote : null, local: scope.online && !denied ? local : null, denied, busy, error, notice, run, request, mutate, git };
}
export type RepositoryData = ReturnType<typeof useRepositoryData>;

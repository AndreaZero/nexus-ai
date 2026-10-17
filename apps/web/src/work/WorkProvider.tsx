import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { WorkItem, WorkKind, WorkRequest } from '@nexus-ai/contracts';
import { useAccount } from '../auth/AuthProvider.js';
import { useCollaboration } from '../collaboration/CollaborationProvider.js';
import { useRealtime } from '../realtime/RealtimeProvider.js';
import { workRequest, WorkFailure } from './client.js';
import { mergeWork } from './state.js';

interface Value { projectId: string | null; view: 'auto' | 'client'; role: string | undefined; technical: boolean; client: boolean; online: boolean; revision: number; invalidate(): void; request(input: WorkRequest, signal?: AbortSignal): ReturnType<typeof workRequest>; mutate(input: WorkRequest): ReturnType<typeof workRequest> }
const Context = createContext<Value | null>(null);
export function WorkProvider({ children, view = 'auto' }: { children: ReactNode; view?: 'auto' | 'client' }) {
  const account = useAccount(); const { project } = useCollaboration(); const realtime = useRealtime().state;
  const user = account.state.status === 'signed_in' && account.state.user?.emailVerified ? account.state.user.id : null;
  const role = realtime.presence.find(member => member.userId === user)?.role ?? project?.role;
  const technical = role === 'owner' || role === 'developer'; const audience = technical ? view : 'client';
  const online = Boolean(user && project && realtime.projectId === project.id && realtime.connection === 'online');
  return <WorkScope key={`${user}:${project?.id}:${role}:${audience}`} projectId={user ? project?.id ?? null : null} role={role} technical={technical && audience !== 'client'} client={role === 'client'} view={audience} online={online}>{children}</WorkScope>;
}
function WorkScope({ children, ...scope }: Omit<Value, 'revision' | 'invalidate' | 'request' | 'mutate'> & { children: ReactNode }) {
  const realtime = useRealtime().state; const [revision, bump] = useState(0); const active = useRef(true); const initial = useRef(realtime.cursor); const last = useRef(0); const queued = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const connection = useRef(scope.online); const generation = useRef(0); if (connection.current !== scope.online) { connection.current = scope.online; ++generation.current; }
  const invalidate = useCallback(() => { last.current = Date.now(); bump(value => value + 1); }, []);
  useEffect(() => { active.current = true; const refresh = () => invalidate(); window.addEventListener('nexus:work-changed', refresh); return () => { active.current = false; window.removeEventListener('nexus:work-changed', refresh); clearTimeout(queued.current); }; }, [invalidate]);
  useEffect(() => { if (!scope.online || realtime.cursor === initial.current) return; initial.current = realtime.cursor; clearTimeout(queued.current); queued.current = setTimeout(invalidate, Math.max(0, 1500 - (Date.now() - last.current))); }, [realtime.cursor, scope.online, invalidate]);
  const request = useCallback(async (input: WorkRequest, signal?: AbortSignal) => {
    if (!scope.online || input.projectId !== scope.projectId || !active.current) throw new Error('Reconnect to verify current project access.');
    const ticket = generation.current; const result = await workRequest(input, signal);
    if (!active.current || !connection.current || ticket !== generation.current) throw new Error('The project connection or audience changed. Reopen this item.');
    if ('requestId' in input) window.dispatchEvent(new Event('nexus:work-changed'));
    return result;
  }, [scope.online, scope.projectId]);
  const receipts = useRef(new Map<string, string>());
  const mutate = useCallback(async (input: WorkRequest) => {
    const signature = JSON.stringify({ ...input, requestId: '' }); let requestId = receipts.current.get(signature);
    if (!requestId) { if (receipts.current.size >= 128) receipts.current.delete(receipts.current.keys().next().value!); requestId = crypto.randomUUID(); receipts.current.set(signature, requestId); }
    const result = await request({ ...input, requestId } as WorkRequest); receipts.current.delete(signature); return result;
  }, [request]);
  return <Context.Provider value={{ ...scope, revision, invalidate, request, mutate }}>{children}</Context.Provider>;
}
export function useWork() { const value = useContext(Context); if (!value) throw new Error('Work context is missing.'); return value; }
export function useWorkList(kind: WorkKind, targetKind: WorkItem['targetKind'] = null, targetId: string | null = null) {
  const work = useWork(); const [items, setItems] = useState<WorkItem[]>([]); const [total, setTotal] = useState(0); const [next, setNext] = useState<number | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const generation = useRef(0); const abort = useRef<AbortController | null>(null);
  const load = useCallback(async (offset = 0) => {
    if (!work.projectId || !work.online) return; const ticket = ++generation.current; abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setLoading(true); setError(''); if (!offset) { setItems([]); setNext(null); }
    try { const result = await work.request({ operation: 'list', projectId: work.projectId, view: work.view, kind, offset, limit: 100, targetKind, targetId }, controller.signal); if (ticket !== generation.current) return; if (result.kind !== 'list') throw new Error('Unexpected work response.'); setItems(previous => offset ? mergeWork(previous, result.items) : result.items); setTotal(result.total); setNext(result.nextOffset); }
    catch (cause) { if (ticket === generation.current) { setItems([]); setTotal(0); setNext(null); setError(cause instanceof Error ? cause.message : 'Project work unavailable.'); } }
    finally { if (ticket === generation.current) setLoading(false); }
  }, [work.projectId, work.view, work.online, work.request, kind, targetKind, targetId]);
  useEffect(() => { void load(); return () => { ++generation.current; abort.current?.abort(); }; }, [load, work.revision]);
  return { items: work.online ? items : [], total: work.online ? total : 0, loading, error, more: next !== null, loadMore: () => { if (next !== null) void load(next); }, refresh: () => { void load(); } };
}
// A retry of an unchanged form keeps its receipt ID. Editing the payload starts a new command.
export function useWorkMutation() {
  const work = useWork(); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [conflict, setConflict] = useState(false);
  async function run(input: WorkRequest) {
    if (busy) return null;
    setBusy(true); setError(''); setConflict(false);
    try { return await work.mutate(input); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The change could not be saved. Retry.'); setConflict(cause instanceof WorkFailure && cause.code === 'conflict'); return null; }
    finally { setBusy(false); }
  }
  return { run, busy, error, conflict };
}

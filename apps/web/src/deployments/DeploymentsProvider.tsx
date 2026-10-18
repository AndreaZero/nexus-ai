import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { DeploymentsRequest, DeploymentsSnapshot } from '@nexus-ai/contracts';
import { useAccount } from '../auth/AuthProvider.js';
import { useCollaboration } from '../collaboration/CollaborationProvider.js';
import { useRealtime } from '../realtime/RealtimeProvider.js';
import { deploymentRequest } from './client.js';
import { currentHealth } from './state.js';
import './deployments.css';
interface Value { projectId: string | null; view: 'auto' | 'client'; role: string | undefined; online: boolean; snapshot: DeploymentsSnapshot | null; loading: boolean; error: string; refresh(): void; more(): void; request(input: DeploymentsRequest): ReturnType<typeof deploymentRequest>; mutate(input: DeploymentsRequest): ReturnType<typeof deploymentRequest> }
const Context = createContext<Value | null>(null);
export function DeploymentsProvider({ children, view = 'auto' }: { children: ReactNode; view?: 'auto' | 'client' }) {
  const account = useAccount(); const { project } = useCollaboration(); const realtime = useRealtime().state;
  const user = account.state.status === 'signed_in' && account.state.user?.emailVerified ? account.state.user.id : null;
  const role = realtime.presence.find(item => item.userId === user)?.role ?? project?.role;
  const audience = role === 'owner' || role === 'developer' ? view : 'client';
  const online = Boolean(user && project && realtime.projectId === project.id && realtime.connection === 'online');
  return <Scope key={`${user}:${project?.id}:${role}:${audience}`} projectId={user ? project?.id ?? null : null} role={role} view={audience} online={online}>{children}</Scope>;
}
function Scope({ children, projectId, role, view, online }: Pick<Value, 'projectId' | 'role' | 'view' | 'online'> & { children: ReactNode }) {
  const realtime = useRealtime().state; const [snapshot, setSnapshot] = useState<DeploymentsSnapshot | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [clock, setClock] = useState(Date.now());
  const active = useRef(true); const onlineRef = useRef(online); const generation = useRef(0); const readTicket = useRef(0); const abort = useRef<AbortController | null>(null); const snapshotRef = useRef(snapshot); snapshotRef.current = snapshot;
  if (onlineRef.current !== online) { onlineRef.current = online; ++generation.current; ++readTicket.current; }
  useEffect(() => { active.current = true; return () => { active.current = false; ++generation.current; abort.current?.abort(); }; }, []);
  const request = useCallback(async (input: DeploymentsRequest) => { if (!onlineRef.current || input.projectId !== projectId || !active.current) throw new Error('Reconnect to verify current project access.'); const ticket = generation.current; const result = await deploymentRequest(input); if (!active.current || !onlineRef.current || ticket !== generation.current) throw new Error('Project access changed. Reopen this record.'); return result; }, [projectId]);
  const load = useCallback(async (offset = 0) => {
    if (!online || !projectId) return; const ticket = ++readTicket.current; const scope = generation.current; abort.current?.abort(); const controller = new AbortController(); abort.current = controller; setLoading(true); setError('');
    try { const result = await deploymentRequest({ operation: 'snapshot', projectId, view, offset, limit: 100 }, controller.signal); if (!active.current || !onlineRef.current || scope !== generation.current || ticket !== readTicket.current) return; if (result.kind !== 'snapshot') throw new Error('Unexpected deployment snapshot.'); const next = result.snapshot; setSnapshot(previous => offset && previous ? { ...next, deployments: [...previous.deployments, ...next.deployments.filter(item => !previous.deployments.some(old => old.id === item.id))].slice(0, 1000) } : next); setClock(Date.now()); }
    catch (cause) { if (active.current && ticket === readTicket.current) { setSnapshot(null); setError(cause instanceof Error ? cause.message : 'Deployments unavailable. Retry.'); } }
    finally { if (active.current && ticket === readTicket.current) setLoading(false); }
  }, [online, projectId, view]);
  const refresh = useCallback(() => { void load(); }, [load]);
  useEffect(() => { refresh(); return () => { ++readTicket.current; abort.current?.abort(); }; }, [refresh]);
  const cursor = useRef(realtime.cursor); const last = useRef(0);
  useEffect(() => { if (!online || cursor.current === realtime.cursor) return; cursor.current = realtime.cursor; const timer = setTimeout(() => { last.current = Date.now(); refresh(); }, Math.max(0, 1500 - (Date.now() - last.current))); return () => clearTimeout(timer); }, [online, realtime.cursor, refresh]);
  useEffect(() => { window.addEventListener('nexus:deployments-changed', refresh); return () => window.removeEventListener('nexus:deployments-changed', refresh); }, [refresh]);
  // One deadline per next expiry; never probes or polls an environment.
  useEffect(() => { if (!snapshot || !online) return; const deadlines = snapshot.health.flatMap(item => item.observations.map(row => Date.parse(row.expiresAt))).filter(time => time > clock); if (!deadlines.length) return; const timer = setTimeout(() => setClock(Date.now()), Math.min(2147483647, Math.max(1, Math.min(...deadlines) - Date.now() + 5))); return () => clearTimeout(timer); }, [snapshot, clock, online]);
  const receipts = useRef(new Map<string, string>());
  const mutate = useCallback(async (input: DeploymentsRequest) => { const signature = JSON.stringify({ ...input, requestId: '' }); let requestId = receipts.current.get(signature); if (!requestId) { if (receipts.current.size >= 128) receipts.current.delete(receipts.current.keys().next().value!); requestId = crypto.randomUUID(); receipts.current.set(signature, requestId); } const result = await request({ ...input, requestId } as DeploymentsRequest); receipts.current.delete(signature); window.dispatchEvent(new Event('nexus:deployments-changed')); return result; }, [request]);
  const visible = online && snapshot ? { ...snapshot, health: snapshot.health.map(item => currentHealth(item, Math.max(clock, Date.now()))) } : null;
  return <Context.Provider value={{ projectId, role, view, online, snapshot: visible, loading: online && loading, error, refresh, more: () => { if (snapshotRef.current?.nextOffset !== null && snapshotRef.current?.nextOffset !== undefined) void load(snapshotRef.current.nextOffset); }, request, mutate }}>{children}</Context.Provider>;
}
export function useDeployments() { const value = useContext(Context); if (!value) throw new Error('Deployments context is missing.'); return value; }

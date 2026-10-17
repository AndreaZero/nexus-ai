import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { OverviewActivity, OverviewFilter, OverviewSnapshot } from '@nexus-ai/contracts';
import { useAccount } from '../auth/AuthProvider.js';
import { useCollaboration } from '../collaboration/CollaborationProvider.js';
import { useRealtime } from '../realtime/RealtimeProvider.js';
import { overviewRequest } from './client.js';
import { activityChanged, mergeActivity, retainAuthorized } from './state.js';
interface Value { snapshot: OverviewSnapshot | null; activity: OverviewActivity[]; filter: OverviewFilter; loading: boolean; error: string; pending: boolean; more: boolean; setFilter(value: OverviewFilter): void; refresh(): void; apply(): void; loadMore(): void; markRead(through: string): Promise<void>; }
const Context = createContext<Value | null>(null);
export function OverviewProvider({ children }: { children: ReactNode }) {
  const account = useAccount(); const { project } = useCollaboration();
  const { state: realtime } = useRealtime();
  const user = account.state.status === 'signed_in' && account.state.user?.emailVerified ? account.state.user.id : null;
  const liveRole = realtime.presence.find(member => member.userId === user)?.role ?? project?.role;
  return <Scope key={`${user}:${project?.id}:${project?.role}:${liveRole}`} projectId={user ? project?.id ?? null : null}>{children}</Scope>;
}
function Scope({ children, projectId }: { children: ReactNode; projectId: string | null }) {
  const { state: realtime } = useRealtime();
  const online = Boolean(projectId && realtime.projectId === projectId && realtime.connection === 'online');
  const [snapshot, setSnapshot] = useState<OverviewSnapshot | null>(null); const [activity, setActivity] = useState<OverviewActivity[]>([]);
  const [filter, setFilter] = useState<OverviewFilter>('all'); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [pending, setPending] = useState(false); const [before, setBefore] = useState<string | null>(null); const [refreshVersion, setRefresh] = useState(0);
  const live = useRef(false); const generation = useRef(0); const sequence = useRef(0); const rows = useRef(activity); rows.current = activity;
  const allowed = useRef(online); allowed.current = online; const latest = useRef<OverviewSnapshot | null>(null); const first = useRef(true); const busy = useRef(false); const lastFetch = useRef(0);
  const abort = useRef<AbortController | null>(null); const queued = useRef(false); const followup = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const load = useCallback(async function read(page: string | null = null): Promise<void> {
    if (!projectId || !allowed.current) return;
    if (busy.current) { if (!page) queued.current = true; return; }
    const controller = new AbortController(); abort.current = controller;
    const scope = generation.current; const ticket = ++sequence.current; busy.current = true; setLoading(true); setError(''); lastFetch.current = Date.now();
    try {
      const result = await overviewRequest({ operation: 'snapshot', projectId, filter, before: page, limit: 30 }, controller.signal);
      if (!live.current || scope !== generation.current || !allowed.current || ticket !== sequence.current || result.kind !== 'overview') return;
      const retained = retainAuthorized(rows.current, result.snapshot.authorizedTargets);
      rows.current = retained;
      if (page) {
        setActivity(mergeActivity(retained, result.snapshot.activity)); setBefore(result.snapshot.nextBefore); setSnapshot(result.snapshot);
        if (latest.current) { if (BigInt(result.snapshot.cursor) > BigInt(latest.current.cursor)) queued.current = true; latest.current = { ...latest.current, activity: retainAuthorized(latest.current.activity, result.snapshot.authorizedTargets), authorizedTargets: result.snapshot.authorizedTargets }; }
      }
      else {
        latest.current = result.snapshot; setSnapshot(result.snapshot);
        if (first.current) { first.current = false; setActivity(result.snapshot.activity); setBefore(result.snapshot.nextBefore); setPending(false); }
        else { setActivity(retained); setPending(activityChanged(retained, result.snapshot.activity)); }
      }
    } catch (cause) { if (live.current && scope === generation.current && allowed.current) { setError(cause instanceof Error ? cause.message : 'Overview unavailable. Retry.'); setSnapshot(null); latest.current = null; setActivity([]); first.current = true; setPending(false); } }
    finally { if (scope === generation.current) { busy.current = false; if (live.current) { setLoading(false); if (queued.current) { queued.current = false; followup.current = setTimeout(() => { void read(); }, Math.max(0, 1500 - (Date.now() - lastFetch.current))); } } } }
  }, [projectId, filter]);
  useEffect(() => { live.current = true; return () => { live.current = false; ++generation.current; abort.current?.abort(); clearTimeout(followup.current); }; }, []);
  useEffect(() => {
    ++generation.current; ++sequence.current; abort.current?.abort(); clearTimeout(followup.current); queued.current = false; busy.current = false; first.current = true; latest.current = null; setSnapshot(null); setActivity([]); setPending(false); setBefore(null); setError('');
    if (online) void load();
  }, [online, filter, projectId, refreshVersion, load]);
  useEffect(() => {
    if (!online || !realtime.cursor) return;
    const timer = window.setTimeout(() => { if (!latest.current || BigInt(realtime.cursor!) > BigInt(latest.current.cursor)) void load(); }, Math.max(0, 1500 - (Date.now() - lastFetch.current)));
    return () => window.clearTimeout(timer);
  }, [online, realtime.cursor, load]);
  async function markRead(through: string) {
    if (!online || !projectId) return; const scope = generation.current;
    try { const result = await overviewRequest({ operation: 'markRead', projectId, through }); if (live.current && allowed.current && scope === generation.current && result.kind === 'read') setSnapshot(previous => previous ? { ...previous, readThrough: result.readThrough, unreadCount: result.unreadCount } : null); }
    catch (cause) { if (live.current && scope === generation.current) setError(cause instanceof Error ? cause.message : 'Read state could not be saved. Retry.'); }
  }
  function apply() { if (latest.current) { setActivity(latest.current.activity); setBefore(latest.current.nextBefore); setPending(false); } }
  return <Context.Provider value={{ snapshot: online ? snapshot : null, activity: online ? activity : [], filter, loading, error, pending: online && pending, more: online && Boolean(before) && activity.length < 500, setFilter, refresh: () => setRefresh(value => value + 1), apply, loadMore: () => { if (before) void load(before); }, markRead }}>{children}</Context.Provider>;
}
export function useOverview() { const value = useContext(Context); if (!value) throw new Error('Overview context is missing.'); return value; }

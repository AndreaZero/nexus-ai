import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { OverviewActivity, OverviewFilter, PulseSnapshot } from '@nexus-ai/contracts';
import { useRealtime } from '../realtime/RealtimeProvider.js';
import { activityChanged, mergeActivity, retainAuthorized } from '../overview/state.js';
import { pulseRequest } from './client.js';
interface Value { snapshot: PulseSnapshot | null; activity: OverviewActivity[]; filter: OverviewFilter; scope: 'project' | 'mine'; loading: boolean; error: string; pending: boolean; more: boolean; setFilter(value: OverviewFilter): void; setScope(value: 'project' | 'mine'): void; refresh(): void; apply(): void; loadMore(): void; }
const Context = createContext<Value | null>(null);
// This provider is mounted by the Pulse route only. Account/project/role/view changes remount it.
export function PulseProvider({ children, projectId, view }: { children: ReactNode; projectId: string | null; view: 'auto' | 'client' }) {
  const { state: realtime } = useRealtime();
  const online = Boolean(projectId && realtime.projectId === projectId && realtime.connection === 'online');
  const [snapshot, setSnapshot] = useState<PulseSnapshot | null>(null); const [activity, setActivity] = useState<OverviewActivity[]>([]);
  const [filter, setFilter] = useState<OverviewFilter>('all'); const [scope, setScope] = useState<'project' | 'mine'>('project');
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [pending, setPending] = useState(false); const [before, setBefore] = useState<string | null>(null); const [refreshVersion, setRefresh] = useState(0);
  const live = useRef(false); const generation = useRef(0); const rows = useRef(activity); rows.current = activity;
  const allowed = useRef(online); allowed.current = online; const latest = useRef<PulseSnapshot | null>(null); const first = useRef(true); const busy = useRef(false); const lastFetch = useRef(0);
  const abort = useRef<AbortController | null>(null); const queued = useRef(false); const followup = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const load = useCallback(async function read(page: string | null = null): Promise<void> {
    if (!projectId || !allowed.current) return;
    if (busy.current) { if (!page) queued.current = true; return; }
    const controller = new AbortController(); abort.current = controller;
    const ticket = generation.current; busy.current = true; setLoading(true); setError(''); lastFetch.current = Date.now();
    try {
      const result = await pulseRequest({ operation: 'snapshot', projectId, view, scope, filter, before: page, limit: 30 }, controller.signal);
      if (!live.current || ticket !== generation.current || !allowed.current) return;
      const retained = retainAuthorized(rows.current, result.overview.authorizedTargets); rows.current = retained;
      setSnapshot(result);
      if (page) {
        const merged = mergeActivity(retained, result.overview.activity); rows.current = merged; setActivity(merged); setBefore(result.overview.nextBefore);
        if (latest.current) { if (BigInt(result.overview.cursor) > BigInt(latest.current.overview.cursor)) queued.current = true; latest.current = { ...latest.current, overview: { ...latest.current.overview, activity: retainAuthorized(latest.current.overview.activity, result.overview.authorizedTargets), authorizedTargets: result.overview.authorizedTargets } }; }
      } else {
        latest.current = result;
        if (first.current) { first.current = false; rows.current = result.overview.activity; setActivity(result.overview.activity); setBefore(result.overview.nextBefore); setPending(false); }
        else { setActivity(retained); setPending(activityChanged(retained, result.overview.activity)); }
      }
    } catch (cause) {
      if (live.current && ticket === generation.current && allowed.current) { setError(cause instanceof Error ? cause.message : 'Pulse unavailable. Retry.'); setSnapshot(null); latest.current = null; rows.current = []; setActivity([]); first.current = true; setPending(false); }
    } finally {
      if (ticket === generation.current) { busy.current = false; if (live.current) { setLoading(false); if (queued.current) { queued.current = false; followup.current = setTimeout(() => { void read(); }, Math.max(0, 1500 - (Date.now() - lastFetch.current))); } } }
    }
  }, [projectId, view, scope, filter]);
  useEffect(() => { live.current = true; return () => { live.current = false; ++generation.current; abort.current?.abort(); clearTimeout(followup.current); }; }, []);
  useEffect(() => {
    ++generation.current; abort.current?.abort(); clearTimeout(followup.current); queued.current = false; busy.current = false; first.current = true; latest.current = null; rows.current = []; setSnapshot(null); setActivity([]); setPending(false); setBefore(null); setError(''); setLoading(false);
    if (online) void load();
  }, [online, filter, scope, projectId, refreshVersion, load]);
  useEffect(() => {
    if (!online || !realtime.cursor) return;
    const timer = window.setTimeout(() => { if (!latest.current || BigInt(realtime.cursor!) > BigInt(latest.current.overview.cursor)) void load(); }, Math.max(0, 1500 - (Date.now() - lastFetch.current)));
    return () => window.clearTimeout(timer);
  }, [online, realtime.cursor, load]);
  // UTC summary rolls over even when the project has no new socket events.
  useEffect(() => {
    if (!online) return;
    const now = new Date(); const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    const timer = window.setTimeout(() => setRefresh(value => value + 1), next - now.getTime() + 100);
    const visible = () => { if (!document.hidden && latest.current && Date.now() >= Date.parse(latest.current.summary.dayEnd)) setRefresh(value => value + 1); };
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [online, snapshot?.summary.dayStart]);
  function apply() { if (latest.current) { rows.current = latest.current.overview.activity; setActivity(rows.current); setBefore(latest.current.overview.nextBefore); setPending(false); } }
  return <Context.Provider value={{ snapshot: online ? snapshot : null, activity: online ? activity : [], filter, scope, loading, error, pending: online && pending, more: online && Boolean(before) && activity.length < 500, setFilter, setScope, refresh: () => setRefresh(value => value + 1), apply, loadMore: () => { if (before) void load(before); } }}>{children}</Context.Provider>;
}
export function usePulse() { const value = useContext(Context); if (!value) throw new Error('Pulse context is missing.'); return value; }

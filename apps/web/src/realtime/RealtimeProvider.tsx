import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { realtimeResponseSchema, realtimeStateSchema } from '@nexus-ai/contracts';
import type { LiveShare, RealtimeRequest, RealtimeState } from '@nexus-ai/contracts';
import { useAccount } from '../auth/AuthProvider.js';
import { accountServerUrl } from '../auth/configuration.js';
import { useCollaboration } from '../collaboration/CollaborationProvider.js';
import { BrowserRealtime } from './browser.js';
import { emptyRealtime } from './state.js';
interface RealtimeValue { state: RealtimeState; request(input: RealtimeRequest): Promise<LiveShare | null>; }
const Context = createContext<RealtimeValue | null>(null);
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const account = useAccount(); const { project } = useCollaboration();
  const userId = account.state.status === 'signed_in' && account.state.user?.emailVerified ? account.state.user.id : null;
  return <Scope key={`${userId}:${project?.id}:${project?.role}`} projectId={userId ? project?.id ?? null : null}>{children}</Scope>;
}
function Scope({ children, projectId }: { children: ReactNode; projectId: string | null }) {
  const [state, setState] = useState<RealtimeState>(emptyRealtime); const browser = useRef<BrowserRealtime | null>(null); const active = useRef(true); const revision = useRef(0); const generation = useRef(0);
  useEffect(() => {
    active.current = true; const scope = ++generation.current;
    if (!projectId) return () => { active.current = false; };
    if (window.nexusDesktop?.realtime) {
      const accept = (value: unknown) => { const result = realtimeStateSchema.safeParse(value); if (active.current && scope === generation.current && result.success && result.data.projectId === projectId) { ++revision.current; setState(result.data); } };
      const unsubscribe = window.nexusDesktop.realtime.onStateChanged(accept);
      const startRevision = revision.current;
      void window.nexusDesktop.realtime.request({ operation: 'connect', projectId }).then(value => { const result = realtimeResponseSchema.parse(value); if (revision.current === startRevision) accept(result.state); }).catch(() => { if (active.current && scope === generation.current && revision.current === startRevision) setState({ ...emptyRealtime(), projectId, connection: 'offline', notice: 'The realtime service is unavailable. Retry the connection.' }); });
      return () => { active.current = false; unsubscribe(); void window.nexusDesktop?.realtime.request({ operation: 'disconnect' }).catch(() => {}); };
    }
    const server = accountServerUrl();
    if (!server) { setState({ ...emptyRealtime(), projectId, connection: 'offline', notice: 'Configure the account server to connect.' }); return () => { active.current = false; }; }
    const client = new BrowserRealtime(server, projectId, value => { if (active.current) setState(value); }); browser.current = client; client.connect();
    return () => { active.current = false; client.stop(); browser.current = null; };
  }, [projectId]);
  const request = useCallback(async (input: RealtimeRequest) => {
    if (!projectId) throw new Error('Select an authorized project first.');
    if (window.nexusDesktop?.realtime) {
      const startRevision = revision.current; const scope = generation.current;
      const result = realtimeResponseSchema.parse(await window.nexusDesktop.realtime.request(input));
      if (!active.current || scope !== generation.current) return null;
      if (result.state.projectId === projectId && revision.current === startRevision) setState(result.state);
      if (!result.ok) throw new Error(result.message);
      return result.share;
    }
    if (input.operation === 'readShare' && input.projectId === projectId) return browser.current?.read(input.shareId) ?? null;
    if (input.operation === 'retry') { browser.current?.retry(); return null; }
    throw new Error('Local session sharing requires the desktop app.');
  }, [projectId]);
  return <Context.Provider value={{ state, request }}>{children}</Context.Provider>;
}
export function useRealtime() { const value = useContext(Context); if (!value) throw new Error('Realtime context is missing.'); return value; }

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { defaultApplicationPreferences } from '@nexus-ai/contracts';
import type { ApplicationPreferences, ApplicationSettings } from '@nexus-ai/contracts';
import { useAccount } from '../auth/AuthProvider.js';
import { applicationRequest } from './client.js';

interface Value { settings: ApplicationSettings | null; preferences: ApplicationPreferences; loading: boolean; saving: boolean; error: string; online: boolean; refresh(): void; save(input: Pick<ApplicationSettings, 'name' | 'preferences'>, expectedVersion: number): Promise<boolean>; }
const Context = createContext<Value | null>(null);
export function ApplicationProvider({ children }: { children: ReactNode }) {
  const account = useAccount(); const userId = account.state.status === 'signed_in' && account.state.user?.emailVerified ? account.state.user.id : null;
  return <Scope key={userId ?? 'signed-out'} enabled={Boolean(userId)}>{children}</Scope>;
}
function Scope({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [settings, setSettings] = useState<ApplicationSettings | null>(null); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [connected, setConnected] = useState(navigator.onLine); const [revision, setRevision] = useState(0);
  const generation = useRef(0); const live = useRef(false); const online = enabled && connected; const allowed = useRef(online); allowed.current = online;
  useEffect(() => { live.current = true; const update = () => setConnected(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { live.current = false; ++generation.current; window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  useEffect(() => {
    const ticket = ++generation.current; const controller = new AbortController(); setSettings(null); setError(''); setLoading(false); setSaving(false);
    if (online) { setLoading(true); void applicationRequest({ operation: 'getSettings' }, controller.signal).then(result => { if (live.current && ticket === generation.current && allowed.current && result.kind === 'settings') setSettings(result.settings); }).catch(cause => { if (live.current && ticket === generation.current && allowed.current) setError(cause instanceof Error ? cause.message : 'Settings are unavailable. Retry.'); }).finally(() => { if (live.current && ticket === generation.current) setLoading(false); }); }
    return () => controller.abort();
  }, [online, revision]);
  const save = useCallback(async (input: Pick<ApplicationSettings, 'name' | 'preferences'>, expectedVersion: number) => {
    if (!allowed.current || saving) return false;
    const ticket = generation.current; setSaving(true); setError('');
    try { const result = await applicationRequest({ operation: 'saveSettings', expectedVersion, ...input }); if (live.current && ticket === generation.current && allowed.current && result.kind === 'settings') { setSettings(result.settings); return true; } }
    catch (cause) { if (live.current && ticket === generation.current) setError(cause instanceof Error ? cause.message : 'Settings could not be saved. Retry.'); }
    finally { if (live.current && ticket === generation.current) setSaving(false); }
    return false;
  }, [saving]);
  return <Context.Provider value={{ settings: online ? settings : null, preferences: online && settings ? settings.preferences : defaultApplicationPreferences, loading, saving, error, online, refresh: () => setRevision(value => value + 1), save }}>{children}</Context.Provider>;
}
export function useApplication() { const value = useContext(Context); if (!value) throw new Error('Application preferences context is missing.'); return value; }

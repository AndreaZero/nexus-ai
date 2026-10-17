import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { nexusAuthStateSchema, nexusUserSchema } from '@nexus-ai/contracts';
import type { NexusAuthState } from '@nexus-ai/contracts';
import { accountServerUrl } from './configuration.js';
import { getAuthClient } from './client.js';
import { AccountStateCoordinator, type AccountSnapshot } from './account-state.js';

const signedOut: NexusAuthState = { status: 'signed_out', user: null, expiresAt: null, persistent: false, message: null };
const unavailable: NexusAuthState = { ...signedOut, status: 'unavailable', message: 'The account service is unavailable. Check your connection and retry.' };
function readConfiguration(value: unknown) {
  if (typeof value !== 'object' || value === null || !('configured' in value) || !('emailConfigured' in value) || typeof value.configured !== 'boolean' || typeof value.emailConfigured !== 'boolean') throw new Error('Invalid account configuration.');
  return { configured: value.configured, emailConfigured: value.emailConfigured };
}

function readAccount(value: unknown) {
  if (typeof value !== 'object' || value === null || !('user' in value) || !('expiresAt' in value)) throw new Error('Invalid account response.');
  const user = value.user === null ? null : nexusUserSchema.parse(value.user);
  const expiresAt = value.expiresAt;
  if (expiresAt !== null && (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt)))) throw new Error('Invalid session expiry.');
  return { user, expiresAt };
}

interface AccountContextValue {
  state: NexusAuthState;
  loading: boolean;
  configured: boolean;
  emailConfigured: boolean;
  desktop: boolean;
  refresh(): Promise<void>;
  signInDesktop(): Promise<void>;
  cancelDesktop(): Promise<void>;
  signOut(): Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NexusAuthState>(signedOut);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const desktop = Boolean(window.nexusDesktop);
  const updates = useRef<AccountStateCoordinator | null>(null);
  if (!updates.current) updates.current = new AccountStateCoordinator(snapshot => {
    setState(snapshot.state); setConfigured(snapshot.configured); setEmailConfigured(snapshot.emailConfigured);
  }, setLoading, () => setState(unavailable));
  const coordinator = updates.current;

  const refresh = useCallback(() => coordinator.refresh(async (): Promise<AccountSnapshot> => {
    if (window.nexusDesktop) {
      return { state: nexusAuthStateSchema.parse(await window.nexusDesktop.auth.getState()), configured: true, emailConfigured: false };
    } else {
      const server = accountServerUrl();
      if (!server) throw new Error('configuration');
      const options = { credentials: 'include' as const, cache: 'no-store' as const, redirect: 'error' as const, signal: AbortSignal.timeout(8_000), headers: { Accept: 'application/json' } };
      const statusResponse = await fetch(new URL('auth/status', server), options);
      if (!statusResponse.ok) throw new Error('status');
      const status = readConfiguration(await statusResponse.json());
      if (!status.configured) {
        return { ...status, state: { ...unavailable, message: 'Accounts are not configured on this server. Complete the database and account-service setup.' } };
      }
      const response = await fetch(new URL('auth/me', server), options);
      if (!response.ok) throw new Error('session');
      const account = readAccount(await response.json());
      return { ...status, state: account.user ? { status: 'signed_in', user: account.user, expiresAt: account.expiresAt, persistent: true, message: null } : signedOut };
    }
  }), [coordinator]);

  useEffect(() => {
    coordinator.activate();
    const unsubscribe = window.nexusDesktop?.auth.onStateChanged((next) => {
      const result = nexusAuthStateSchema.safeParse(next);
      if (result.success) coordinator.accept({ state: result.data, configured: true, emailConfigured: false });
    });
    // Subscribe before hydration: main can restore the account while getState is pending.
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { coordinator.deactivate(); unsubscribe?.(); window.removeEventListener('focus', onFocus); };
  }, [refresh, coordinator]);

  async function desktopAction(action: 'signIn' | 'cancelSignIn' | 'signOut') {
    if (!window.nexusDesktop) return;
    const auth = window.nexusDesktop.auth;
    await coordinator.perform(async () => ({ state: nexusAuthStateSchema.parse(await auth[action]()), configured: true, emailConfigured: false }));
  }

  async function signOut() {
    if (desktop) return desktopAction('signOut');
    await coordinator.perform(async () => {
      try {
        const response = await getAuthClient().signOut();
        if (response.error) throw new Error('sign-out');
        return { state: signedOut, configured, emailConfigured };
      } catch {
        // Do not report a successful logout when the server could not revoke it.
        return { state: { ...state, message: 'Sign out could not be confirmed. Reconnect and try again.' }, configured, emailConfigured };
      }
    });
  }

  return <AccountContext.Provider value={{ state, loading, configured, emailConfigured, desktop, refresh, signInDesktop: () => desktopAction('signIn'), cancelDesktop: () => desktopAction('cancelSignIn'), signOut }}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) throw new Error('Account context is missing.');
  return context;
}

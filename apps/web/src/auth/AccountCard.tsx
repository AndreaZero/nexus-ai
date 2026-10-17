import { Avatar, Badge, Button, Card, Icon } from '@nexus-ai/ui';
import { useAccount } from './AuthProvider.js';
import './auth.css';

export function AccountCard() {
  const account = useAccount();
  const { state, loading } = account;
  return <Card title="Nexus account" icon={<Icon name="shield" />}>
    <div className="account-summary" data-testid="account-state" data-auth-status={state.status} aria-busy={loading}>
      {state.status === 'signed_in' && state.user ? <>
        <div className="account-profile"><Avatar name={state.user.name || state.user.email} size={42} /><div><strong>{state.user.name}</strong><span>{state.user.email}</span></div></div>
        <Badge tone={state.user.emailVerified ? 'success' : 'warning'}>{state.user.emailVerified ? 'Email verified' : 'Verification required'}</Badge>
        <dl className="settings-details"><div><dt>Session expires</dt><dd>{state.expiresAt ? new Date(state.expiresAt).toLocaleString() : 'Not available'}</dd></div><div><dt>On this device</dt><dd>{state.persistent ? 'Session saved securely' : 'Session in memory only'}</dd></div></dl>
        <Button size="sm" disabled={loading} onClick={() => { void account.signOut(); }}>Sign out</Button>
      </> : state.status === 'signing_in' ? <>
        <Badge tone="blue">Waiting for browser</Badge>
        <p className="settings-note">Complete sign in in your browser, then return to Nexus AI. Only the configured account service can complete this request.</p>
        <Button size="sm" disabled={loading} onClick={() => { void account.cancelDesktop(); }}>Cancel sign in</Button>
      </> : <>
        <Badge tone={state.status === 'unavailable' ? 'warning' : 'neutral'}>{loading ? 'Checking account…' : state.status === 'unavailable' ? 'Account unavailable' : 'Signed out'}</Badge>
        <p className="settings-note">Use your Nexus account for identity and shared project history. Project access is granted separately.</p>
        <div className="account-actions">{account.desktop ? <Button variant="primary" size="sm" disabled={loading || state.status === 'unavailable'} onClick={() => { void account.signInDesktop(); }}><Icon name="external-link" size={14} />Sign in with browser</Button> : <a className="account-link-button" href="/sign-in">Sign in / Create account</a>}
          <Button size="sm" disabled={loading} onClick={() => { void account.refresh(); }}><Icon name="refresh" size={14} />Retry</Button>
          {account.desktop && state.status === 'unavailable' && <Button size="sm" disabled={loading} onClick={() => { void account.signOut(); }}>Sign out on this device</Button>}
        </div>
      </>}
      {state.message && <p className="account-message account-message--error" role="alert">{state.message}</p>}
      <p className="settings-note">Your Nexus account is separate from Codex. Signing in does not connect an AI account.</p>
    </div>
  </Card>;
}

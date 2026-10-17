import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Icon, NexusLogo } from '@nexus-ai/ui';
import { SidebarPlanet } from '@nexus-ai/ui/effects';
import { useMotionPreference } from '../use-motion-preference.js';
import { useAccount } from './AuthProvider.js';
import { accountErrorMessage, desktopQuery, getAuthClient } from './client.js';
import { accountUrl, completedAccountUrl, isDesktopJourney } from './configuration.js';
import { transferDesktopSession } from './desktop-transfer.js';
import './auth.css';

const headings: Record<string, { title: string; description: string }> = {
  '/sign-in': { title: 'Welcome back', description: 'Sign in to your Nexus account. Your local files and Codex account stay on your device.' },
  '/sign-up': { title: 'Create your account', description: 'Start with your identity. Workspace membership and project access are managed separately.' },
  '/forgot-password': { title: 'Reset your password', description: 'Enter your account email. We will send instructions if an eligible account exists.' },
  '/reset-password': { title: 'Choose a new password', description: 'Use a unique password. Reset links expire and can be used once.' },
  '/verify-email': { title: 'Verify your email', description: 'Open the verification link in your inbox. Request a fresh link if the previous one has expired.' },
  '/desktop-auth': { title: 'Continue in Nexus AI', description: 'Approve the return to the desktop app you started signing in to.' },
};

export function AuthRoot() {
  const path = window.location.pathname;
  const heading = headings[path] ?? headings['/sign-in'];
  const motion = useMotionPreference();
  useEffect(() => { document.title = `${heading?.title ?? 'Account'} · Nexus AI`; }, [heading]);

  return <main className="account-page">
    <aside className="account-aside" aria-label="Nexus AI">
      <NexusLogo />
      <div className="account-aside__planet"><SidebarPlanet reducedMotion={motion.reducedMotion} /></div>
      <div className="account-aside__copy"><h2>Human creativity.<br />AI capability.<br /><span>Real progress.</span></h2><p>One place to build together, with clear ownership and control of what you share.</p></div>
    </aside>
    <div className="account-main"><section className="account-panel" aria-labelledby="account-title">
      <div className="account-eyebrow"><Icon name={isDesktopJourney() ? 'laptop' : 'shield'} size={15} />{isDesktopJourney() ? 'Desktop sign in' : 'Nexus identity'}</div>
      <h1 id="account-title">{heading?.title}</h1>
      <p className="account-description">{heading?.description}</p>
      {path === '/desktop-auth' ? <DesktopContinuation /> : <AccountForm path={path} />}
      <p className="account-footer">Nexus identity and Codex authentication are separate. Your password is sent only to the configured Nexus account service.</p>
    </section></div>
  </main>;
}

function AccountForm({ path }: { path: string }) {
  const account = useAccount();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const isSignup = path === '/sign-up';
  const isSignIn = path === '/sign-in';
  const isReset = path === '/reset-password';
  const isVerify = path === '/verify-email';
  const emailRequired = !isReset;
  const passwordRequired = isSignIn || isSignup || isReset;
  const emailServiceRequired = !isSignIn && !isReset;
  const query = new URLSearchParams(window.location.search);
  const resetToken = query.get('token');
  const linkError = query.has('error');
  const invalidDesktop = isDesktopJourney() && !desktopQuery();
  const unavailable = !account.configured || (emailServiceRequired && !account.emailConfigured);

  useEffect(() => { (firstInputRef.current ?? passwordRef.current)?.focus(); }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timeout = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timeout);
  }, [cooldown]);

  async function resendVerification() {
    if (!email || cooldown || pending) return;
    setPending(true); setError(''); setNotice('');
    try {
      const response = await getAuthClient().sendVerificationEmail({ email, callbackURL: accountUrl('/sign-in') });
      if (response.error) { setError(accountErrorMessage(response.error)); return; }
      setNotice('If this address needs verification, a new link has been sent. Check your inbox.');
      setCooldown(60);
    } catch { setError(accountErrorMessage(null)); }
    finally { setPending(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || unavailable || invalidDesktop) return;
    setPending(true); setError(''); setNotice('');
    const values = new FormData(event.currentTarget);
    const password = String(values.get('password') ?? '');
    try {
      const client = getAuthClient();
      if (isSignup) {
        const response = await client.signUp.email({ name: String(values.get('name') ?? '').trim(), email, password, callbackURL: accountUrl('/sign-in') }, { query: desktopQuery() ?? {} });
        if (response.error) { setError(accountErrorMessage(response.error)); return; }
        setSubmitted(true); setCooldown(60);
        setNotice('Check your inbox for the verification email, then sign in. If an account already exists, use sign in or password recovery.');
      } else if (isSignIn) {
        const response = await client.signIn.email({ email, password, callbackURL: completedAccountUrl(), rememberMe: true }, { query: desktopQuery() ?? {} });
        if (response.error) { setError(accountErrorMessage(response.error)); return; }
        window.location.assign(completedAccountUrl());
      } else if (isReset) {
        if (!resetToken) { setError('The reset link is missing. Request a new password reset email.'); return; }
        const response = await client.resetPassword({ newPassword: password, token: resetToken });
        if (response.error) { setError(accountErrorMessage(response.error)); return; }
        setSubmitted(true); setNotice('Password updated. Previous sessions have been revoked. Sign in with your new password.');
        window.history.replaceState(null, '', accountUrl('/reset-password'));
      } else if (isVerify) {
        await resendVerification();
      } else {
        const response = await client.requestPasswordReset({ email, redirectTo: accountUrl('/reset-password') });
        if (response.error) { setError(accountErrorMessage(response.error)); return; }
        setNotice('If an eligible account exists, password reset instructions have been sent. Check your inbox.');
        setCooldown(60);
      }
    } catch { setError(accountErrorMessage(null)); }
    finally { if (passwordRef.current) passwordRef.current.value = ''; setPending(false); }
  }

  if ((isSignIn || isSignup) && account.state.status === 'signed_in' && account.state.user?.emailVerified) {
    return <>
      <div className="account-profile"><Icon name="check-circle" size={30} /><div><strong>{account.state.user.name}</strong><span>{account.state.user.email}</span></div></div>
      <p className="account-message" role="status">You are signed in to Nexus in this browser.</p>
      <a className="account-link-button" href={completedAccountUrl()}>{isDesktopJourney() ? 'Continue to desktop sign in' : 'Open Nexus account'}</a>
      <Button className="account-secondary-action" variant="ghost" disabled={account.loading} onClick={() => { void account.signOut(); }}>Use another account</Button>
      {account.state.message && <p className="account-message account-message--error" role="alert">{account.state.message}</p>}
    </>;
  }

  return <>
    {account.loading && <p className="account-message" role="status">Checking account service…</p>}
    {!account.loading && unavailable && <div className="account-message account-message--error" role="alert">{!account.configured ? account.state.message ?? 'The account service is not configured.' : 'Email is not configured. Start the local Mailpit service and configure SMTP before creating or recovering an account.'}<Button className="account-secondary-action" size="sm" onClick={() => { void account.refresh(); }}>Retry connection</Button></div>}
    {!account.loading && !unavailable && account.state.status === 'unavailable' && <p className="account-message account-message--error" role="alert">{account.state.message}</p>}
    {linkError && <p className="account-message account-message--error" role="alert">This verification or reset link has expired or is invalid. Request a new email.</p>}
    {invalidDesktop && <p className="account-message account-message--error" role="alert">The desktop sign-in request is incomplete. Cancel it in Nexus AI and start again.</p>}
    {isReset && !resetToken && !submitted && <p className="account-message account-message--error" role="alert">Open the complete reset link from your email, or request a new one.</p>}
    {error && <p className="account-message account-message--error" role="alert">{error}</p>}
    {notice && <p className="account-message account-message--success" role="status">{notice}</p>}
    {!submitted && <form className="account-form" onSubmit={(event) => { void submit(event); }} aria-busy={pending}>
      {isSignup && <label className="account-field">Name<input ref={firstInputRef} name="name" autoComplete="name" required maxLength={100} disabled={pending} /></label>}
      {emailRequired && <label className="account-field">Email<input ref={isSignup ? undefined : firstInputRef} name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} disabled={pending} /></label>}
      {passwordRequired && <label className="account-field">{isReset ? 'New password' : 'Password'}<input ref={passwordRef} name="password" type="password" autoComplete={isSignIn ? 'current-password' : 'new-password'} required minLength={isSignIn ? 1 : 12} maxLength={128} disabled={pending} />{!isSignIn && <small>Use 12–128 characters. A password manager can create and save a unique password.</small>}</label>}
      <Button variant="primary" type="submit" disabled={pending || account.loading || unavailable || invalidDesktop || (isReset && !resetToken) || cooldown > 0}>{pending ? 'Please wait…' : cooldown > 0 ? `Try again in ${cooldown}s` : isSignup ? 'Create account' : isSignIn ? 'Sign in' : isReset ? 'Update password' : isVerify ? 'Send verification email' : 'Send reset instructions'}<Icon name="arrow-right" size={15} /></Button>
    </form>}
    {(isSignIn || (isSignup && submitted)) && <Button className="account-secondary-action" size="sm" disabled={pending || cooldown > 0 || !email || !account.emailConfigured || !account.configured} onClick={() => { void resendVerification(); }}>{cooldown ? `Resend available in ${cooldown}s` : 'Resend verification email'}</Button>}
    <nav className="account-links" aria-label="Account navigation">
      {!isSignIn && <a href={accountUrl('/sign-in')}>Sign in</a>}
      {isSignIn && <a href={accountUrl('/sign-up')}>Create an account</a>}
      {(isSignIn || isReset) && <a href={accountUrl('/forgot-password')}>Forgot password?</a>}
      {isSignup && !submitted && <a href={accountUrl('/verify-email')}>Already awaiting verification?</a>}
      {!isDesktopJourney() && <a href="/#/overview">Back to Nexus</a>}
    </nav>
  </>;
}

function DesktopContinuation() {
  const account = useAccount();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => () => { if (redirectTimer.current) clearInterval(redirectTimer.current); }, []);
  const query = desktopQuery();

  async function continueDesktop() {
    if (!query || pending) return;
    setPending(true); setError('');
    try {
      const client = getAuthClient();
      // This official endpoint binds the existing browser session to the active desktop PKCE challenge.
      if (redirectTimer.current) clearInterval(redirectTimer.current);
      const result = await transferDesktopSession(client, query);
      if (result.error) { setError(accountErrorMessage(result.error)); return; }
      redirectTimer.current = result.redirectTimer;
      setOpened(true);
    } catch { setError(accountErrorMessage(null)); }
    finally { setPending(false); }
  }

  if (!query) return <><p className="account-message account-message--error" role="alert">There is no valid desktop sign-in request. Start sign in from Nexus AI on your device.</p><a className="account-link-button" href="/#/settings">Open web account settings</a></>;
  if (account.loading) return <p className="account-message" role="status">Checking your browser session…</p>;
  if (account.state.status !== 'signed_in' || !account.state.user?.emailVerified) return <><p className="account-message">Sign in with a verified email to continue in the desktop app.</p><a className="account-link-button" href={accountUrl('/sign-in')}>Sign in to continue</a>{account.state.message && <p className="account-message account-message--error" role="alert">{account.state.message}</p>}</>;
  return <>
    <div className="account-profile"><Icon name="check-circle" size={32} /><div><strong>{account.state.user.name}</strong><span>{account.state.user.email}</span></div></div>
    {error && <p className="account-message account-message--error" role="alert">{error}</p>}
    {opened && <p className="account-message account-message--success" role="status">Your browser has been asked to open Nexus AI. Approve the prompt, then return to the app. If the request expired, start again from the desktop.</p>}
    <Button className="account-secondary-action" variant="primary" disabled={pending} onClick={() => { void continueDesktop(); }}><Icon name="laptop" size={16} />{pending ? 'Connecting…' : opened ? 'Open Nexus AI again' : 'Continue in Nexus AI'}</Button>
    <Button className="account-secondary-action" variant="ghost" disabled={account.loading || pending} onClick={() => { void account.signOut(); }}>Use another account</Button>
  </>;
}

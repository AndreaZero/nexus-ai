import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button, Card, EmptyPanel, Icon } from '@nexus-ai/ui';
import { useAccount } from '../auth/AuthProvider.js';
import { useCollaboration } from './CollaborationProvider.js';

export function DomainDialog({ title, onClose, children, busy = false }: { title: string; onClose(): void; children: ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>('input, select, button')?.focus();
    return () => { dialog?.close(); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  return <dialog ref={ref} className="domain-dialog" aria-labelledby={titleId} aria-busy={busy} onCancel={event => { if (busy) event.preventDefault(); else onClose(); }} onClick={event => { if (!busy && event.target === event.currentTarget) onClose(); }}>
    <div className="domain-dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-control" aria-label="Close dialog" disabled={busy} onClick={onClose}><Icon name="x" size={18} /></button></div>
    {children}
  </dialog>;
}

export function Feedback({ error, notice }: { error?: string; notice?: string }) {
  return <>{error && <p className="domain-feedback domain-feedback--error" role="alert">{error}</p>}{notice && <p className="domain-feedback domain-feedback--success" role="status">{notice}</p>}</>;
}

export function AccountGate({ children }: { children: ReactNode }) {
  const account = useAccount();
  const data = useCollaboration();
  if (account.loading && !data.ready) return <p className="domain-state" role="status">Checking your account…</p>;
  if (!data.ready) return <Card title="Connect your Nexus account" icon={<Icon name="shield" />}><EmptyPanel title="Sign in to work together" description="Use your verified Nexus account to create a workspace or access projects shared with you." /><div className="domain-empty-action">{account.desktop ? <Button variant="primary" disabled={account.loading || account.state.status === 'signing_in'} onClick={() => { void account.signInDesktop(); }}>{account.state.status === 'signing_in' ? 'Complete sign-in in your browser' : 'Sign in with browser'}</Button> : <a className="domain-primary-link" href="/sign-in">Sign in to Nexus</a>}</div><Feedback error={account.state.message ?? ''} /></Card>;
  return children;
}

export function WorkspaceGate({ children }: { children: ReactNode }) {
  const data = useCollaboration();
  return <AccountGate>{data.loading ? <p className="domain-state" role="status">Loading workspace…</p> : data.error ? <div className="domain-state"><Feedback error={data.error} /><Button onClick={() => { void data.refresh(); }}>Retry connection</Button></div> : !data.workspace ? <Card title="No workspace yet"><EmptyPanel title="Create your shared workspace" description="Open Projects to create a workspace, or accept an invitation from your email." /><div className="domain-empty-action"><a className="domain-primary-link" href="#/projects">Open Projects</a></div></Card> : children}</AccountGate>;
}

import { useEffect, useState } from 'react';
import type { InvitationPreview } from '@nexus-ai/contracts';
import { Badge, Button, Card, EmptyPanel, Icon } from '@nexus-ai/ui';
import { useAccount } from '../auth/AuthProvider.js';
import { useCollaboration } from './CollaborationProvider.js';
import { collaborationRequest, CollaborationError, errorMessage } from './client.js';
import { captureInvitation, clearInvitation } from './invitation.js';
import { Feedback } from './components.js';

export function InvitationPage() {
  const account = useAccount();
  const data = useCollaboration();
  const [token] = useState(captureInvitation);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const [retry, setRetry] = useState(0);
  const accountId = account.state.status === 'signed_in' && account.state.user?.emailVerified ? account.state.user.id : null;

  useEffect(() => {
    let live = true;
    setPreview(null);
    if (!token || !accountId || accepted || terminal) return;
    setError('');
    setLoading(true);
    void collaborationRequest({ operation: 'previewInvitation', token }).then(response => {
      if (live) { if (response.kind !== 'invitation') throw new Error('Invalid invitation'); setPreview(response.item); }
    }).catch(cause => {
      if (!live) return;
      setError(errorMessage(cause));
      // not_found also hides details from a different signed-in recipient; allow switching accounts.
      if (cause instanceof CollaborationError && ['invitation_expired', 'invitation_used'].includes(cause.code)) { clearInvitation(); setTerminal(true); }
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [token, accountId, accepted, terminal, retry]);

  async function accept() {
    if (!token || !preview || pending) return;
    setPending(true); setError('');
    try {
      await collaborationRequest({ operation: 'acceptInvitation', token });
      clearInvitation(); setAccepted(true);
      if (preview.scope.kind === 'workspace') await data.refresh({ workspaceId: preview.scope.workspaceId, projectId: null });
      else {
        const response = await collaborationRequest({ operation: 'getProject', projectId: preview.scope.projectId });
        if (response.kind === 'project') await data.refresh({ workspaceId: response.item.workspaceId, projectId: response.item.id });
        else await data.refresh();
      }
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof CollaborationError && ['invitation_expired', 'invitation_used'].includes(cause.code)) { clearInvitation(); setTerminal(true); }
    } finally { setPending(false); }
  }

  return <div className="domain-layout invitation-page"><Card title="Your invitation" icon={<Icon name="share" />}>
    {account.loading && !accountId ? <p className="domain-state" role="status">Checking your account…</p> : accepted ? <><EmptyPanel title="You’re in" description="Your membership is ready. Open Projects to start working with your team." icon={<Icon name="check-circle" size={32} />} /><div className="domain-empty-action"><a className="domain-primary-link" href="#/projects">Open Projects</a></div></> : !token || terminal ? <><EmptyPanel title="Invitation unavailable" description="Open a complete invitation link from your email. Used, revoked or expired invitations require a new invitation from an owner." /><Feedback error={error} /></> : !accountId ? <><EmptyPanel title="Sign in to accept" description="Use the verified email address that received this invitation. Project details appear only after the recipient has been checked." /><div className="domain-empty-action">{account.desktop ? <Button variant="primary" disabled={account.loading} onClick={() => { void account.signInDesktop(); }}>Sign in with browser</Button> : <><a className="domain-primary-link" href="/sign-in">Sign in</a><a className="domain-secondary-link" href="/sign-up">Create account</a></>}</div></> : <>
      {loading && <p className="domain-state" role="status">Verifying the invitation recipient…</p>}
      <Feedback error={error} />
      {preview && <><div className="invitation-preview"><span className="domain-symbol"><Icon name="team" size={25} /></span><span className="domain-eyebrow">YOU’RE INVITED TO</span><h2>{preview.projectName ?? preview.workspaceName}</h2>{preview.projectName && <p>{preview.workspaceName}</p>}<Badge tone="blue">{preview.role}</Badge><p>Signed in as {account.state.user?.email}</p><small>Expires {new Date(preview.expiresAt).toLocaleString()}</small></div><div className="domain-form-actions"><Button variant="primary" disabled={pending} onClick={() => { void accept(); }}>{pending ? 'Accepting…' : 'Accept invitation'}<Icon name="arrow-right" size={14} /></Button></div></>}
      {!loading && !preview && !terminal && <div className="domain-form-actions"><Button onClick={() => setRetry(value => value + 1)}>Retry invitation</Button><Button disabled={account.loading} onClick={() => { void account.signOut(); }}>Use another account</Button></div>}
    </>}
  </Card></div>;
}

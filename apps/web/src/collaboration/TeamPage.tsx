import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CollaborationScope, Invitation, Member } from '@nexus-ai/contracts';
import { Badge, Button, Card, EmptyPanel, Icon } from '@nexus-ai/ui';
import { useAccount } from '../auth/AuthProvider.js';
import { useCollaboration } from './CollaborationProvider.js';
import { collaborationRequest, errorMessage } from './client.js';
import { DomainDialog, Feedback, WorkspaceGate } from './components.js';

type Role = Member['role'];
const workspaceRoles: Role[] = ['owner', 'member'];
const projectRoles: Role[] = ['owner', 'developer', 'client', 'viewer'];

export function TeamPage() {
  const data = useCollaboration();
  const [scopeKind, setScopeKind] = useState<'workspace' | 'project'>('project');
  const scope: CollaborationScope | null = scopeKind === 'project' && data.project ? { kind: 'project', projectId: data.project.id } : data.workspace ? { kind: 'workspace', workspaceId: data.workspace.id } : null;
  const canManage = scope?.kind === 'workspace' ? data.workspace?.role === 'owner' : Boolean(data.project?.capabilities.manageMembers);
  const scopeKey = scope?.kind === 'workspace' ? scope.workspaceId : scope?.projectId;
  return <div className="domain-layout"><WorkspaceGate>
    <div className="domain-page-heading"><div><span className="domain-eyebrow">PEOPLE & ACCESS</span><h2>Team</h2><p>Give each collaborator the access they need.</p></div><label className="domain-scope">Manage<select aria-label="Membership scope" value={scope?.kind ?? 'workspace'} onChange={event => setScopeKind(event.target.value as 'workspace' | 'project')}><option value="workspace">Workspace · {data.workspace?.name}</option>{data.project && <option value="project">Project · {data.project.name}</option>}</select></label></div>
    {scope && <TeamScope key={`${scope.kind}:${scopeKey}`} scope={scope} canManage={canManage} />}
  </WorkspaceGate></div>;
}

function TeamScope({ scope, canManage }: { scope: CollaborationScope; canManage: boolean }) {
  const data = useCollaboration();
  const account = useAccount();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [remove, setRemove] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  const generation = useRef(0);
  const roles = scope.kind === 'workspace' ? workspaceRoles : projectRoles;
  const scopeId = scope.kind === 'workspace' ? scope.workspaceId : scope.projectId;

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true); setError('');
    try {
      const response = await collaborationRequest({ operation: 'listMembers', scope });
      if (response.kind !== 'members') throw new Error('Invalid roster');
      const invites = canManage ? await collaborationRequest({ operation: 'listInvitations', scope }) : null;
      if (invites && invites.kind !== 'invitations') throw new Error('Invalid invitations');
      if (!live.current || ticket !== generation.current) return;
      setMembers(response.items); setInvitations(invites?.kind === 'invitations' ? invites.items : []);
    } catch (cause) { if (live.current && ticket === generation.current) { setMembers([]); setInvitations([]); setError(errorMessage(cause)); } }
    finally { if (live.current && ticket === generation.current) setLoading(false); }
    // A scope is immutable for this keyed instance.
  }, [scopeId, scope.kind, canManage]);
  useEffect(() => { live.current = true; void load(); return () => { live.current = false; ++generation.current; }; }, [load]);

  async function changeRole(member: Member, role: Role) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await collaborationRequest({ operation: 'changeMemberRole', scope, userId: member.userId, role });
      setNotice('Member role updated.'); await load();
      if (member.userId === account.state.user?.id) await data.refresh();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  async function removeMember() {
    if (!remove || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await collaborationRequest({ operation: 'removeMember', scope, userId: remove.userId });
      setNotice('Member removed.'); setRemove(null); await load();
      if (remove.userId === account.state.user?.id) await data.refresh();
    } catch (cause) { setError(errorMessage(cause)); setRemove(null); }
    finally { setBusy(false); }
  }
  async function revoke(invitation: Invitation) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await collaborationRequest({ operation: 'revokeInvitation', invitationId: invitation.id }); setNotice('Invitation revoked.'); await load(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  return <>
    <div className="domain-toolbar"><span>{loading ? 'Loading members…' : `${members.length} ${members.length === 1 ? 'member' : 'members'}`}</span><Button size="sm" disabled={loading || busy} onClick={() => { void load(); }}>Refresh</Button>{canManage && <Button variant="primary" size="sm" disabled={busy} onClick={() => setInviteOpen(true)}><Icon name="plus" size={14} />Invite member</Button>}</div>
    <Feedback error={error} notice={notice} />
    <Card title={scope.kind === 'workspace' ? 'Workspace members' : 'Project members'} icon={<Icon name="team" />} action={<Badge tone="neutral">{scope.kind}</Badge>}>
      <p className="domain-note">{scope.kind === 'workspace' ? 'Workspace owners administer every project. Ordinary members need an explicit project membership.' : 'Owners manage access. Developers can view repositories. Clients and viewers see only the permitted shared information.'}</p>
      {loading ? <p className="domain-state" role="status">Loading members…</p> : !members.length ? <EmptyPanel title={error ? 'Members unavailable' : 'No members available'} description={error ? 'Refresh after checking your access and connection.' : 'Members will appear after an invitation is accepted.'} /> : <div className="member-list">{members.map(member => <MemberRow key={`${member.userId}:${member.role}`} member={member} current={member.userId === account.state.user?.id} roles={roles} canManage={canManage} busy={busy} onRole={role => { void changeRole(member, role); }} onRemove={() => setRemove(member)} />)}</div>}
    </Card>
    {canManage && <Card title="Invitations" icon={<Icon name="share" />} action={<Badge tone="neutral">{invitations.filter(invitation => invitation.status === 'pending').length} pending</Badge>}>
      {loading ? <p className="domain-state" role="status">Loading invitations…</p> : !invitations.length ? <EmptyPanel title="No invitations yet" description="Invite someone by email. They must sign in with that verified address before accepting." compact /> : <div className="invitation-list">{invitations.map(invitation => <div className="invitation-row" key={invitation.id}><div><strong>{invitation.email}</strong><small>{invitation.role} · Expires {new Date(invitation.expiresAt).toLocaleString()}</small></div><Badge tone={invitation.status === 'accepted' ? 'success' : 'neutral'}>{invitation.status}</Badge>{invitation.status === 'pending' && <Button size="sm" disabled={busy} onClick={() => { void revoke(invitation); }}>Revoke</Button>}</div>)}</div>}
    </Card>}
    {inviteOpen && <InviteDialog scope={scope} onClose={() => setInviteOpen(false)} onCreated={async () => { setInviteOpen(false); setNotice('Invitation sent. In the local setup it is available in Mailpit.'); await load(); }} />}
    {remove && <DomainDialog title="Remove member" onClose={() => setRemove(null)} busy={busy}><p className="domain-note">Remove {remove.name} from this {scope.kind}? {scope.kind === 'workspace' ? 'Their project memberships in this workspace will also be removed.' : 'Their project access will end immediately.'} The last owner cannot be removed.</p><div className="domain-form-actions"><Button disabled={busy} onClick={() => setRemove(null)}>Cancel</Button><Button variant="danger" disabled={busy} onClick={() => { void removeMember(); }}>{busy ? 'Removing…' : 'Remove member'}</Button></div></DomainDialog>}
  </>;
}

function MemberRow({ member, current, roles, canManage, busy, onRole, onRemove }: { member: Member; current: boolean; roles: Role[]; canManage: boolean; busy: boolean; onRole(role: Role): void; onRemove(): void }) {
  const [role, setRole] = useState(member.role);
  return <div className="member-row"><span className="member-initial" aria-hidden="true">{member.name.slice(0, 1).toLocaleUpperCase() || '?'}</span><div className="member-identity"><strong>{member.name}{current && <small> (you)</small>}</strong><span>{member.email ?? 'Email private'}</span></div>{canManage ? <div className="member-actions"><select aria-label={`Role for ${member.name}`} value={role} disabled={busy} onChange={event => setRole(event.target.value as Role)}>{roles.map(value => <option key={value} value={value}>{value}</option>)}</select><Button size="sm" disabled={busy || role === member.role} onClick={() => onRole(role)}>Save role</Button><Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}>Remove</Button></div> : <Badge tone="neutral">{member.role}</Badge>}</div>;
}

function InviteDialog({ scope, onClose, onCreated }: { scope: CollaborationScope; onClose(): void; onCreated(): Promise<void> }) {
  const roles = scope.kind === 'workspace' ? workspaceRoles : projectRoles;
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(scope.kind === 'workspace' ? 'member' : 'developer');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    setPending(true); setError('');
    try { await collaborationRequest({ operation: 'createInvitation', scope, email, role }); await onCreated(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setPending(false); }
  }
  return <DomainDialog title={`Invite to ${scope.kind}`} onClose={onClose} busy={pending}><form className="domain-form" onSubmit={event => { void submit(event); }}><label>Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={pending} /></label><label>Role<select value={role} onChange={event => setRole(event.target.value as Role)} disabled={pending}>{roles.map(value => <option key={value} value={value}>{value}</option>)}</select></label><p className="domain-note">The invitation expires after 72 hours and can be accepted once, by this verified email address. Existing members keep their current role; use Save role to change it.</p><Feedback error={error} /><div className="domain-form-actions"><Button disabled={pending} onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send invitation'}</Button></div></form></DomainDialog>;
}

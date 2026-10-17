import { useEffect, useState } from 'react';
import type { Member } from '@nexus-ai/contracts';
import { Avatar, Icon } from '@nexus-ai/ui';
import { PresenceMap } from '@nexus-ai/ui/effects';
import { useCollaboration } from './CollaborationProvider.js';
import { collaborationRequest } from './client.js';

export function ProjectTeamStrip({ reducedMotion, onTeam }: { reducedMotion: boolean; onTeam(): void }) {
  const data = useCollaboration();
  const [members, setMembers] = useState<Member[]>([]);
  const [state, setState] = useState<'empty' | 'loading' | 'ready' | 'error'>('empty');
  const projectId = data.project?.id;
  useEffect(() => {
    let live = true;
    setMembers([]);
    if (!projectId) { setState('empty'); return; }
    setState('loading');
    void collaborationRequest({ operation: 'listMembers', scope: { kind: 'project', projectId } }).then(response => {
      if (response.kind !== 'members') throw new Error('Invalid roster');
      if (live) { setMembers(response.items); setState('ready'); }
    }).catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [projectId]);

  return <section className="team-strip" aria-labelledby="team-strip-title"><div className="team-strip-count"><span className="unknown-dot" /><div><h2 id="team-strip-title">Project Team</h2><span>{state === 'ready' ? `${members.length} ${members.length === 1 ? 'member' : 'members'}` : '—'}</span></div></div><div className="team-strip-members-real">
    {state === 'ready' ? <>{members.slice(0, 4).map(member => <Avatar key={member.userId} name={member.name} size={36} />)}{members.length > 4 && <span>+{members.length - 4}</span>}</> : <span role={state === 'loading' ? 'status' : undefined}>{state === 'loading' ? 'Loading members…' : state === 'error' ? 'Members unavailable' : 'Select a project to see its team'}</span>}
    <button type="button" className="invite-circle" disabled={!projectId} onClick={onTeam} title={data.project?.capabilities.manageMembers ? 'Invite a member' : 'View project team'} aria-label={data.project?.capabilities.manageMembers ? 'Invite a member' : 'View project team'}><Icon name={data.project?.capabilities.manageMembers ? 'plus' : 'team'} size={19} /></button>
  </div><div className="team-strip-map"><PresenceMap reducedMotion={reducedMotion} /><span>Presence not connected</span></div></section>;
}

import { Avatar, Icon } from '@nexus-ai/ui';
import { PresenceMap } from '@nexus-ai/ui/effects';
import { useCollaboration } from './CollaborationProvider.js';
import { useRealtime } from '../realtime/RealtimeProvider.js';
import { useOverview } from '../overview/OverviewProvider.js';

export function ProjectTeamStrip({ reducedMotion, onTeam }: { reducedMotion: boolean; onTeam(): void }) {
  const data = useCollaboration();
  const realtime = useRealtime().state;
  const online = realtime.connection === 'online';
  const overview = useOverview();
  const projectId = data.project?.id;

  return <section className="team-strip" aria-labelledby="team-strip-title"><div className="team-strip-count"><span className={online ? 'status-dot' : 'unknown-dot'} /><div><h2 id="team-strip-title">Team Online</h2><span>{online ? `${realtime.presence.length} / ${overview.snapshot?.memberCount ?? '—'}` : 'Presence unknown'}</span></div></div><div className="team-strip-members-real">
    {online ? <>{realtime.presence.slice(0, 3).map(member => <span className="project-presence-person" key={member.userId} title={`${member.name} · ${member.role} · ${member.connections} active connection${member.connections > 1 ? 's' : ''}`}><Avatar name={member.name} size={36} /><span className="project-presence-name"><strong>{member.name}</strong><small>{member.role} · online</small></span></span>)}{realtime.presence.length > 3 && <span>+{realtime.presence.length - 3}</span>}</> : <span>{projectId ? 'Reconnect to see who is online' : 'Select a project to see its team'}</span>}
    <button type="button" className="invite-circle" disabled={!projectId} onClick={onTeam} title={data.project?.capabilities.manageMembers ? 'Invite a member' : 'View project team'} aria-label={data.project?.capabilities.manageMembers ? 'Invite a member' : 'View project team'}><Icon name={data.project?.capabilities.manageMembers ? 'plus' : 'team'} size={19} /></button>
  </div><div className="team-strip-map" title="Decorative map; positions do not represent member locations"><PresenceMap reducedMotion={reducedMotion || !online} /><span>{online ? `${realtime.snapshot?.shares.filter(item => item.status === 'active').length ?? 0} active shared sessions` : 'Presence not connected'}<small className="overview-map-note">Schematic · no locations</small></span></div></section>;
}

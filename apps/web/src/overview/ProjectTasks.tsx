import { Badge, Button, Card, EmptyPanel, Icon } from '@nexus-ai/ui';
import { useOverview } from './OverviewProvider.js';
import { useCollaboration } from '../collaboration/CollaborationProvider.js';

export function ProjectTasks() {
  const overview = useOverview(); const { project } = useCollaboration();
  const tasks = overview.snapshot?.tasks ?? [];
  return <div className="route-empty-layout"><Card title={project ? `${project.name} · Tasks` : 'Project tasks'} icon={<Icon name="tasks" />} action={<Badge tone="neutral">{overview.snapshot ? `${tasks.length} visible` : 'Unavailable'}</Badge>}>
    <p className="configuration-note">Project tasks visible to your current role. This view is read only.</p>
    {overview.error ? <div className="overview-recovery"><p role="alert">{overview.error}</p><Button size="sm" disabled={overview.loading} onClick={overview.refresh}>Retry project tasks</Button></div> : overview.snapshot ? <>{tasks.length ? <div className="session-task-rows">{tasks.map(task => <div key={task.id}><Icon name="tasks" size={14} /><strong>{task.title}</strong><Badge tone={task.status === 'done' ? 'success' : task.status === 'in_progress' ? 'blue' : 'neutral'}>{task.status.replaceAll('_', ' ')}</Badge><Badge tone="neutral">{task.visibility === 'client' ? 'Team & clients' : 'Project team'}</Badge></div>)}</div> : <EmptyPanel compact title="No project tasks yet" description="Authorized project tasks will appear here when available." />}{tasks.length === 100 && <p className="configuration-note">Showing up to 100 authorized project tasks.</p>}</> : <EmptyPanel icon={<Icon name="tasks" size={25} />} title={overview.loading ? 'Loading project tasks…' : 'Project tasks unavailable'} description="Select a project and connect to verify access." />}
  </Card></div>;
}

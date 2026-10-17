import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge, Button, Card, Donut, EmptyPanel, Icon } from '@nexus-ai/ui';
import { PulseScene } from '@nexus-ai/ui/effects';
import type { WorkspaceViewProps } from './types.js';
import { useAccount } from '../auth/AuthProvider.js';
import { useCollaboration } from '../collaboration/CollaborationProvider.js';
import { useRealtime } from '../realtime/RealtimeProvider.js';
import { WorkProvider } from '../work/WorkProvider.js';
import { WorkEditor } from '../work/WorkEditor.js';
import { PulseDeliverables, PulseFeedback, PulseWorkOutcomes } from '../work/PulseWork.js';
import { workHref } from '../work/state.js';
import { PulseProvider, usePulse } from '../pulse/PulseProvider.js';
import { PulseDialogs, MilestoneRow, PulseSummary, PulseSessions, PulseWorking, PulsePreview, PulsePresence, PulseRail } from '../pulse/PulsePanels.js';
import type { PulseDialog } from '../pulse/PulsePanels.js';
import { activityHref } from '../overview/state.js';
import '../pulse/pulse.css';

export function PulseView(props: WorkspaceViewProps) {
  const account = useAccount(); const { project } = useCollaboration(); const { state } = useRealtime();
  const user = account.state.status === 'signed_in' && account.state.user?.emailVerified ? account.state.user.id : null;
  const role = state.presence.find(member => member.userId === user)?.role ?? project?.role;
  return <PulseScope key={`${user}:${project?.id}:${project?.role}:${role}`} {...props} projectId={user ? project?.id ?? null : null} technical={role === 'owner' || role === 'developer'} />;
}
function PulseScope({ projectId, technical, ...props }: WorkspaceViewProps & { projectId: string | null; technical: boolean }) {
  const [view, setView] = useState<'auto' | 'client'>('auto');
  return <WorkProvider view={technical ? view : 'client'}><PulseProvider key={view} projectId={projectId} view={technical ? view : 'client'}><PulseContent {...props} technical={technical} preview={technical && view === 'client'} setPreview={value => setView(value ? 'client' : 'auto')} /></PulseProvider></WorkProvider>;
}
function PulseContent({ onNavigate, reducedMotion, technical, preview, setPreview }: WorkspaceViewProps & { technical: boolean; preview: boolean; setPreview(value: boolean): void }) {
  const pulse = usePulse(); const snapshot = pulse.snapshot;
  const [dialog, setDialog] = useState<PulseDialog | null>(null); const [milestoneId, setMilestone] = useState<string | null>(null); const [publish, setPublish] = useState(false);
  const [controlsHost, setControlsHost] = useState<Element | null>(null);
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1200px)');
    const position = () => setControlsHost(wide.matches ? document.querySelector('.workspace-header') : null);
    position(); wide.addEventListener('change', position);
    return () => wide.removeEventListener('change', position);
  }, []);
  const milestones = snapshot?.milestones ?? []; const current = milestones.find(item => item.id === milestoneId) ?? milestones.find(item => item.state === 'in_progress') ?? milestones.find(item => item.state === 'planned') ?? milestones.at(-1);
  const progress = snapshot?.progress; const shares = snapshot?.overview.activeShares ?? [];
  const localAllowed = technical && !preview && snapshot?.audience === 'team';
  function liveWork() { const share = shares[0]; if (share) window.location.hash = activityHref({ target: { kind: 'live_share', id: share.id } }).slice(1); else onNavigate('session'); }
  function openMilestone(id: string) { window.location.hash = workHref('milestone', id, preview ? 'client' : 'auto').slice(1); }
  const controls = <div className="pulse-controls"><span title={snapshot ? new Date(snapshot.overview.observedAt).toLocaleString() : ''}>{snapshot ? `${snapshot.audience === 'team' ? 'Project team' : 'Client audience'} · observed ${new Date(snapshot.overview.observedAt).toLocaleTimeString()}` : 'Shared data hidden until project access is verified.'}</span>{technical && <label><input type="checkbox" checked={preview} onChange={event => setPreview(event.target.checked)} />Preview client audience</label>}<button type="button" className="text-link" disabled={pulse.loading} onClick={pulse.refresh}>{pulse.loading ? 'Refreshing…' : 'Refresh Pulse'}</button>{pulse.error && <span role="alert">{pulse.error}</span>}</div>;
  return <div className="pulse-layout" data-pulse-audience={snapshot?.audience ?? 'unavailable'}>
    <div className="pulse-center">
      <section className="pulse-hero" aria-labelledby="pulse-hero-title">
        <PulseScene milestones={milestones.map(item => ({ id: item.id, title: item.title, state: item.state, progress: item.progress.percent }))} reducedMotion={reducedMotion} onSelect={openMilestone} activeId={current?.id ?? null} />
        <div className="pulse-hero-copy"><span className="hero-eyebrow"><i className={snapshot ? '' : 'is-offline'} />PROJECT PULSE</span><h2 id="pulse-hero-title">{current ? 'Moving together towards' : 'A shared view of'}<br /><span title={current?.title}>{current?.title ?? 'what comes next.'}</span></h2><p>{progress?.total ? `${progress.completed} of ${progress.total} visible tasks complete. ${progress.inProgress} in progress across the current project scope.` : snapshot ? 'Milestones and explicitly shared work, visible to your current audience. No task progress is defined yet.' : 'Connect to verify project access and load its published progress.'}</p><div className="hero-actions"><Button variant="primary" size="sm" onClick={liveWork}><Icon name="sparkles" size={13} />View Live Work<Icon name="arrow-right" size={15} /></Button>{technical && !preview && <Button size="sm" disabled={!snapshot} onClick={() => setPublish(true)} title="Review text, provenance and audience before publishing"><Icon name="link" size={15} />Share Update</Button>}</div></div>
        <div className="pulse-hero-progress"><span>OVERALL PROGRESS</span><Donut value={progress?.percent ?? null} size={113} tone="success" label={progress?.total ? 'Visible tasks' : 'Not defined'} /><dl>{[{ label: 'Completed', key: 'completed', css: 'completed' }, { label: 'In progress', key: 'inProgress', css: 'in-progress' }, { label: 'Planned', key: 'planned', css: 'planned' }].map(item => <div key={item.key}><i className={item.css} /><dt>{item.label}</dt><dd>{progress ? `${progress[item.key as 'completed' | 'inProgress' | 'planned']} / ${progress.total}` : '—'}</dd></div>)}</dl></div>
      </section>
      <div className="pulse-middle"><Card title="Milestone Progress" className="milestone-card" action={<button type="button" className="text-link" onClick={() => { window.location.hash = '/tasks?kind=milestone' + (preview ? '&view=client' : ''); }}>View Roadmap</button>} bodyClassName="pulse-milestone-list">{milestones.length ? milestones.slice(0, 5).map((item, index) => <MilestoneRow key={item.id} item={item} index={index} active={current?.id === item.id} onSelect={() => openMilestone(item.id)} />) : <EmptyPanel compact icon={<Icon name="tasks" size={22} />} title={snapshot ? 'No milestones defined' : 'Progress unavailable'} description="Progress is calculated from visible linked tasks." />}</Card><PulseSummary /><PulseSessions onNavigate={onNavigate} /></div>
      <div className="pulse-work-row">{localAllowed ? <PulseWorking onNavigate={onNavigate} reducedMotion={reducedMotion} /> : <Card title="What you're working on now" className="working-card" action={<Badge tone="neutral">{preview ? 'Client preview' : 'Shared view'}</Badge>}><EmptyPanel compact title="Local work stays on its device" description="Open an authorized shared session to read selected messages." /><button type="button" className="text-link" onClick={liveWork}>View shared work<Icon name="arrow-right" size={13} /></button></Card>}<PulseWorkOutcomes onExcerpts={() => setDialog('outcomes')} /><PulseDeliverables /></div>
      <div className="pulse-bottom">{localAllowed ? <PulsePreview onNavigate={onNavigate} /> : <Card title="Deploy Previews" className="pulse-deploy-card"><EmptyPanel compact icon={<Icon name="globe" size={20} />} title="No published deployment" description="Shared deployment integration is not configured." /></Card>}<PulseFeedback /><PulsePresence onAll={() => setDialog('availability')} /></div>
    </div>
    <PulseRail technical={technical} onTeam={() => onNavigate('team')} onViewers={() => setDialog('viewers')} />
    {controlsHost ? createPortal(controls, controlsHost) : controls}
    {dialog && <PulseDialogs dialog={dialog} milestoneId={milestoneId} onMilestone={setMilestone} onDialog={setDialog} onClose={() => { setDialog(null); setMilestone(null); }} onNavigate={onNavigate} />}
    {publish && snapshot && !preview && <WorkEditor kind="update" onClose={() => setPublish(false)} onSaved={() => { setPublish(false); pulse.refresh(); }} />}
    <span className="sr-only" role="status">{snapshot ? `Pulse ${snapshot.audience} audience loaded` : 'Pulse offline; shared data hidden.'}</span>
  </div>;
}

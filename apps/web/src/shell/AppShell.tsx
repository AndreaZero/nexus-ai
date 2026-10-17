import { useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Avatar, Badge, Button, Icon, NexusLogo, NexusMark } from '@nexus-ai/ui';
import { AmbientWave, SidebarPlanet } from '@nexus-ai/ui/effects';
import { shellCopy as copy } from './copy.js';
import type { ShellRoute } from './types.js';
import { useCollaboration } from '../collaboration/CollaborationProvider.js';
import { WorkspaceDialog } from '../collaboration/ProjectsPage.js';
import { DomainDialog } from '../collaboration/components.js';
import { useAccount } from '../auth/AuthProvider.js';
import { useCodex } from '../codex/CodexProvider.js';
import { APPROVALS_EVENT } from '../session/Approvals.js';
import { SHARE_SESSION_EVENT } from '../session/publication.js';
import { PresenceStack, RealtimeBadge } from '../realtime/RealtimePanels.js';
import { useOverview } from '../overview/OverviewProvider.js';

type IconName = ComponentProps<typeof Icon>['name'];
const navigation: { route: ShellRoute; label: string; icon: IconName; count?: number }[] = [
  { route: 'projects', label: copy.projects, icon: 'projects', count: 0 },
  { route: 'session', label: copy.liveSessions, icon: 'sessions', count: 0 },
  { route: 'team', label: copy.team, icon: 'team' },
  { route: 'tasks', label: copy.tasks, icon: 'tasks', count: 0 },
  { route: 'repos', label: copy.repos, icon: 'repos' },
  { route: 'portal', label: copy.portal, icon: 'portal' },
  { route: 'settings', label: copy.settings, icon: 'settings' },
];
const projectTabs: ShellRoute[] = ['overview', 'code', 'tasks', 'session', 'deployments', 'docs', 'pulse'];
const pulseTabs: ShellRoute[] = ['overview', 'code', 'pulse', 'deployments', 'docs'];

export interface AppShellProps {
  route: ShellRoute;
  onNavigate: (route: ShellRoute) => void;
  onSearch: () => void;
  onNotifications: () => void;
  reducedMotion: boolean;
  onToggleMotion: () => void;
  children: ReactNode;
}

export function AppShell({ route, onNavigate, onSearch, onNotifications, reducedMotion, onToggleMotion, children }: AppShellProps) {
  const data = useCollaboration();
  const account = useAccount();
  const codex = useCodex();
  const overview = useOverview();
  const [picker, setPicker] = useState<'workspace' | 'project' | null>(null);
  const isSession = route === 'session';
  const projectSection = ['overview', 'pulse', 'session', 'code', 'deployments', 'docs'].includes(route);
  const selectedNav = projectSection ? 'projects' : route;
  const isPulse = route === 'pulse' || route === 'portal';
  const tabs = isPulse ? pulseTabs : projectTabs;
  const now = new Date();
  const shortcutHint = navigator.userAgent.includes('Mac') ? '⌘ K' : 'Ctrl K';

  return <div className={`nexus-app${reducedMotion ? ' nexus-app--reduced-motion' : ''}`}>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); document.getElementById('main-content')?.scrollIntoView({ block: 'start' }); }}>Skip to content</a>
    <aside className="workspace-sidebar" aria-label="Workspace navigation">
      <div className="sidebar-brand"><NexusLogo /></div>
      <nav className="sidebar-nav" aria-label="Workspace">
        {navigation.map(item => <button type="button" key={item.route} className={`sidebar-item${selectedNav === item.route ? ' is-selected' : ''}`} aria-current={selectedNav === item.route ? 'page' : undefined} title={item.label} data-route={item.route} onClick={() => onNavigate(item.route)}>
          <Icon name={item.icon} size={20} /><span className="sidebar-item-label">{item.label}</span>{item.count !== undefined && <span className="sidebar-count">{item.route === 'projects' ? data.projects.length : item.route === 'session' ? codex.state.session?.status === 'running' ? 1 : 0 : item.count}</span>}
        </button>)}
      </nav>
      <div className="sidebar-ambient"><SidebarPlanet reducedMotion={reducedMotion} /><div className="sidebar-payoff">{copy.payoff.map(line => <span key={line}>{line}</span>)}<i /></div></div>
      <button type="button" className="workspace-switcher" title={data.workspace?.name ?? 'Select or create a workspace'} aria-haspopup="dialog" onClick={() => { if (data.ready) setPicker('workspace'); else onNavigate('projects'); }}><span className="workspace-switcher-mark"><NexusMark size={24} /></span><span><small>{copy.workspace}</small><strong>{data.workspace?.name ?? copy.selectWorkspace}</strong></span><Icon name="chevron-down" size={15} /></button>
    </aside>
    <div className="workspace-main">
      <header className={`workspace-header${isSession ? ' workspace-header--session' : ''}`}>
        <div className="global-bar"><div className="breadcrumb"><button type="button" data-route="projects" onClick={() => onNavigate('projects')}>{copy.projects}</button><Icon name="chevron-right" size={12} /><button type="button" data-route="overview" onClick={() => onNavigate('overview')}>{data.project?.name ?? copy.project}</button>{isSession && <><Icon name="chevron-right" size={12} /><span>{copy.sessionTitle}</span></>}</div>
          <div className="global-actions"><button type="button" className="global-search" onClick={onSearch}><Icon name="search" size={16} /><span>{copy.search}</span><kbd>{shortcutHint}</kbd></button><button type="button" className="global-icon" title={reducedMotion ? copy.motionOff : copy.motionOn} aria-label={reducedMotion ? copy.motionOff : copy.motionOn} aria-pressed={!reducedMotion} onClick={onToggleMotion}><Icon name="pulse" size={20} /></button><button type="button" className="global-icon notification-bell" title={copy.notifications} aria-label={`${copy.notifications}${overview.snapshot?.unreadCount ? ` · ${overview.snapshot.unreadCount} unread` : ''}`} onClick={onNotifications}><Icon name="bell" size={20} />{Boolean(overview.snapshot?.unreadCount) && <i aria-hidden="true" />}</button><button type="button" className="profile-button" title={copy.profile} aria-label={copy.profile} data-route="settings" onClick={() => onNavigate('settings')}><Avatar size={28} {...(account.state.user ? { name: account.state.user.name } : {})} /></button></div>
        </div>
        <div className="project-heading"><span className={`project-symbol${isSession ? ' project-symbol--session' : ''}`}><Icon name={isSession ? 'sessions' : 'projects'} size={24} /></span><div className="project-heading-copy"><div className="project-heading-title"><h1>{isSession ? copy.sessionTitle : data.project?.name ?? copy.project}</h1><Badge tone="neutral">{data.project?.role ?? copy.noProject}</Badge><button type="button" className="project-picker-button" aria-label="Select project" aria-haspopup="dialog" onClick={() => { if (data.projects.length) setPicker('project'); else onNavigate('projects'); }}><Icon name="chevron-down" size={15} /></button></div><p>{isSession ? copy.sessionDescription : data.project?.description || 'Your team, your work and AI — in one shared space.'}</p></div>
          {isSession ? <div className="session-toolbar"><PresenceStack /><RealtimeBadge /><Button size="sm" disabled={!codex.state.session?.messages.length} title="Choose a frozen excerpt or selected live text, then review before sharing." onClick={() => window.dispatchEvent(new Event(SHARE_SESSION_EVENT))}><Icon name="share" size={14} />{copy.share}</Button><Button size="sm" disabled={codex.busy || codex.state.session?.status !== 'running'} title="Interrupt the current turn. Send another message to continue this conversation." onClick={() => { const session = codex.state.session; if (session) void codex.request({ operation: 'interrupt', projectId: session.projectId, repositoryId: session.repositoryId }); }}><Icon name="pause" size={14} />{copy.pause}</Button><Button size="sm" disabled={!codex.state.session} aria-haspopup="dialog" title="Review pending local execution requests" onClick={() => window.dispatchEvent(new Event(APPROVALS_EVENT))}><Icon name="shield" size={15} />Approvals<Badge tone={codex.state.session?.approvals.length ? 'blue' : 'neutral'}>{codex.state.session?.approvals.length ?? 0}</Badge></Button><Button size="sm" disabled={codex.busy || codex.state.runtime !== 'ready'} title="Stop the local runtime and discard pending approvals. Reconnect in Settings." onClick={() => { void codex.request({ operation: 'disconnect' }); }}><Icon name="x" size={13} />Stop</Button><Button size="sm" variant="primary" disabled title="Publishing shared updates is not available yet."><Icon name="upload" size={15} />{copy.publish}</Button></div> : <div className="sync-summary"><span className="sync-dot" /><div><strong><RealtimeBadge /></strong><small>Project presence and selected messages</small></div><AmbientWave className="header-wave" variant="header" reducedMotion={reducedMotion} /><time dateTime={now.toISOString()}>{now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</time><Icon name="chevron-down" size={13} /></div>}
        </div>
        {!isSession && <nav className="project-tabs" aria-label="Project sections">{tabs.map(tab => <button type="button" key={tab} className={(route === tab || (route === 'portal' && tab === 'pulse')) ? 'is-selected' : ''} aria-current={(route === tab || (route === 'portal' && tab === 'pulse')) ? 'page' : undefined} data-route={tab} onClick={() => onNavigate(tab)}>{tab === 'pulse' ? isPulse ? copy.pulse : copy.portal : copy[tab]}</button>)}</nav>}
      </header>
      <main className={`workspace-content${isSession ? ' workspace-content--session' : ''}`} id="main-content" tabIndex={-1}>{children}</main>
    </div>
    {picker === 'workspace' && <WorkspaceDialog onClose={() => setPicker(null)} />}
    {picker === 'project' && <DomainDialog title="Select project" onClose={() => setPicker(null)}><div className="workspace-options">{data.projects.map(project => <button type="button" key={project.id} aria-pressed={project.id === data.project?.id} onClick={() => { data.selectProject(project.id); setPicker(null); onNavigate('overview'); }}><span className="domain-symbol"><Icon name="projects" /></span><span><strong>{project.name}</strong><small>{project.role}</small></span>{project.id === data.project?.id && <Icon name="check-circle" size={18} />}</button>)}</div></DomainDialog>}
  </div>;
}

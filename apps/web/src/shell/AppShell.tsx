import type { ComponentProps, ReactNode } from 'react';
import { Avatar, Badge, Button, Icon, NexusLogo, NexusMark } from '@nexus-ai/ui';
import { AmbientWave, SidebarPlanet } from '@nexus-ai/ui/effects';
import { shellCopy as copy } from './copy.js';
import type { ShellRoute } from './types.js';

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
          <Icon name={item.icon} size={20} /><span className="sidebar-item-label">{item.label}</span>{item.count !== undefined && <span className="sidebar-count">{item.count}</span>}
        </button>)}
      </nav>
      <div className="sidebar-ambient"><SidebarPlanet reducedMotion={reducedMotion} /><div className="sidebar-payoff">{copy.payoff.map(line => <span key={line}>{line}</span>)}<i /></div></div>
      <button type="button" className="workspace-switcher" disabled title={copy.workspaceUnavailable}><span className="workspace-switcher-mark"><NexusMark size={24} /></span><span><small>{copy.workspace}</small><strong>{copy.selectWorkspace}</strong></span><Icon name="chevron-down" size={15} /></button>
    </aside>
    <div className="workspace-main">
      <header className={`workspace-header${isSession ? ' workspace-header--session' : ''}`}>
        <div className="global-bar"><div className="breadcrumb"><button type="button" data-route="projects" onClick={() => onNavigate('projects')}>{copy.projects}</button><Icon name="chevron-right" size={12} /><button type="button" data-route="overview" onClick={() => onNavigate('overview')}>{copy.project}</button>{isSession && <><Icon name="chevron-right" size={12} /><span>{copy.sessionTitle}</span></>}</div>
          <div className="global-actions"><button type="button" className="global-search" onClick={onSearch}><Icon name="search" size={16} /><span>{copy.search}</span><kbd>{shortcutHint}</kbd></button><button type="button" className="global-icon" title={reducedMotion ? copy.motionOff : copy.motionOn} aria-label={reducedMotion ? copy.motionOff : copy.motionOn} aria-pressed={!reducedMotion} onClick={onToggleMotion}><Icon name="pulse" size={20} /></button><button type="button" className="global-icon" title={copy.notifications} aria-label={copy.notifications} onClick={onNotifications}><Icon name="bell" size={20} /></button><button type="button" className="profile-button" title={copy.profile} aria-label={copy.profile} data-route="settings" onClick={() => onNavigate('settings')}><Avatar size={28} /></button></div>
        </div>
        <div className="project-heading"><span className={`project-symbol${isSession ? ' project-symbol--session' : ''}`}><Icon name={isSession ? 'sessions' : 'projects'} size={24} /></span><div className="project-heading-copy"><div className="project-heading-title"><h1>{isSession ? copy.sessionTitle : copy.project}</h1><Badge tone="neutral">{copy.noProject}</Badge><Icon name="chevron-down" size={15} /></div><p>{isSession ? copy.sessionDescription : 'Your team, your work and AI — in one shared space.'}</p></div>
          {isSession ? <div className="session-toolbar"><Button size="sm" disabled title={copy.noSession}><Icon name="share" size={14} />{copy.share}</Button><Button size="sm" disabled title={copy.noSession}><Icon name="pause" size={14} />{copy.pause}</Button><Button size="sm" disabled title={copy.noSession}><Icon name="shield" size={15} />{copy.approvals}<Badge>0</Badge></Button><Button size="sm" variant="primary" disabled title={copy.noSession}><Icon name="upload" size={15} />{copy.publish}</Button></div> : <div className="sync-summary"><span className="sync-dot" /><div><strong>{copy.notConnected}</strong><small>{copy.syncDescription}</small></div><AmbientWave className="header-wave" variant="header" reducedMotion={reducedMotion} /><time dateTime={now.toISOString()}>{now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</time><Icon name="chevron-down" size={13} /></div>}
        </div>
        {!isSession && <nav className="project-tabs" aria-label="Project sections">{tabs.map(tab => <button type="button" key={tab} className={(route === tab || (route === 'portal' && tab === 'pulse')) ? 'is-selected' : ''} aria-current={(route === tab || (route === 'portal' && tab === 'pulse')) ? 'page' : undefined} data-route={tab} onClick={() => onNavigate(tab)}>{tab === 'pulse' ? isPulse ? copy.pulse : copy.portal : copy[tab]}</button>)}</nav>}
      </header>
      <main className={`workspace-content${isSession ? ' workspace-content--session' : ''}`} id="main-content" tabIndex={-1}>{children}</main>
    </div>
  </div>;
}

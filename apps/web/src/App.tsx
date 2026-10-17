import { useEffect, useState } from 'react';
import { Card, EmptyPanel, Icon } from '@nexus-ai/ui';
import { AppShell } from './shell/AppShell.js';
import type { ShellRoute } from './shell/types.js';
import { OverviewView } from './views/OverviewView.js';
import { PulseView } from './views/PulseView.js';
import { SessionView } from './views/SessionView.js';
import { ApplicationSettings } from './ApplicationSettings.js';
import { NavigationDialog } from './NavigationDialog.js';
import { NotificationsDialog } from './NotificationsDialog.js';
import { navigate, parseRoute, routes } from './routes.js';
import { useMotionPreference } from './use-motion-preference.js';
import './app.css';
import './integration.css';
import { AuthProvider } from './auth/AuthProvider.js';
import { AuthRoot } from './auth/AuthRoot.js';
import { isAccountPath } from './auth/configuration.js';

const sectionDescriptions: Partial<Record<ShellRoute, string>> = {
  projects: 'No projects are connected to this workspace.',
  team: 'Workspace members will appear here once a workspace is connected.',
  tasks: 'No tasks or milestones are available for this project.',
  repos: 'Connect a project to access its repositories.',
  code: 'No repository is connected. Project files and changes will appear here.',
  deployments: 'No environments or deployment builds are available.',
  docs: 'No project documents have been shared.',
};

export function App() {
  return <AuthProvider>{!window.nexusDesktop && isAccountPath(window.location.pathname) ? <AuthRoot /> : <ShellApp />}</AuthProvider>;
}

function ShellApp() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  const [dialog, setDialog] = useState<'navigation' | 'notifications' | null>(null);
  const motion = useMotionPreference();

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, '', '#/overview');
    const update = () => { setRoute(parseRoute(window.location.hash)); setDialog(null); };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setDialog((previous) => previous === 'navigation' ? null : 'navigation');
      }
    };
    window.addEventListener('hashchange', update);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('hashchange', update);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const viewProps = { onNavigate: navigate, reducedMotion: motion.reducedMotion };
  const section = routes.find((entry) => entry.id === route);
  const content = route === 'overview' ? <OverviewView {...viewProps} />
    : route === 'pulse' || route === 'portal' ? <PulseView {...viewProps} />
    : route === 'session' ? <SessionView {...viewProps} />
    : route === 'settings' ? <ApplicationSettings motion={motion} />
    : <div className="route-empty-layout"><Card title={section?.label ?? 'Workspace'} icon={<Icon name={route === 'team' ? 'team' : route === 'tasks' ? 'tasks' : route === 'repos' ? 'repos' : route === 'docs' ? 'book' : route === 'deployments' ? 'upload' : route === 'code' ? 'code' : 'projects'} />}><EmptyPanel title={`No ${route === 'code' ? 'files' : section?.label.toLowerCase() ?? 'items'} yet`} description={sectionDescriptions[route] ?? 'No content has been shared in this workspace.'} /></Card></div>;

  return <>
    <AppShell route={route} onNavigate={navigate} onSearch={() => setDialog('navigation')} onNotifications={() => setDialog('notifications')} reducedMotion={motion.reducedMotion} onToggleMotion={motion.systemReduced ? () => navigate('settings') : motion.toggle}>
      <div data-shell-route={route} className="route-content" key={route}>{content}</div>
    </AppShell>
    {dialog === 'navigation' && <NavigationDialog onNavigate={navigate} onClose={() => setDialog(null)} />}
    {dialog === 'notifications' && <NotificationsDialog onClose={() => setDialog(null)} />}
  </>;
}

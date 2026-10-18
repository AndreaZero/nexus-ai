import { Badge, Button, Card, Icon, StatusIndicator } from '@nexus-ai/ui';
import { useDesktopInfo } from './use-desktop-info.js';
import { useServerHealth } from './use-server-health.js';
import type { useMotionPreference } from './use-motion-preference.js';
import { AccountCard } from './auth/AccountCard.js';
import { CodexSettings } from './codex/CodexSettings.js';
import { useRealtime } from './realtime/RealtimeProvider.js';
import { PersonalSettings } from './application/PersonalSettings.js';
import { ConnectionSettings } from './application/ConnectionSettings.js';
import { useCodex } from './codex/CodexProvider.js';

interface ApplicationSettingsProps {
  motion: ReturnType<typeof useMotionPreference>;
}

export function ApplicationSettings({ motion }: ApplicationSettingsProps) {
  const desktop = useDesktopInfo();
  const server = useServerHealth();
  const realtime = useRealtime(); const codex = useCodex();
  const serverTone = server.state.status === 'healthy' ? 'positive' : server.state.status === 'checking' ? 'pending' : server.state.status === 'offline' || server.state.status === 'invalid' ? 'danger' : 'neutral';
  const serverLabel = server.state.status === 'healthy' ? 'HTTP service reachable' : server.state.status === 'checking' ? 'Checking connection…' : server.state.status === 'offline' ? 'Service unavailable' : server.state.status === 'invalid' ? 'Invalid server configuration' : 'Server not configured';

  return <div className="settings-layout">
    <div className="settings-column">
      <PersonalSettings />
      <AccountCard />
      <CodexSettings />
    </div>
    <div className="settings-column">
    <Card title="Application" icon={<Icon name="laptop" />}>
      <div data-testid="desktop-state"><StatusIndicator tone={desktop.status === 'error' ? 'danger' : 'neutral'}>{desktop.status === 'ready' ? `Desktop · ${desktop.info.platform === 'win32' ? 'Windows' : desktop.info.platform === 'darwin' ? 'macOS' : 'Linux'}` : desktop.status === 'web' ? 'Web browser' : desktop.status === 'loading' ? 'Reading device information…' : 'Device information unavailable'}</StatusIndicator></div>
      {desktop.status === 'ready' && <dl className="settings-details" data-testid="desktop-info"><div><dt>App version</dt><dd data-testid="app-version">{desktop.info.appVersion}</dd></div><div><dt>Platform</dt><dd>{desktop.info.platform} / {desktop.info.architecture}</dd></div><div><dt>Electron</dt><dd>{desktop.info.electronVersion}</dd></div></dl>}
      <p className="settings-note">Your files and AI credentials stay on your device.</p>
    </Card>
    <Card title="Connection" icon={<Icon name="server" />}>
      <div role="status" data-testid="server-state"><StatusIndicator tone={serverTone}>{serverLabel}</StatusIndicator></div>
      <dl className="settings-details"><div><dt>Server endpoint</dt><dd>{server.endpoint ?? 'Not configured'}</dd></div><div><dt>Realtime</dt><dd>{realtime.state.connection}</dd></div><div><dt>Last synchronization</dt><dd>{realtime.state.lastSyncedAt ? new Date(realtime.state.lastSyncedAt).toLocaleString() : 'Not observed'}</dd></div><div><dt>Database</dt><dd>{server.state.status === 'healthy' ? server.state.response.database === 'connected' ? 'Connected' : server.state.response.database === 'unavailable' ? 'Unavailable' : server.state.response.database === 'not_connected' ? 'Not connected' : 'Not configured' : 'Unknown'}</dd></div>{server.state.status === 'healthy' && <div><dt>Last HTTP check</dt><dd>{server.state.checkedAt.toLocaleTimeString()}</dd></div>}</dl>
      {server.endpoint && <Button size="sm" disabled={server.state.status === 'checking'} onClick={server.retry}><Icon name="refresh" size={14} />Retry connection</Button>}
    </Card>
    <ConnectionSettings />
    <Card title="Local project folders" icon={<Icon name="file" />}><p className="settings-note">Folders are bound to the selected project and your account on this device. Choose, replace or disconnect a folder from Repos.</p><dl className="settings-details"><div><dt>Selected project folder</dt><dd>{codex.bindingLoading ? 'Checking…' : codex.binding?.label ?? 'Not linked'}</dd></div></dl><a className="text-link" href="#/repos">Manage project folders</a></Card>
    <Card title="Appearance" icon={<Icon name="pulse" />}>
      <div className="settings-appearance"><span className="settings-note">Ambient animation</span><Badge tone="neutral">{motion.reducedMotion ? 'Reduced' : 'Enabled'}</Badge></div>
      <label className="settings-note"><input type="checkbox" checked={motion.reduceRequested || motion.systemReduced} disabled={motion.systemReduced} onChange={motion.toggle} /> Reduce motion</label>
      <p className="settings-note">{motion.systemReduced ? 'Your operating system requests reduced motion. Animations remain paused.' : 'Pause the planet, particles and ambient transitions. This preference is saved on this device.'}</p>
    </Card>
    </div>
  </div>;
}

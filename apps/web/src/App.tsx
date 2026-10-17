import { EmptyState, StatusIndicator } from '@nexus-ai/ui';
import { strings } from './strings.js';
import { useDesktopInfo } from './use-desktop-info.js';
import { useServerHealth } from './use-server-health.js';
import type { HealthState } from './use-server-health.js';
import './app.css';

const platformNames = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' } as const;

function ServerStatus({ state }: { state: HealthState }) {
  switch (state.status) {
    case 'checking': return <StatusIndicator tone="pending">{strings.serverPending}</StatusIndicator>;
    case 'healthy': return <StatusIndicator tone="positive">{strings.serverHealthy}</StatusIndicator>;
    case 'offline': return <StatusIndicator tone="danger">{strings.serverOffline}</StatusIndicator>;
    case 'invalid': return <StatusIndicator tone="danger">{strings.serverInvalid}</StatusIndicator>;
    case 'not_configured': return <StatusIndicator tone="neutral">{strings.serverNotConfigured}</StatusIndicator>;
  }
}

export function App() {
  const desktop = useDesktopInfo();
  const server = useServerHealth();

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-wordmark">{strings.brand}</span>
        <span className="app-tagline">{strings.tagline}</span>
      </header>
      <main className="app-main">
        <EmptyState title={strings.workspaceTitle}>
          <p>{strings.workspaceDescription}</p>
        </EmptyState>

        <section className="configuration" aria-labelledby="configuration-title">
          <h2 id="configuration-title">{strings.configuration}</h2>
          <div className="configuration-grid">
            <section className="configuration-panel" aria-labelledby="environment-title">
              <h3 id="environment-title">{strings.environment}</h3>
              <div aria-live="polite" aria-atomic="true" data-testid="desktop-state">
                {desktop.status === 'loading' && <StatusIndicator tone="pending">{strings.runtimePending}</StatusIndicator>}
                {desktop.status === 'error' && <StatusIndicator tone="danger">{strings.runtimeError}</StatusIndicator>}
                {desktop.status === 'web' && <StatusIndicator tone="neutral">{strings.browser}</StatusIndicator>}
                {desktop.status === 'ready' && <StatusIndicator tone="neutral">{strings.desktop} · {platformNames[desktop.info.platform]}</StatusIndicator>}
              </div>
              {desktop.status === 'ready' && (
                <dl className="details" data-testid="desktop-info">
                  <div><dt>{strings.version}</dt><dd data-testid="app-version">{desktop.info.appVersion}</dd></div>
                  <div><dt>{strings.platform}</dt><dd data-testid="platform">{desktop.info.platform}</dd></div>
                  <div><dt>{strings.architecture}</dt><dd>{desktop.info.architecture}</dd></div>
                  <div><dt>{strings.electron}</dt><dd>{desktop.info.electronVersion}</dd></div>
                </dl>
              )}
              <div className="runtime-status">
                <span className="detail-label">{strings.runtime}</span>
                <p>{desktop.status === 'web' ? strings.runtimeWeb : strings.runtimeUnavailable}</p>
              </div>
            </section>

            <section className="configuration-panel" aria-labelledby="server-title">
              <h3 id="server-title">{strings.server}</h3>
              <div role="status" aria-atomic="true" data-testid="server-state"><ServerStatus state={server.state} /></div>
              {server.endpoint && <dl className="details"><div className="detail-endpoint"><dt>{strings.endpoint}</dt><dd>{server.endpoint}</dd></div></dl>}
              {(server.state.status === 'not_configured' || server.state.status === 'invalid') && <p className="configuration-note">{strings.serverNotConfiguredDetail}</p>}
              {server.state.status === 'offline' && (
                <p className="configuration-note">{server.state.reason === 'timeout' ? strings.serverTimeout : server.state.reason === 'response' ? strings.serverInvalidResponse : strings.serverNetworkError}</p>
              )}
              {server.state.status === 'healthy' && (
                <>
                  <dl className="details">
                    <div><dt>{strings.database}</dt><dd>{server.state.response.database === 'not_configured' ? strings.databaseNotConfigured : strings.databaseNotConnected}</dd></div>
                    <div><dt>{strings.checkedAt}</dt><dd><time dateTime={server.state.checkedAt.toISOString()}>{server.state.checkedAt.toLocaleTimeString()}</time></dd></div>
                  </dl>
                  <p className="configuration-note">{strings.healthNote}</p>
                </>
              )}
              {server.endpoint && <button className="retry-button" type="button" onClick={server.retry} disabled={server.state.status === 'checking'}>{strings.retry}</button>}
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}

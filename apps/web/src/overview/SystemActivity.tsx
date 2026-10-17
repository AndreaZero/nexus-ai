import { useEffect, useRef, useState } from 'react';
import { telemetryResponseSchema } from '@nexus-ai/contracts';
import type { TelemetryState } from '@nexus-ai/contracts';
import { Card } from '@nexus-ai/ui';
import { useCollaboration } from '../collaboration/CollaborationProvider.js';
import { useCodex } from '../codex/CodexProvider.js';
import { samplePoints } from './state.js';
import { useRealtime } from '../realtime/RealtimeProvider.js';
import { useAccount } from '../auth/AuthProvider.js';
export function SystemActivity() {
  const { project } = useCollaboration(); const codex = useCodex(); const { state: realtime } = useRealtime(); const account = useAccount(); const [state, setState] = useState<TelemetryState | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const role = realtime.presence.find(member => member.userId === account.state.user?.id)?.role ?? project?.role;
  const scope = `${project?.id}:${project?.repository?.id}:${role}:${codex.binding?.updatedAt}`;
  const current = useRef(scope); current.current = scope; const live = useRef(false);
  const optedIn = useRef(false); optedIn.current = state?.enabled ?? false;
  const enabled = Boolean(window.nexusDesktop?.telemetry && codex.binding && realtime.connection === 'online' && (role === 'owner' || role === 'developer'));
  useEffect(() => {
    live.current = true; setState(null); setError(''); let stopped = false;
    async function read() {
      if (stopped || !enabled || !project?.repository || !window.nexusDesktop?.telemetry || document.visibilityState === 'hidden') return;
      try { const result = telemetryResponseSchema.parse(await window.nexusDesktop.telemetry.request({ operation: 'getState', projectId: project.id, repositoryId: project.repository.id })); if (stopped || current.current !== scope) return; if (!result.ok) throw new Error(result.message); setState(result.state); setError(''); }
      catch (cause) { if (!stopped && current.current === scope) { setState(null); setError(cause instanceof Error ? cause.message : 'Device measurements unavailable.'); } }
    }
    function stop() { if (optedIn.current && project?.repository && window.nexusDesktop?.telemetry) { optedIn.current = false; void window.nexusDesktop.telemetry.request({ operation: 'setEnabled', projectId: project.id, repositoryId: project.repository.id, enabled: false }).then(value => { if (!stopped && current.current === scope) { const result = telemetryResponseSchema.parse(value); if (result.ok) setState(result.state); else setState(null); } }).catch(() => {}); } }
    const visible = () => { if (document.visibilityState === 'hidden') stop(); else void read(); };
    void read(); document.addEventListener('visibilitychange', visible);
    return () => { stop(); stopped = true; live.current = false; document.removeEventListener('visibilitychange', visible); };
  }, [scope, enabled, project?.id, project?.repository?.id]);
  async function toggle() {
    if (!enabled || !project?.repository || !window.nexusDesktop?.telemetry || busy) return; const identity = scope; setBusy(true); setError('');
    try { const result = telemetryResponseSchema.parse(await window.nexusDesktop.telemetry.request({ operation: 'setEnabled', projectId: project.id, repositoryId: project.repository.id, enabled: !state?.enabled })); if (!live.current || current.current !== identity) return; if (!result.ok) throw new Error(result.message); setState(result.state); }
    catch (cause) { if (live.current && current.current === identity) setError(cause instanceof Error ? cause.message : 'Measurements unavailable.'); }
    finally { if (live.current && current.current === identity) setBusy(false); }
  }
  // Enabling starts a bounded polling effect; disabling removes it immediately.
  useEffect(() => { if (!state?.enabled || !project?.repository || !window.nexusDesktop?.telemetry) return; let reading = false; const identity = scope; const timer = setInterval(() => { if (document.visibilityState === 'hidden' || reading) return; reading = true; void window.nexusDesktop!.telemetry.request({ operation: 'getState', projectId: project.id, repositoryId: project.repository!.id }).then(value => { const result = telemetryResponseSchema.parse(value); if (live.current && current.current === identity) { if (result.ok) setState(result.state); else { setState(null); setError(result.message); } } }).catch(() => { if (live.current && current.current === identity) { setState(null); setError('Measurements unavailable. Retry enabling them.'); } }).finally(() => { reading = false; }); }, 2000); return () => clearInterval(timer); }, [state?.enabled, scope, project?.id, project?.repository?.id]);
  const latest = state?.samples.at(-1);
  const lines = [{ name: 'CPU', color: '#00caff', values: state?.samples.map(item => item.cpuPercent) ?? [] }, { name: 'Memory', color: '#9971ff', values: state?.samples.map(item => item.memoryPercent) ?? [] }];
  return <Card title="System Activity" className="system-card" action={<span className="telemetry-summary">CPU {latest?.cpuPercent === null || !latest ? '—' : `${latest.cpuPercent.toFixed(0)}%`} <span>Memory {latest ? latest.memoryPercent.toFixed(0) + '%' : '—'}</span> Network —</span>} bodyClassName="system-card-body"><div className="overview-system-chart">{state?.enabled && state.samples.length ? <svg viewBox="0 0 360 44" preserveAspectRatio="none" role="img" aria-label={`Local device, latest ${state.samples.length} samples at two second intervals. CPU ${latest?.cpuPercent?.toFixed(1) ?? 'unknown'} percent. Memory ${latest?.memoryPercent.toFixed(1)} percent. Network unavailable.`}><path d="M0 11H360M0 22H360M0 33H360" stroke="#173044" fill="none" />{lines.flatMap(line => samplePoints(line.values).join('|').split(/\|{2,}/).filter(Boolean).map((points, index) => <polyline key={line.name + index} points={points.replaceAll('|', ' ')} fill="none" stroke={line.color} strokeWidth="1.4" />))}</svg> : <span>{error || (enabled ? 'Device measurements off · local only, never uploaded' : 'Local device measurements require desktop and a linked folder')}</span>}</div><div className="overview-system-footer"><span><i />CPU <i />Memory · 2 min · network unknown</span><button className="text-link" type="button" disabled={!enabled || busy} aria-pressed={state?.enabled ?? false} onClick={() => { void toggle(); }}>{state?.enabled ? 'Disable' : 'Enable'}</button></div></Card>;
}

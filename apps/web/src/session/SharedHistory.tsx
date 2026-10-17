import { useEffect, useRef, useState } from 'react';
import type { ProjectTask, SharedMessage, SharedSession } from '@nexus-ai/contracts';
import { Badge, Button, EmptyPanel, Icon } from '@nexus-ai/ui';
import { sessionsRequest } from './client.js';
import { useRealtime } from '../realtime/RealtimeProvider.js';

export function useProjectHistory(projectId: string | undefined, enabled: boolean, version: number) {
  const { state: realtime } = useRealtime();
  const [tasks, setTasks] = useState<ProjectTask[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [revision, refresh] = useState(0);
  useEffect(() => {
    let live = true; setTasks([]); setError('');
    if (!enabled || !projectId) return;
    setLoading(true);
    void Promise.allSettled([sessionsRequest({ operation: 'listProjectTasks', projectId })]).then(results => {
      if (!live) return;
      for (const result of results) {
        if (result.status === 'fulfilled') { if (result.value.kind === 'tasks') setTasks(result.value.items); }
        else setError(result.reason instanceof Error ? result.reason.message : 'Project history is unavailable.');
      }
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [projectId, enabled, version, revision]);
  const authorized = realtime.connection === 'online' && realtime.projectId === projectId;
  return { items: authorized ? realtime.snapshot?.sessions ?? [] : [], tasks: authorized ? tasks : [], loading, error, refresh: () => refresh(value => value + 1) };
}
export function SharedHistory({ items, projectId, loading, error, onRefresh }: { items: SharedSession[]; projectId: string | undefined; loading: boolean; error: string; onRefresh(): void }) {
  const [detail, setDetail] = useState<{ item: SharedSession; messages: SharedMessage[] } | null>(null); const [readError, setReadError] = useState(''); const [reading, setReading] = useState(false); const ticket = useRef(0);
  const { state: realtime } = useRealtime();
  const projection = `${projectId}:${realtime.connection}:${realtime.cursor}`;
  const currentProjection = useRef(projection); currentProjection.current = projection;
  const detailProjection = useRef('');
  useEffect(() => { ++ticket.current; setDetail(null); setReadError(''); setReading(false); }, [projection]);
  useEffect(() => () => { ++ticket.current; }, []);
  async function read(id: string) {
    if (!projectId || realtime.connection !== 'online' || !items.some(item => item.id === id)) return; const revision = ++ticket.current; const scope = projection; setReadError(''); setReading(true);
    try { const result = await sessionsRequest({ operation: 'read', projectId, sessionId: id }); if (revision === ticket.current && scope === currentProjection.current && result.kind === 'session') { detailProjection.current = scope; setDetail({ item: result.item, messages: result.messages }); } }
    catch (cause) { if (revision === ticket.current && scope === currentProjection.current) setReadError(cause instanceof Error ? cause.message : 'This excerpt is unavailable.'); }
    finally { if (revision === ticket.current && scope === currentProjection.current) setReading(false); }
  }
  return <section className="shared-history"><header><strong>Published session history</strong><Button size="sm" disabled={loading || reading || !projectId} onClick={() => { ++ticket.current; setDetail(null); onRefresh(); }}>Refresh</Button></header><p>Read only excerpts explicitly published to this project. Local conversations stay on their device.</p>{(error || readError) && <p role="alert" className="codex-session-error">{error || readError}</p>}{loading || reading ? <p role="status">Loading shared history…</p> : detail && detailProjection.current === projection && realtime.connection === 'online' && items.some(item => item.id === detail.item.id) ? <><Button size="sm" onClick={() => setDetail(null)}>← All excerpts</Button><h3>{detail.item.title}</h3><p>{detail.item.author.name} · {new Date(detail.item.updatedAt).toLocaleString()} · {detail.item.visibility} · v{detail.item.version}</p><div className="shared-message-list">{detail.messages.map(item => <article key={item.id}><strong>{item.role === 'user' ? detail.item.author.name : 'Codex'}</strong><pre>{item.text}</pre></article>)}</div></> : items.length ? <div className="session-history-list">{items.map(item => <button type="button" key={item.id} onClick={() => { void read(item.id); }}><Icon name="sessions" size={16} /><span><strong>{item.title}</strong><small>{item.author.name} · {item.messageCount} messages · {new Date(item.updatedAt).toLocaleString()}</small></span><Badge tone="neutral">{item.visibility}</Badge></button>)}</div> : <EmptyPanel compact title="No published excerpts" description="Use Share in a local session to select and review messages before publishing." />}</section>;
}
export function TaskRows({ tasks }: { tasks: ProjectTask[] }) { return tasks.length ? <div className="session-task-rows">{tasks.map(item => <div key={item.id}><Icon name="tasks" size={14} /><strong>{item.title}</strong><Badge tone={item.status === 'done' ? 'success' : item.status === 'in_progress' ? 'blue' : 'neutral'}>{item.status.replaceAll('_', ' ')}</Badge></div>)}</div> : <EmptyPanel compact title="No project tasks yet" description="Project tasks appear here when they are available to your role." />; }

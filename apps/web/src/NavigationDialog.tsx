import { useEffect, useId, useRef, useState } from 'react';
import { Button, EmptyPanel, Icon } from '@nexus-ai/ui';
import type { SearchHit } from '@nexus-ai/contracts';
import { routes } from './routes.js';
import type { ShellRoute } from './shell/types.js';
import { useAccount } from './auth/AuthProvider.js';
import { useCollaboration } from './collaboration/CollaborationProvider.js';
import { applicationRequest } from './application/client.js';
import { searchHref } from './application/state.js';
import { useRealtime } from './realtime/RealtimeProvider.js';
import { isDialogBackdropClick } from './dialog.js';

const kinds: { value: SearchHit['kind']; label: string }[] = [{ value: 'project', label: 'Projects' }, { value: 'task', label: 'Tasks' }, { value: 'milestone', label: 'Milestones' }, { value: 'document', label: 'Documents' }, { value: 'update', label: 'Updates' }, { value: 'deliverable', label: 'Deliverables' }, { value: 'shared_session', label: 'Shared excerpts & messages' }, { value: 'live_share', label: 'Shared live messages' }, { value: 'deployment', label: 'Deployment records' }, { value: 'environment', label: 'Environments' }];
export function NavigationDialog({ onClose, onNavigate }: { onClose(): void; onNavigate(route: ShellRoute): void }) {
  const dialog = useRef<HTMLDialogElement>(null); const search = useRef<HTMLInputElement>(null); const titleId = useId();
  const collaboration = useCollaboration(); const account = useAccount(); const userId = account.state.status === 'signed_in' ? account.state.user?.id : null;
  const realtime = useRealtime().state;
  const currentUser = useRef(userId); currentUser.current = userId;
  const [query, setQuery] = useState(''); const [kind, setKind] = useState<SearchHit['kind'] | ''>(''); const [scope, setScope] = useState('all');
  const [items, setItems] = useState<SearchHit[]>([]); const [next, setNext] = useState<number | null>(null); const [loading, setLoading] = useState(false); const [opening, setOpening] = useState(false); const [error, setError] = useState(''); const [searched, setSearched] = useState(false);
  const ticket = useRef(0); const controller = useRef<AbortController | null>(null);
  const cancelled = useRef(false);
  const submitted = useRef<{ query: string; kind: SearchHit['kind'] | null; projectId: string | null } | null>(null);
  const pageResults = routes.filter(route => `${route.label} ${route.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => { const previous = document.activeElement; const element = dialog.current; element?.showModal(); search.current?.focus(); const offline = () => { ++ticket.current; controller.current?.abort(); setItems([]); setNext(null); setLoading(false); setError('You are offline. Reconnect and search again.'); }; window.addEventListener('offline', offline); return () => { ++ticket.current; controller.current?.abort(); window.removeEventListener('offline', offline); element?.close(); if (previous instanceof HTMLElement) previous.focus(); }; }, []);
  useEffect(() => { ++ticket.current; controller.current?.abort(); setItems([]); setNext(null); setLoading(false); setSearched(false); submitted.current = null; }, [collaboration.project?.id, collaboration.project?.role, realtime.connection, realtime.cursor]);
  function close() { cancelled.current = true; onClose(); }
  function edit(change: () => void) { ++ticket.current; controller.current?.abort(); setItems([]); setNext(null); setLoading(false); setError(''); setSearched(false); submitted.current = null; change(); }
  async function run(offset = 0) {
    if (!userId || loading || opening || !navigator.onLine || query.trim().length < 2) return;
    const request = offset && submitted.current ? submitted.current : { query: query.trim(), kind: kind || null, projectId: scope === 'current' ? collaboration.project?.id ?? null : null };
    if (scope === 'current' && !request.projectId) return;
    submitted.current = request; const ownTicket = ++ticket.current; controller.current?.abort(); const abort = new AbortController(); controller.current = abort; setLoading(true); setError(''); setSearched(true);
    try { const result = await applicationRequest({ operation: 'search', ...request, offset, limit: 30 }, abort.signal); if (ticket.current === ownTicket && currentUser.current === userId && navigator.onLine && result.kind === 'search') { setItems(previous => offset ? [...previous, ...result.items].slice(0, 500) : result.items); setNext(result.nextOffset); } }
    catch (cause) { if (ticket.current === ownTicket) { setItems([]); setNext(null); setError(cause instanceof Error ? cause.message : 'Search unavailable. Retry.'); } }
    finally { if (ticket.current === ownTicket) setLoading(false); }
  }
  async function open(hit: SearchHit) {
    if (opening || !userId || !navigator.onLine) return; setOpening(true); setError('');
    try { const selected = await collaboration.refresh({ workspaceId: hit.workspaceId, projectId: hit.projectId }, { requireExact: true }); if (selected && !cancelled.current && currentUser.current === userId) { window.location.hash = searchHref(hit); onClose(); } }
    catch (cause) { setItems([]); setNext(null); setError(cause instanceof Error ? cause.message : 'Project access could not be verified. Search again.'); }
    finally { setOpening(false); }
  }
  return <dialog ref={dialog} className="navigation-dialog application-search-dialog" aria-labelledby={titleId} aria-busy={loading || opening} onCancel={close} onClick={event => { if (isDialogBackdropClick(event)) close(); }}><div className="navigation-dialog__inner">
    <div className="navigation-dialog__heading"><h2 id={titleId}>Search your workspace</h2><button type="button" className="icon-control" aria-label="Close search" onClick={close}><Icon name="x" size={18} /></button></div>
    <form onSubmit={event => { event.preventDefault(); void run(); }}><label className="navigation-dialog__search"><Icon name="search" size={18} /><input ref={search} maxLength={200} value={query} onChange={event => edit(() => setQuery(event.target.value))} placeholder="Projects, tasks, documents, shared messages…" aria-label="Search authorized content" /></label><div className="application-search-filters"><label>Scope<select aria-label="Search scope" value={scope} onChange={event => edit(() => setScope(event.target.value))}><option value="all">All accessible projects</option><option value="current" disabled={!collaboration.project}>Current project</option></select></label><label>Type<select aria-label="Search type" value={kind} onChange={event => edit(() => setKind(event.target.value as SearchHit['kind'] | ''))}><option value="">All content</option>{kinds.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><Button type="submit" variant="primary" size="sm" disabled={!userId || query.trim().length < 2 || loading || opening || !navigator.onLine}>{loading ? 'Searching…' : 'Search'}</Button></div></form>
    <p className="application-search-note">Only currently authorized project content and explicitly shared message text. Local Codex conversations and files stay on their device.</p>
    {error && <p role="alert" className="domain-feedback--error">{error}</p>}
    <div className="navigation-dialog__results" aria-label="Search results">{items.map(hit => <button type="button" className="navigation-result application-search-hit" disabled={opening} key={`${hit.kind}:${hit.id}`} onClick={() => { void open(hit); }}><span><strong>{hit.title}</strong><small>{kinds.find(kind => kind.value === hit.kind)?.label} · {hit.projectName}</small>{hit.excerpt && <small className="search-excerpt">{hit.excerpt}</small>}</span><Icon name="arrow-right" size={16} /></button>)}{searched && !items.length && !loading && !error && <EmptyPanel compact title="No authorized matches" description="Try another phrase, type or project scope." />}{next !== null && items.length < 500 && <Button size="sm" disabled={loading || opening} onClick={() => { void run(next); }}>Load more results</Button>}{!searched && <><h3 className="application-search-section">Pages</h3>{pageResults.map(route => <button type="button" className="navigation-result" key={route.id} onClick={() => { onNavigate(route.id); close(); }}><span><strong>{route.label}</strong><small>{route.description}</small></span><Icon name="arrow-right" size={16} /></button>)}</>}</div>
    <div className="navigation-dialog__footer"><span>{opening ? 'Verifying current project access…' : items.length ? `${items.length} results loaded${next !== null ? ' · more available' : ''}` : 'Enter at least two characters, then search'}</span><kbd>Esc to close</kbd></div>
  </div></dialog>;
}

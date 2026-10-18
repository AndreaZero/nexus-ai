import { useRef, useState } from 'react';
import type { CodexSession } from '@nexus-ai/contracts';
import { Button, Icon } from '@nexus-ai/ui';
import { DomainDialog, Feedback } from '../collaboration/components.js';
import { sessionsRequest } from './client.js';
import { excerpt, excerptValid } from './publication.js';

import { useApplication } from '../application/ApplicationProvider.js';
function deviceId() {
  try { const existing = localStorage.getItem('nexus.device.id'); if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing; const id = crypto.randomUUID(); localStorage.setItem('nexus.device.id', id); return id; } catch { return crypto.randomUUID(); }
}
export function PublishSession({ session, onClose, onPublished }: { session: CodexSession; onClose(): void; onPublished(): void }) {
  const application = useApplication();
  // Freeze the local excerpt while the user reviews it. Streaming never changes the preview.
  const source = useRef(session.messages.map(item => ({ ...item }))).current;
  const sessionId = useRef(crypto.randomUUID()).current; const device = useRef(deviceId()).current;
  const [title, setTitle] = useState('Session excerpt'); const [visibility, setVisibility] = useState<'team' | 'client'>(application.preferences.defaultVisibility);
  const [selection, setSelection] = useState<string[]>([]); const [review, setReview] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [version, setVersion] = useState(0);
  const messages = excerpt(source, selection); const valid = excerptValid(messages) && Boolean(title.trim());
  async function publish() {
    if (!valid || !review || busy) return;
    setBusy(true); setError('');
    try {
      const result = await sessionsRequest({ operation: 'publish', projectId: session.projectId, sessionId, expectedVersion: version, deviceId: device, title: title.trim(), status: session.status === 'idle' ? 'created' : session.status, visibility, messages });
      if (result.kind !== 'session') throw new Error('The publication response could not be confirmed. Retry this same excerpt.');
      setVersion(result.item.version); onPublished(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Publication failed. Retry this same excerpt.'); }
    finally { setBusy(false); }
  }
  return <DomainDialog title={review ? 'Review shared excerpt' : 'Share a session excerpt'} onClose={onClose} busy={busy}><div className="session-publish-body"><p>Only the selected message text and title will be uploaded, with its audience and publication details. File attachments, raw tool activity and Codex credentials are not added. Review the text itself for paths, code and private information.</p><label className="session-field">Title<input maxLength={140} value={title} disabled={busy} onChange={event => { setTitle(event.target.value); setReview(false); }} /></label><label className="session-field">Audience<select value={visibility} disabled={busy} onChange={event => { setVisibility(event.target.value as 'team' | 'client'); setReview(false); }}><option value="team">Project team · owners and developers</option><option value="client">Project team and clients</option></select></label>{visibility === 'client' && <p className="codex-notice">Clients in this project can read this excerpt. Check every selected message for private information before publishing.</p>}
    {review ? <div className="shared-message-list" aria-label="Publication preview">{messages.map(item => <article key={item.id}><strong>{item.role === 'user' ? 'You' : 'Codex'}</strong><pre>{item.text}</pre></article>)}</div> : <div className="session-publish-selection">{source.filter(item => item.text.trim()).map(item => <label key={item.id}><input type="checkbox" checked={selection.includes(item.id)} disabled={busy || item.status === 'streaming' || item.text.length > 32768} onChange={event => { setSelection(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id)); }} /><span><strong>{item.role === 'user' ? 'You' : 'Codex'}{item.status === 'streaming' ? ' · still streaming' : item.text.length > 32768 ? ' · too long to publish' : ''}</strong><span>{item.text.slice(0, 240)}{item.text.length > 240 ? '…' : ''}</span></span></label>)}</div>}
    <p className="session-selection-count">{messages.length} / 20 messages · {messages.reduce((total, item) => total + item.text.length, 0).toLocaleString()} / 131,072 characters</p><Feedback error={error} /><div className="domain-actions">{review ? <><Button disabled={busy} onClick={() => setReview(false)}>Back to selection</Button><Button variant="primary" disabled={busy || !valid} onClick={() => { void publish(); }}><Icon name="upload" size={14} />{busy ? 'Publishing…' : 'Confirm and publish'}</Button></> : <Button variant="primary" disabled={!valid} onClick={() => setReview(true)}>Review selected messages</Button>}</div></div></DomainDialog>;
}

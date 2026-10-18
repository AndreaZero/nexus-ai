import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Member, WorkAttachment, WorkItem, WorkKind, WorkRequest } from '@nexus-ai/contracts';
import { Badge, Button, Icon } from '@nexus-ai/ui';
import { DomainDialog, Feedback } from '../collaboration/components.js';
import { collaborationRequest } from '../collaboration/client.js';
import { useRealtime } from '../realtime/RealtimeProvider.js';
import { attachmentType, taskStatuses } from './state.js';
import { useWork, useWorkList, useWorkMutation } from './WorkProvider.js';

import { useApplication } from '../application/ApplicationProvider.js';
export type EditableKind = Extract<WorkKind, 'task' | 'milestone' | 'document' | 'update' | 'deliverable'>;
interface ChosenFile { file: File; mime: string; requestId: string; uploaded: WorkAttachment | null }
function fileBase64(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('The selected file could not be read.')); reader.onload = () => resolve(String(reader.result).split(',')[1] ?? ''); reader.readAsDataURL(file); }); }
export function WorkEditor({ kind, item, onClose, onSaved }: { kind: EditableKind; item?: WorkItem; onClose(): void; onSaved(kind: WorkKind, id: string): void }) {
  const application = useApplication(); const work = useWork(); const mutation = useWorkMutation(); const realtime = useRealtime().state;
  const milestones = useWorkList('milestone'); const tasks = useWorkList('task'); const documents = useWorkList('document');
  const [title, setTitle] = useState(item?.title ?? ''); const [body, setBody] = useState(item?.body ?? ''); const [visibility, setVisibility] = useState<'team' | 'client'>(item?.visibility ?? application.preferences.defaultVisibility);
  const [status, setStatus] = useState<'todo' | 'in_progress' | 'review' | 'done'>(item?.kind === 'task' ? item.status as 'todo' | 'in_progress' | 'review' | 'done' : 'todo');
  const [assignee, setAssignee] = useState(item?.assignee?.id ?? ''); const [milestone, setMilestone] = useState(item?.milestoneId ?? ''); const [due, setDue] = useState(item?.dueAt?.slice(0, 10) ?? '');
  const [source, setSource] = useState(item?.sourceSessionId ?? ''); const [task, setTask] = useState(item?.taskId ?? ''); const [documentId, setDocument] = useState(item?.documentId ?? '');
  const [members, setMembers] = useState<Member[]>([]); const [files, setFiles] = useState<ChosenFile[]>([]); const [retained, setRetained] = useState(item?.attachments ?? []); const [fileError, setFileError] = useState(''); const [uploading, setUploading] = useState(false); const [preview, setPreview] = useState(false);
  const publishing = kind === 'update' || kind === 'deliverable' || kind === 'document' && visibility === 'client'; const busy = mutation.busy || uploading; const allowed = work.technical && work.online;
  useEffect(() => { let live = true; if (work.projectId && work.technical) void collaborationRequest({ operation: 'listMembers', scope: { kind: 'project', projectId: work.projectId } }).then(result => { if (live && result.kind === 'members') setMembers(result.items); }).catch(() => { if (live) setMembers([]); }); return () => { live = false; }; }, [work.projectId, work.technical]);
  const excerpts = realtime.snapshot?.sessions.filter(session => visibility === 'team' || session.visibility === 'client') ?? [];
  const visibleMilestones = milestones.items.filter(row => visibility === 'team' || row.visibility === 'client');
  async function discard(chosen: ChosenFile) {
    if (!chosen.uploaded || !work.projectId) return;
    const result = await work.mutate({ operation: 'deleteAttachment', projectId: work.projectId, requestId: crypto.randomUUID(), id: chosen.uploaded.id });
    if (result.kind !== 'attachmentDeleted') throw new Error('The unpublished attachment could not be removed.');
    chosen.uploaded = null;
  }
  async function cancelEditor() {
    if (busy) return; setUploading(true); setFileError('');
    try { if (work.online) for (const chosen of files) await discard(chosen); }
    catch { /* Cancel remains usable during outage; retained uploads are recoverable in Manage unused uploads. */ }
    finally { setUploading(false); onClose(); }
  }
  async function removeChosen(chosen: ChosenFile) {
    setUploading(true); setFileError('');
    try { await discard(chosen); setFiles(previous => previous.filter(row => row !== chosen)); }
    catch (cause) { setFileError(cause instanceof Error ? cause.message : 'Unpublished file removal failed. Retry.'); }
    finally { setUploading(false); }
  }
  function selectFiles(list: FileList | null) {
    setFileError(''); if (!list) return;
    try { if (retained.length + files.length + list.length > 5) throw new Error('A deliverable can contain up to five files.'); const selected = Array.from(list).map(file => { if (file.size < 1 || file.size > 1048576) throw new Error(`${file.name}: select a non-empty file up to 1 MiB.`); return { file, mime: attachmentType(file.name, file.type), requestId: crypto.randomUUID(), uploaded: null }; }); setFiles(previous => [...previous, ...selected]); }
    catch (cause) { setFileError(cause instanceof Error ? cause.message : 'Choose a supported file.'); }
  }
  async function submit(event?: FormEvent) {
    event?.preventDefault(); if (!allowed || busy || !work.projectId) return;
    if (publishing && !preview) { setPreview(true); return; }
    let attachmentIds = retained.map(file => file.id);
    if (kind === 'deliverable') {
      setUploading(true); setFileError('');
      try {
        for (const chosen of files) {
          if (!chosen.uploaded) {
            const result = await work.request({ operation: 'uploadAttachment', projectId: work.projectId, requestId: chosen.requestId, name: chosen.file.name, mime: chosen.mime, base64: await fileBase64(chosen.file) });
            if (result.kind !== 'uploaded') throw new Error('Unexpected upload response.'); chosen.uploaded = result.attachment;
          }
          attachmentIds = [...attachmentIds, chosen.uploaded.id];
        }
      } catch (cause) { setFileError(cause instanceof Error ? cause.message : 'Upload unavailable. Retry with the same selected files.'); setUploading(false); return; }
      setUploading(false);
    }
    const base = { projectId: work.projectId, requestId: crypto.randomUUID(), id: item?.id ?? null, expectedVersion: item?.version ?? 0, title: title.trim(), body, visibility };
    const provenance = { sourceSessionId: source || null, taskId: task || null, documentId: documentId || null };
    const input: WorkRequest = kind === 'task' ? { ...base, operation: 'saveTask', status, assigneeId: assignee || null, milestoneId: milestone || null, sourceSessionId: source || null }
      : kind === 'milestone' ? { ...base, operation: 'saveMilestone', dueAt: due ? new Date(`${due}T12:00:00Z`).toISOString() : null }
      : kind === 'document' ? { ...base, operation: 'saveDocument', ...provenance }
      : kind === 'deliverable' ? { ...base, operation: 'publishDeliverable', ...provenance, attachmentIds }
      : { operation: 'publishUpdate', projectId: work.projectId, requestId: base.requestId, title: base.title, body, visibility, ...provenance };
    const result = await mutation.run(input); if (result?.kind === 'changed') onSaved(result.entityKind, result.id);
  }
  return <DomainDialog title={`${item ? kind === 'deliverable' ? 'Publish next revision' : 'Edit' : publishing ? 'Publish' : 'Create'} ${kind}`} onClose={() => { void cancelEditor(); }} busy={busy}><form className="domain-form work-editor" onSubmit={event => { void submit(event); }}>
    {!allowed ? <p role="alert">Reconnect with project owner or developer access to edit.</p> : preview ? <section className="work-publication-preview" aria-label="Publication preview"><span className="domain-eyebrow">REVIEW BEFORE PUBLISHING</span><h3>{title}</h3><Badge tone={visibility === 'client' ? 'blue' : 'neutral'}>{visibility === 'client' ? 'Project team & clients' : 'Project team only'}</Badge><pre>{body || '(No description)'}</pre><dl><div><dt>Type</dt><dd>{kind}{item ? ` · revision ${item.version + 1}` : ''}</dd></div><div><dt>Source</dt><dd>{source ? excerpts.find(row => row.id === source)?.title ?? 'Linked published excerpt' : 'Manually authored'}</dd></div><div><dt>Files</dt><dd>{retained.length + files.length ? [...retained.map(file => `${file.name} · ${file.size} bytes`), ...files.map(chosen => `${chosen.file.name} · ${chosen.file.size} bytes`)].join(', ') : 'None'}</dd></div></dl><p className="domain-note">Confirm to publish exactly this text, audience and selected files. Client approval applies to this deliverable revision only and never authorizes execution.</p></section> : <>
      <label>Title<input required maxLength={300} value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>Description / text<textarea rows={6} maxLength={65536} value={body} onChange={event => setBody(event.target.value)} placeholder="Plain text; source code and Markdown are displayed as text." /></label>
      <div className="work-form-pair"><label>Audience<select value={visibility} onChange={event => { setVisibility(event.target.value as 'team' | 'client'); setMilestone(''); setSource(''); setTask(''); setDocument(''); }}><option value="team">Project team only</option><option value="client">Project team & clients</option></select></label>
        {kind === 'task' && <label>Status<select value={status} onChange={event => setStatus(event.target.value as typeof status)}>{taskStatuses.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>}
        {kind === 'milestone' && <label>Due date<input type="date" value={due} onChange={event => setDue(event.target.value)} /></label>}
      </div>
      {kind === 'task' && <div className="work-form-pair"><label>Assignee<select value={assignee} onChange={event => setAssignee(event.target.value)}><option value="">Unassigned</option>{members.map(member => <option key={member.userId} value={member.userId}>{member.name} · {member.role}</option>)}</select></label><label>Milestone<select value={milestone} onChange={event => setMilestone(event.target.value)}><option value="">No milestone</option>{visibleMilestones.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label></div>}
      {kind !== 'milestone' && <label>Published session provenance (optional)<select value={source} onChange={event => setSource(event.target.value)}><option value="">Manually authored / no excerpt</option>{excerpts.map(row => <option key={row.id} value={row.id}>{row.title} · v{row.version}</option>)}</select><small>Only explicitly published excerpts in the current authorized snapshot. No local conversation is uploaded.</small></label>}
      {kind !== 'task' && kind !== 'milestone' && <div className="work-form-pair"><label>Related task<select value={task} onChange={event => setTask(event.target.value)}><option value="">No task</option>{tasks.items.filter(row => visibility === 'team' || row.visibility === 'client').map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label><label>Source document<select value={documentId} onChange={event => setDocument(event.target.value)}><option value="">No document</option>{documents.items.filter(row => row.id !== item?.id && (visibility === 'team' || row.visibility === 'client')).map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label></div>}
      <div className="compact-actions">{kind === 'task' && milestones.more && <Button size="sm" disabled={milestones.loading} onClick={milestones.loadMore}>Load older milestone choices</Button>}{kind !== 'task' && kind !== 'milestone' && tasks.more && <Button size="sm" disabled={tasks.loading} onClick={tasks.loadMore}>Load older task choices</Button>}{kind !== 'task' && kind !== 'milestone' && documents.more && <Button size="sm" disabled={documents.loading} onClick={documents.loadMore}>Load older document choices</Button>}</div>
      {kind === 'deliverable' && <section className="work-file-picker"><label><Icon name="file" size={14} />Choose files explicitly<input type="file" multiple accept=".txt,.md,.pdf,.png,.jpg,.jpeg,.ts,.tsx,.js,.jsx,.json,.css,.xml,.yml,.yaml,.sql,.rs,.py,.go,.java,.c,.cpp,.h" onChange={event => { selectFiles(event.target.files); event.target.value = ''; }} /></label><small>Up to 5 files, 1 MiB each. Project storage limit: 20 MiB. Nothing is uploaded until the final publication confirmation.</small>{retained.map(file => <div key={file.id}>{file.name} · {file.size} bytes<Button size="sm" disabled={busy} onClick={() => setRetained(previous => previous.filter(row => row.id !== file.id))}>Remove</Button></div>)}{files.map(chosen => <div key={chosen.requestId}>{chosen.file.name} · {chosen.file.size} bytes<Button size="sm" disabled={busy} onClick={() => { void removeChosen(chosen); }}>Remove</Button></div>)}</section>}
      <p className="domain-note">{item ? `Editing v${item.version}. A newer change will require reopening the current version.` : 'Create a project record with the audience shown above.'}{kind === 'milestone' && ' Progress is calculated from visible linked tasks.'}</p>
    </>}
    <Feedback error={fileError || mutation.error} />{mutation.conflict && <p className="domain-note">Another member changed this item. Close this form and reopen the latest version before editing.</p>}
    <div className="domain-form-actions"><Button disabled={busy} onClick={() => { void cancelEditor(); }}>Cancel</Button>{preview && <Button disabled={busy} onClick={() => setPreview(false)}>Back to edit</Button>}<Button type="submit" variant="primary" disabled={!allowed || busy || mutation.conflict || !title.trim()}>{uploading ? 'Processing chosen files…' : mutation.busy ? 'Saving…' : publishing ? preview ? 'Confirm publication' : 'Review publication' : 'Save'}</Button></div>
  </form></DomainDialog>;
}

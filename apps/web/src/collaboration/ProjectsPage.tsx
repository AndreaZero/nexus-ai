import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Project, Visibility, Workspace } from '@nexus-ai/contracts';
import { Badge, Button, Card, EmptyPanel, Icon } from '@nexus-ai/ui';
import { navigate } from '../routes.js';
import { useCollaboration } from './CollaborationProvider.js';
import { collaborationRequest, errorMessage } from './client.js';
import { AccountGate, DomainDialog, Feedback } from './components.js';

type Editor = { kind: 'workspace'; item: Workspace | null } | { kind: 'project'; item: Project | null };

export function WorkspaceDialog({ onClose }: { onClose(): void }) {
  const data = useCollaboration();
  const [creating, setCreating] = useState(false);
  return creating ? <EntityEditor editor={{ kind: 'workspace', item: null }} onClose={onClose} /> : <DomainDialog title="Your workspaces" onClose={onClose}>
    <p className="domain-note">Workspace membership and project access are managed separately.</p>
    <div className="workspace-options">{data.workspaces.map(item => <button type="button" key={item.id} aria-pressed={item.id === data.workspace?.id} disabled={data.loading} onClick={() => { void data.selectWorkspace(item.id).then(onClose); }}><span className="domain-symbol"><Icon name="projects" /></span><span><strong>{item.name}</strong><small>{item.role}</small></span>{item.id === data.workspace?.id && <Icon name="check-circle" size={18} />}</button>)}</div>
    {!data.workspaces.length && <p className="domain-note">Your workspaces will appear here after creation or an accepted invitation.</p>}
    <Feedback error={data.error} />
    <div className="domain-form-actions"><Button variant="primary" onClick={() => setCreating(true)}><Icon name="plus" size={14} />Create workspace</Button></div>
  </DomainDialog>;
}

export function ProjectsPage() {
  const data = useCollaboration();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [query, setQuery] = useState('');
  const filtered = data.projects.filter(project => `${project.name} ${project.description}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <div className="domain-layout"><AccountGate>
    <div className="domain-page-heading"><div><span className="domain-eyebrow">SHARED WORKSPACE</span><h2>{data.workspace?.name ?? 'Your projects'}</h2><p>Create a place for your team, then choose what to share.</p></div><div className="domain-actions"><Button onClick={() => setEditor({ kind: 'workspace', item: null })}><Icon name="plus" size={14} />New workspace</Button>{data.workspace?.role === 'owner' && <Button variant="primary" disabled={data.loading} onClick={() => setEditor({ kind: 'project', item: null })}><Icon name="plus" size={14} />New project</Button>}</div></div>
    {data.loading && <p className="domain-state" role="status">Loading your projects…</p>}
    <Feedback error={data.error} />
    {data.error && <Button onClick={() => { void data.refresh(); }}>Retry connection</Button>}
    {!data.loading && !data.error && !data.workspace && <Card title="Start with a workspace" icon={<Icon name="projects" />}><EmptyPanel title="Bring your work together" description="Create a workspace for your projects and collaborators. Invited projects will appear only after you accept their invitation." /><div className="domain-empty-action"><Button variant="primary" onClick={() => setEditor({ kind: 'workspace', item: null })}>Create workspace</Button></div></Card>}
    {!data.loading && data.workspace && <>
      <div className="domain-toolbar"><label className="domain-search"><Icon name="search" size={16} /><input aria-label="Search projects" placeholder="Search projects…" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} /></label><span>{data.projects.length} {data.projects.length === 1 ? 'project' : 'projects'}</span><Button size="sm" onClick={() => { void data.refresh(); }}>Refresh</Button>{data.workspace.role === 'owner' && <Button size="sm" onClick={() => setEditor({ kind: 'workspace', item: data.workspace })}>Workspace settings</Button>}</div>
      {filtered.length ? <div className="project-grid">{filtered.map(project => <Card key={project.id} className={`project-card${project.id === data.project?.id ? ' project-card--selected' : ''}`} title={project.name} icon={<Icon name="projects" />} action={<Badge tone={project.role === 'owner' ? 'blue' : 'neutral'}>{project.role}</Badge>}>
        <p className="project-description">{project.description || 'No project description yet.'}</p><dl className="project-properties"><div><dt>Default sharing</dt><dd>{project.defaultVisibility}</dd></div><div><dt>Repository</dt><dd>{!project.capabilities.viewRepository ? 'Restricted' : project.repository ? 'Connected' : 'Not connected'}</dd></div></dl>
        <div className="project-card-actions"><Button variant="primary" size="sm" onClick={() => { data.selectProject(project.id); navigate('overview'); }}>Open project<Icon name="arrow-right" size={13} /></Button>{project.capabilities.editProject && <Button size="sm" onClick={() => setEditor({ kind: 'project', item: project })}>Settings</Button>}</div>
      </Card>)}</div> : <Card title="Projects"><EmptyPanel title={query ? 'No matching projects' : 'No projects yet'} description={query ? 'Try a different project name.' : 'Create your first project or ask a project owner to invite you. Workspace membership alone does not open projects.'} /></Card>}
    </>}
    {editor && <EntityEditor editor={editor} onClose={() => setEditor(null)} />}
  </AccountGate></div>;
}

function EntityEditor({ editor, onClose }: { editor: Editor; onClose(): void }) {
  const data = useCollaboration();
  const [name, setName] = useState(editor.item?.name ?? '');
  const [description, setDescription] = useState(editor.kind === 'project' ? editor.item?.description ?? '' : '');
  const [visibility, setVisibility] = useState<Visibility>(editor.kind === 'project' ? editor.item?.defaultVisibility ?? 'team' : 'team');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    setPending(true); setError('');
    try {
      if (editor.kind === 'workspace') {
        const response = await collaborationRequest(editor.item ? { operation: 'updateWorkspace', workspaceId: editor.item.id, name } : { operation: 'createWorkspace', name });
        if (response.kind !== 'workspace') throw new Error('Unexpected workspace response');
        await data.refresh({ workspaceId: response.item.id, projectId: data.project?.id ?? null });
      } else {
        if (!data.workspace) throw new Error('Missing workspace');
        const response = await collaborationRequest(editor.item ? { operation: 'updateProject', projectId: editor.item.id, name, description, defaultVisibility: visibility } : { operation: 'createProject', workspaceId: data.workspace.id, name, description, defaultVisibility: visibility });
        if (response.kind !== 'project') throw new Error('Unexpected project response');
        await data.refresh({ workspaceId: response.item.workspaceId, projectId: response.item.id });
      }
      onClose();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setPending(false); }
  }
  return <DomainDialog title={`${editor.item ? 'Edit' : 'Create'} ${editor.kind}`} onClose={onClose} busy={pending}><form className="domain-form" onSubmit={event => { void submit(event); }}>
    <label>Name<input required minLength={1} maxLength={100} autoComplete="off" value={name} onChange={event => setName(event.target.value)} disabled={pending} /></label>
    {editor.kind === 'project' && <><label>Description<textarea rows={4} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} disabled={pending} /></label><label>Default sharing<select value={visibility} onChange={event => setVisibility(event.target.value as Visibility)} disabled={pending}><option value="private">Private</option><option value="team">Team</option><option value="client">Client</option></select><small>This is the default audience for future shared content. It does not grant project access.</small></label></>}
    <Feedback error={error} /><div className="domain-form-actions"><Button disabled={pending} onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" disabled={pending || !name.trim()}>{pending ? 'Saving…' : editor.item ? 'Save changes' : `Create ${editor.kind}`}</Button></div>
  </form></DomainDialog>;
}

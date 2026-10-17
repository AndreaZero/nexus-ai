import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { LocalBinding, Project } from '@nexus-ai/contracts';
import { Badge, Button, Card, EmptyPanel, Icon } from '@nexus-ai/ui';
import { useCollaboration } from './CollaborationProvider.js';
import { collaborationRequest, errorMessage, localBindingRequest } from './client.js';
import { Feedback, WorkspaceGate } from './components.js';

export function RepositoryPage() {
  const data = useCollaboration();
  return <div className="domain-layout"><WorkspaceGate>
    <div className="domain-page-heading"><div><span className="domain-eyebrow">PROJECT CONNECTION</span><h2>Repository</h2><p>Shared repository details, with a separate local folder on each device.</p></div></div>
    {!data.project ? <Card title="Select a project"><EmptyPanel title="No project selected" description="Open Projects to create or select a project." /></Card> : !data.project.capabilities.viewRepository ? <Card title="Repository access"><EmptyPanel title="Repository access is restricted" description="Your project role does not include technical repository details. Contact a project owner if your role needs to change." icon={<Icon name="shield" />} /></Card> : <RepositoryDetails key={`${data.project.id}:${data.project.repository?.id ?? 'none'}:${data.project.updatedAt}`} project={data.project} />}
  </WorkspaceGate></div>;
}

function RepositoryDetails({ project }: { project: Project }) {
  const data = useCollaboration();
  const repository = project.repository;
  const [remoteUrl, setRemoteUrl] = useState(repository?.remoteUrl ?? '');
  const [defaultBranch, setDefaultBranch] = useState(repository?.defaultBranch ?? 'main');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [binding, setBinding] = useState<LocalBinding | null>(null);
  const [bindingLoading, setBindingLoading] = useState(Boolean(window.nexusDesktop && repository));
  const [bindingError, setBindingError] = useState('');
  const live = useRef(true);
  const generation = useRef(0);

  useEffect(() => {
    live.current = true;
    const ticket = ++generation.current;
    if (window.nexusDesktop && repository) {
      void localBindingRequest({ operation: 'get', projectId: project.id, repositoryId: repository.id })
        .then(value => { if (live.current && ticket === generation.current) { setBinding(value); setBindingError(''); } })
        .catch(cause => { if (live.current && ticket === generation.current) setBindingError(errorMessage(cause)); })
        .finally(() => { if (live.current && ticket === generation.current) setBindingLoading(false); });
    }
    return () => { live.current = false; ++generation.current; };
  }, [project.id, repository]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    setPending(true); setError(''); setNotice('');
    try {
      await collaborationRequest({ operation: 'setRepository', projectId: project.id, remoteUrl, defaultBranch });
      setNotice('Repository details saved.'); await data.refresh();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setPending(false); }
  }
  async function updateBinding(operation: 'get' | 'select' | 'remove') {
    if (!repository || bindingLoading) return;
    const ticket = ++generation.current;
    setBindingLoading(true); setBindingError('');
    try { const value = await localBindingRequest({ operation, projectId: project.id, repositoryId: repository.id }); if (live.current && ticket === generation.current) setBinding(value); }
    catch (cause) { if (live.current && ticket === generation.current) { setBinding(null); setBindingError(errorMessage(cause)); } }
    finally { if (live.current && ticket === generation.current) setBindingLoading(false); }
  }

  return <div className="repository-grid"><Card title="Shared repository" icon={<Icon name="repos" />} action={<Badge tone={repository ? 'blue' : 'neutral'}>{repository ? 'Connected' : 'Not connected'}</Badge>}>
    {project.capabilities.editProject ? <form className="domain-form" onSubmit={event => { void save(event); }}><label>HTTPS repository URL<input type="url" required maxLength={500} placeholder="https://github.com/your-org/your-project" autoComplete="off" value={remoteUrl} onChange={event => setRemoteUrl(event.target.value)} disabled={pending} /><small>Use HTTPS without credentials, query parameters or fragments.</small></label><label>Default branch<input required maxLength={100} autoComplete="off" value={defaultBranch} onChange={event => setDefaultBranch(event.target.value)} disabled={pending} /></label><Feedback error={error} notice={notice} /><div className="domain-form-actions"><Button variant="primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save repository'}</Button></div></form> : repository ? <dl className="repository-details"><div><dt>Remote URL</dt><dd>{repository.remoteUrl}</dd></div><div><dt>Default branch</dt><dd>{repository.defaultBranch}</dd></div></dl> : <EmptyPanel title="No repository connected" description="A project owner can add the shared repository URL and default branch." />}
    <p className="domain-note">Repository metadata is shared with technical project members. Adding a URL does not clone or upload files.</p>
  </Card><Card title="Local folder" icon={<Icon name="laptop" />} action={<Badge tone="neutral">This device only</Badge>}>
    {!window.nexusDesktop ? <EmptyPanel title="Open the desktop app" description="Choose local folders in Nexus AI for Windows, macOS or Linux. Browser access never exposes your filesystem." /> : !repository ? <EmptyPanel title="Connect a repository first" description="Save the shared repository details before choosing its local folder." /> : <>
      {bindingLoading && <p className="domain-state" role="status">Checking local folder…</p>}
      {!bindingLoading && (binding ? <div className="local-folder"><span className="domain-symbol"><Icon name="repos" size={24} /></span><strong>{binding.label}</strong><code>{binding.rootPath}</code><small>Linked {new Date(binding.updatedAt).toLocaleString()}</small></div> : <EmptyPanel title="No local folder linked" description="Choose an existing project folder. The location stays on this device; files are not read or uploaded." />)}
      <Feedback error={bindingError} /><div className="domain-form-actions"><Button size="sm" disabled={bindingLoading} onClick={() => { void updateBinding('get'); }}>Refresh</Button>{binding && <Button size="sm" disabled={bindingLoading} onClick={() => { void updateBinding('remove'); }}>Unlink folder</Button>}<Button variant="primary" size="sm" disabled={bindingLoading} onClick={() => { void updateBinding('select'); }}>{binding ? 'Change folder' : 'Choose folder'}</Button></div>
    </>}
    <p className="domain-note">Each account and device has its own folder binding. This step does not run Git or connect Codex.</p>
  </Card></div>;
}

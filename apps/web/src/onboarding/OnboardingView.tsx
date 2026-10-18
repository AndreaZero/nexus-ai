import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, EmptyPanel, Icon } from '@nexus-ai/ui';
import type { IconName } from '@nexus-ai/ui';
import { AccountCard } from '../auth/AccountCard.js';
import { useCollaboration } from '../collaboration/CollaborationProvider.js';
import { EntityEditor, WorkspaceDialog } from '../collaboration/ProjectsPage.js';
import { RepositoryDetails } from '../collaboration/RepositoryPage.js';
import { Feedback } from '../collaboration/components.js';
import { CodexSettings } from '../codex/CodexSettings.js';
import { useCodex } from '../codex/CodexProvider.js';
import { useSessionContext } from '../session/SessionProvider.js';
import { navigate } from '../routes.js';
import { useOnboarding } from './OnboardingProvider.js';
import './onboarding.css';

const icons: Record<string, IconName> = { account: 'shield', workspace: 'team', project: 'projects', folder: 'repos', codex: 'sparkles', session: 'sessions' };
const firstRequest = 'Read the project README and summarize its purpose, structure and main entry points. Do not modify files. Use read-only inspection.';

export function OnboardingView() {
  const guide = useOnboarding();
  const data = useCollaboration();
  const codex = useCodex();
  const session = useSessionContext();
  const [dialog, setDialog] = useState<'workspace' | 'project' | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(guide.stepId);
  const developer = guide.mode === 'developer';
  const steps = guide.steps.filter(step => developer || ['account', 'workspace', 'project'].includes(step.id));
  const active = steps.find(step => step.id === guide.stepId) ?? steps[0];
  const index = steps.findIndex(step => step.id === active?.id);
  const finished = steps.filter(step => step.complete).length;
  const pending = data.loading || Boolean(data.error);
  useEffect(() => {
    if (previousStep.current !== guide.stepId) {
      previousStep.current = guide.stepId;
      heading.current?.focus();
    }
  }, [guide.stepId]);
  if (!active) return null;

  function leave() { guide.dismiss(); navigate(developer ? 'overview' : 'pulse'); }
  function openSession() {
    // A restored draft must be loaded before deciding whether it is empty.
    // Existing conversations, permissions and drafts remain untouched.
    if (!session.context || session.busy || !session.enabled || session.error || !active?.available) return;
    if (!codex.state.session && session.draft.length === 0) session.setDraft(firstRequest);
    session.flushDraft();
    navigate('session');
  }

  return <div className="onboarding-page" data-testid="onboarding-view">
    <header className="onboarding-intro">
      <div><span className="domain-eyebrow">YOUR FIRST PROJECT · GUIDED SETUP</span><h2>{developer ? 'From your workspace to your first AI session' : 'Your project, ready to explore'}</h2><p>{developer ? 'Connect the shared project to this device. Start your first conversation when you are ready.' : guide.mode === 'observer' ? 'Open the project shared with you, follow published progress and give feedback.' : 'Set up your shared project here. Local files and Codex are available in the desktop app.'}</p></div>
      <Button data-testid="onboarding-dismiss" size="sm" onClick={leave}>Set up later<Icon name="x" size={13} /></Button>
    </header>
    <nav className="onboarding-stepper" aria-label="Getting started steps"><ol>{steps.map((step, stepIndex) => <li key={step.id} className={`${step.id === active.id ? 'is-current' : ''}${step.complete ? ' is-complete' : ''}`}><button type="button" data-testid={`onboarding-step-${step.id}`} aria-current={step.id === active.id ? 'step' : undefined} disabled={!step.available} onClick={() => guide.selectStep(step.id)}><span className="onboarding-step-number" aria-hidden="true">{step.complete ? <Icon name="check" size={13} /> : stepIndex + 1}</span><span>{step.title}<small>{step.complete ? 'Complete' : step.available ? step.id === active.id ? 'Current step' : 'Available' : 'Previous steps required'}</small></span></button>{stepIndex < steps.length - 1 && <Icon name="arrow-right" size={14} />}</li>)}</ol></nav>
    {!guide.storageAvailable && <p className="onboarding-storage" role="status">Local preferences are unavailable. You can continue, but this guide may reopen after a restart.</p>}
    <div className="onboarding-grid">
      <section className="onboarding-main" aria-labelledby="onboarding-step-title">
        <div className="onboarding-step-heading"><span className="onboarding-stage-icon"><Icon name={icons[active.id] ?? 'projects'} size={25} /></span><div><span className="domain-eyebrow">STEP {index + 1} OF {steps.length}</span><h2 id="onboarding-step-title" ref={heading} tabIndex={-1}>{active.title}</h2><p>{active.description}</p></div>{active.complete && <Badge tone="success">Complete</Badge>}</div>
        {active.id !== 'account' && <><Feedback error={data.error} />{data.loading && <p className="domain-state" role="status">Loading your workspace…</p>}{data.error && <Button size="sm" onClick={() => { void data.refresh(); }}>Retry connection</Button>}</>}
        {!active.available ? <Card title="Complete the previous steps"><EmptyPanel title="This step is not ready yet" description="Check your account and project selection. Setup progress follows their current state." /></Card> : <>
          {active.id === 'account' && <AccountCard />}
          {active.id === 'workspace' && <Card title="Your shared workspace" icon={<Icon name="team" />} action={data.workspace ? <Badge tone="blue">{data.workspace.role}</Badge> : undefined}>
            <p className="onboarding-copy">A workspace brings your projects and collaborators together. Project access is granted separately.</p>
            {data.workspace ? <div className="onboarding-selection"><span className="domain-symbol"><Icon name="team" /></span><div><small>Selected workspace</small><strong>{data.workspace.name}</strong></div><Icon name="check-circle" size={20} /></div> : <EmptyPanel title="Choose where your work belongs" description="Create a workspace or open one you already belong to. If you were invited, follow the invitation link from your email first." />}
            <div className="onboarding-actions"><Button variant="primary" disabled={pending} onClick={() => setDialog('workspace')}>{data.workspaces.length ? 'Choose or create workspace' : 'Create workspace'}<Icon name="arrow-right" size={14} /></Button></div>
          </Card>}
          {active.id === 'project' && <Card title="Choose your project" icon={<Icon name="projects" />} action={data.workspace ? <Badge tone="neutral">{data.workspace.name}</Badge> : undefined}>
            <p className="onboarding-copy">Tasks, documents, published results and collaborators belong to a project. Choose the one you want to work with.</p>
            {data.projects.length ? <div className="onboarding-projects">{data.projects.map(project => <button key={project.id} type="button" aria-pressed={project.id === data.project?.id} disabled={pending} onClick={() => data.selectProject(project.id)}><span className="domain-symbol"><Icon name="projects" size={19} /></span><span><strong>{project.name}</strong><small>{project.description || 'No description yet'}</small></span><Badge tone="neutral">{project.role}</Badge>{project.id === data.project?.id && <Icon name="check-circle" size={18} />}</button>)}</div> : <EmptyPanel title="No projects available yet" description={data.workspace?.role === 'owner' ? 'Create your first project to get started.' : 'Ask a project owner to invite you. Workspace membership alone does not open projects.'} />}
            {data.workspace?.role === 'owner' && guide.mode !== 'observer' && <div className="onboarding-actions"><Button variant={data.projects.length ? 'secondary' : 'primary'} disabled={pending} onClick={() => setDialog('project')}><Icon name="plus" size={14} />Create project</Button></div>}
            {!developer && data.project && <div className="onboarding-browser-note"><Icon name={guide.mode === 'observer' ? 'eye' : 'laptop'} size={19} /><p>{guide.mode === 'observer' ? 'Your role follows shared project progress. You do not need a local folder or a Codex account.' : 'Your shared project is ready here. Open Nexus AI on Windows, macOS or Linux to link a folder and use Codex.'}</p></div>}
          </Card>}
          {active.id === 'folder' && data.project && <><RepositoryDetails key={`${data.project.id}:${data.project.repository?.id ?? 'none'}:${data.project.updatedAt}`} project={data.project} onBindingChange={codex.refreshBinding} /><Feedback error={codex.bindingError} /></>}
          {active.id === 'codex' && <CodexSettings />}
          {active.id === 'session' && <Card title={active.complete ? 'Your first conversation is complete' : codex.state.policy === 'readOnly' ? 'Start with a read only conversation' : 'Continue with your current permissions'} active icon={<Icon name="sessions" />} action={<Badge tone="neutral">{codex.state.policy === 'readOnly' ? 'Read only' : 'Workspace write'}</Badge>}>
            {active.complete ? <><p className="onboarding-copy">Codex completed a response in this project and folder. Continue your conversation, create tasks or choose an excerpt to share with your team.</p><div className="onboarding-actions"><Button variant="primary" data-testid="onboarding-open-session" onClick={() => navigate('session')}>Return to AI Session<Icon name="arrow-right" size={14} /></Button></div></> : <>
              <p className="onboarding-copy">{codex.state.session ? 'Your existing conversation is preserved. Return to it and send a request when you are ready.' : session.draft.length > 0 ? 'You already have a draft. Open AI Session to review it and send it when you are ready.' : 'Open AI Session with this suggested request. Review it and press Send yourself.'}</p>
              {!codex.state.session && session.draft.length === 0 && <blockquote className="onboarding-prompt" data-testid="onboarding-suggest-prompt"><Icon name="sparkles" size={18} /><p>{firstRequest}</p></blockquote>}
              <dl className="onboarding-ready"><div><dt>Project</dt><dd>{data.project?.name ?? 'Not selected'}</dd></div><div><dt>Local folder</dt><dd>{codex.binding?.label ?? 'Not linked'}</dd></div><div><dt>Model</dt><dd>{codex.model?.name ?? codex.model?.id ?? 'Not selected'}</dd></div></dl>
              <Feedback error={session.error} /><div className="onboarding-actions">{session.error && <Button size="sm" disabled={session.busy} onClick={() => { void session.request('get'); }}>Retry local context</Button>}<Button variant="primary" data-testid="onboarding-open-session" disabled={!session.context || session.busy || !session.enabled || Boolean(session.error) || codex.busy} onClick={openSession}>{session.busy ? 'Loading local context…' : codex.state.session ? 'Continue AI Session' : 'Open AI Session'}<Icon name="arrow-right" size={14} /></Button></div>
              <p className="onboarding-footnote">Nothing is sent automatically. Your current permissions stay unchanged. The guide completes after Codex finishes its first response.</p>
            </>}
          </Card>}
        </>}
        <footer className="onboarding-navigation"><Button size="sm" data-testid="onboarding-back" disabled={index <= 0} onClick={guide.back}>Back</Button><span role="status">{active.complete ? 'Step complete' : 'Complete this step to continue'}</span>{index < steps.length - 1 ? <Button variant="primary" data-testid="onboarding-next" disabled={!active.complete || pending} onClick={guide.next}>Continue<Icon name="arrow-right" size={14} /></Button> : <Button variant={guide.completed ? 'primary' : 'secondary'} data-testid="onboarding-next" disabled={!guide.completed || pending} onClick={leave}>{developer ? 'Finish setup' : 'Open project'}<Icon name="arrow-right" size={14} /></Button>}</footer>
      </section>
      <aside className="onboarding-rail" aria-label="Setup context">
        <Card title="Your setup" icon={<Icon name="tasks" />} action={<Badge tone={guide.completed ? 'success' : 'cyan'}>{finished} / {steps.length}</Badge>}><div className="onboarding-context"><div><small>Workspace</small><strong>{data.workspace?.name ?? 'Not selected'}</strong></div><div><small>Project</small><strong>{data.project?.name ?? 'Not selected'}</strong></div><div><small>Access</small><strong>{data.project?.role ?? 'Select a project'}</strong></div></div><p className="onboarding-footnote">Checks reflect your current account and project. You can return to any available step.</p></Card>
        <Card title="Local & shared" icon={<Icon name="shield" />}><div className="onboarding-boundaries"><div><span><Icon name={developer ? "laptop" : "eye"} size={16} />{developer ? 'On this device' : 'Your access'}</span><p>{developer ? 'Local folder, Codex credentials, conversation and draft. Each developer links their own folder.' : 'Follow the published content available to your project role. Local folders and a Codex account are not required here.'}</p></div><div><span><Icon name="team" size={16} />In your workspace</span><p>Project details, tasks and content you explicitly publish. Sharing never grants remote control of your device.</p></div></div></Card>
        <Card title="What comes next" icon={<Icon name="arrow-right" />}><p className="onboarding-copy">{developer ? 'After your first conversation, try a small file change, review the diff and publish a selected result. GitHub, teammates and deployment records can be connected later.' : 'Explore project progress in Client & Team Pulse. Open a published deliverable to review it or leave feedback when your role allows it.'}</p><button type="button" className="text-link" onClick={leave}>Return to project</button></Card>
      </aside>
    </div>
    {dialog === 'workspace' && <WorkspaceDialog onClose={() => setDialog(null)} />}
    {dialog === 'project' && <EntityEditor editor={{ kind: 'project', item: null }} onClose={() => setDialog(null)} />}
  </div>;
}

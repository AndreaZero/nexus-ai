import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Avatar, Badge, Button, Card, EmptyPanel, Icon, Tabs } from '@nexus-ai/ui';
import { viewCopy as copy } from './copy.js';
import type { WorkspaceViewProps } from './types.js';
import { useCodex } from '../codex/CodexProvider.js';
import { ModelControls } from '../codex/ModelControls.js';
import { useCollaboration } from '../collaboration/CollaborationProvider.js';
import { useAccount } from '../auth/AuthProvider.js';

const contextTabs = [{ id: 'context', label: 'Context & Files' }, { id: 'tasks', label: 'Tasks' }, { id: 'info', label: 'Session Info' }];
const codeTabs = [{ id: 'code', label: 'Code Preview' }, { id: 'terminal', label: 'Terminal' }, { id: 'tests', label: 'Tests' }, { id: 'preview', label: 'Preview' }];
const outputTabs = [{ id: 'output', label: 'Output' }, { id: 'problems', label: 'Problems' }, { id: 'console', label: 'Debug Console' }];

export function SessionView({ onNavigate }: WorkspaceViewProps) {
  const codex = useCodex();
  const collaboration = useCollaboration();
  const account = useAccount();
  const project = collaboration.project;
  const repository = project?.repository;
  const session = codex.state.session;
  const [contextTab, setContextTab] = useState('context');
  const [codeTab, setCodeTab] = useState('code');
  const [outputTab, setOutputTab] = useState('output');
  const [mobilePanel, setMobilePanel] = useState('chat');
  const [draft, setDraft] = useState('');
  const [newMessages, setNewMessages] = useState(false);
  const transcript = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const opened = useRef('');
  const technical = project?.role === 'owner' || project?.role === 'developer';
  const ready = Boolean(codex.enabled && codex.state.runtime === 'ready' && codex.state.account && project && repository && codex.binding && technical && codex.model);
  const running = session?.status === 'running';
  const projectId = project?.id;
  const repositoryId = repository?.id;
  const modelName = codex.model?.model;
  const openKey = ready ? `${projectId}:${repositoryId}:${codex.binding?.updatedAt}:${modelName}` : '';

  useEffect(() => { setDraft(''); opened.current = ''; follow.current = true; setNewMessages(false); }, [projectId, repositoryId, account.state.user?.id]);
  useEffect(() => {
    if (!openKey || opened.current === openKey || !projectId || !repositoryId || !modelName) return;
    opened.current = openKey;
    void codex.request({ operation: 'openSession', projectId, repositoryId, model: modelName });
  }, [openKey, projectId, repositoryId, modelName, codex.request]);
  useEffect(() => {
    const element = transcript.current;
    if (!element || !session?.messages.length) return;
    if (follow.current) element.scrollTop = element.scrollHeight;
    else setNewMessages(true);
  }, [session?.messages]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !projectId || !repositoryId || !modelName || codex.busy || running || !draft.trim()) return;
    const text = draft.trim();
    follow.current = true; setDraft('');
    const succeeded = await codex.request({ operation: 'send', projectId, repositoryId, model: modelName, effort: codex.effort, text });
    if (!succeeded) setDraft(current => current || text);
  }
  function openSession(operation: 'openSession' | 'newSession') {
    if (ready && projectId && repositoryId && modelName && !codex.busy && !running) { follow.current = true; void codex.request({ operation, projectId, repositoryId, model: modelName }); }
  }
  function interrupt() { if (projectId && repositoryId && !codex.busy) void codex.request({ operation: 'interrupt', projectId, repositoryId }); }
  const gate = !codex.desktop ? 'Open the desktop app to use local Codex.' : !codex.enabled ? 'Sign in to your Nexus account first.' : !project ? 'Select a project to start a conversation.' : !technical ? 'Local Codex sessions require an owner or developer role.' : !repository || !codex.binding ? 'Link a repository and local folder in Repos.' : codex.state.runtime !== 'ready' || !codex.state.account ? 'Connect Codex and sign in with your personal account in Settings.' : !codex.model ? 'Refresh the model catalog in Settings.' : 'Ask Codex about the files in your linked folder.';
  const environmentRows = [
    { label: 'Codex runtime', status: codex.state.runtime, icon: 'sparkles' },
    { label: 'Local folder', status: codex.bindingLoading ? 'Checking…' : codex.binding?.label ?? 'Not linked', icon: 'file' },
    { label: 'Repository', status: repository && technical ? 'Metadata linked' : 'Not connected', icon: 'repos' },
    { label: 'Tests', status: 'Not observed', icon: 'test' },
    { label: 'Preview', status: 'Not configured', icon: 'globe' },
    { label: 'Shared workspace', status: collaboration.workspace?.name ?? 'Not connected', icon: 'team' },
  ] as const;
  const messages = session?.messages ?? [];
  const activities = session?.activities ?? [];
  const commandActivities = activities.filter(activity => activity.kind === 'command');
  const problemActivities = activities.filter(activity => activity.status === 'blocked' || activity.status === 'failed');

  return <div className={`session-layout session-layout--${mobilePanel}`}>
    <div className="session-mobile-tabs"><Tabs items={[{ id: 'chat', label: 'Conversation' }, { id: 'context', label: 'Context' }, { id: 'code', label: 'Code & Output' }]} selected={mobilePanel} onChange={setMobilePanel} label="Session panel" /></div>
    <section className="session-conversation" aria-label="Codex conversation">
      <div className="session-plan-bar"><Icon name="shield" size={18} /><div><strong>Local Codex · Read only</strong><span>Inspect files and ask questions. Writes and approvals are unavailable.</span></div><Badge tone={running ? 'blue' : 'neutral'}>{session?.status ?? 'Not started'}</Badge></div>
      {messages.length ? <><div className="codex-transcript" ref={transcript} onScroll={() => { const element = transcript.current; if (element) { follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 70; if (follow.current) setNewMessages(false); } }} aria-label="Conversation messages" tabIndex={0}>
        {messages.map(message => <article className={`codex-message codex-message--${message.role}`} key={message.id}><span className="codex-message-avatar">{message.role === 'user' ? <Avatar size={32} {...(account.state.user ? { name: account.state.user.name } : {})} /> : <Icon name="sparkles" size={24} />}</span><div><header><strong>{message.role === 'user' ? account.state.user?.name ?? 'You' : 'Codex'}</strong><span>{message.status === 'streaming' ? 'Responding…' : message.status === 'complete' ? '' : message.status}</span></header><div className="codex-message-text">{message.text || (message.status === 'streaming' ? 'Waiting for response…' : 'No text output.')}</div></div></article>)}
      </div>{newMessages && <button type="button" className="codex-new-messages" onClick={() => { follow.current = true; setNewMessages(false); if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; }}>Go to latest response ↓</button>}</> : <div className="conversation-empty"><span className="conversation-emblem"><Icon name="sparkles" size={39} /></span><EmptyPanel title={ready ? 'Start a conversation' : 'Connect your local workspace'} description={gate} /><Button size="sm" onClick={() => onNavigate(project && technical && (!repository || !codex.binding) ? 'repos' : 'settings')}><Icon name="settings" size={15} />{project && technical && (!repository || !codex.binding) ? 'Repository settings' : 'Connection settings'}<Icon name="arrow-right" size={14} /></Button></div>}
      <p className="sr-only" role="status">{session ? `Codex session ${session.status}.` : 'No Codex session selected.'}</p>
      {(codex.error || codex.bindingError || session?.error) && <p className="codex-session-error" role="alert">{codex.error || codex.bindingError || session?.error}</p>}
      {codex.state.notice && <p className="codex-notice" role="status">{codex.state.notice}</p>}
      <form className="session-composer" onSubmit={event => { void send(event); }}>
        <div className="codex-composer-selection"><ModelControls disabled={!ready || codex.busy || running} /><Button type="button" size="sm" disabled={!ready || codex.busy || running} onClick={() => openSession('newSession')}><Icon name="plus" size={12} />New chat</Button>{!session && ready && <Button type="button" size="sm" disabled={codex.busy} onClick={() => openSession('openSession')}>Open chat</Button>}</div>
        <label className="sr-only" htmlFor="codex-message">Message Codex</label><div className="composer-input"><button type="button" disabled title="Explicit file attachments are not available yet." aria-label="Attach files"><Icon name="attachment" size={17} /></button><textarea id="codex-message" disabled={!ready || codex.busy || running} placeholder={ready ? 'Ask Codex about your linked project…' : gate} value={draft} maxLength={32000} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={2} /><button type="submit" disabled={!ready || codex.busy || running || !draft.trim()} title="Send message (Enter)" aria-label="Send message"><Icon name="send" size={17} /></button></div>
        <div className="composer-tools"><span className="codex-policy-label"><Icon name="shield" size={12} />Read only · this device</span>{running && <Button type="button" size="sm" disabled={codex.busy} onClick={interrupt}><Icon name="pause" size={12} />Interrupt response</Button>}<span className="codex-input-hint">Shift + Enter for a new line</span></div>
      </form>
    </section>
    <div className="session-right"><section className="session-context" aria-label="Session context"><Tabs items={contextTabs} selected={contextTab} onChange={setContextTab} label="Session context" />{contextTab === 'context' ? <><div className="context-top-grid"><div className="context-files-stack"><Card title="Repository Context" icon={<Icon name="repos" size={16} />} className="repository-card" bodyClassName="repository-card-body"><div className="repository-empty"><span className="repo-symbol"><Icon name="repos" size={20} /></span><div><strong title={technical ? repository?.remoteUrl : undefined}>{technical && repository ? repository.remoteUrl.replace(/^https:\/\//, '') : copy.noRepo}</strong><span title={codex.binding?.rootPath}>{codex.binding?.label ?? 'No local folder linked'}</span></div><Button size="sm" onClick={() => onNavigate('repos')}>Manage</Button></div><div className="branch-empty"><Icon name="git-branch" size={17} /><div><span>Working Branch</span><strong>Not observed</strong></div><Badge tone="neutral">Local</Badge></div></Card><Card title="Attached Files" icon={<Icon name="attachment" size={16} />} className="attached-files-card" action={<Badge tone="neutral">0</Badge>}><EmptyPanel compact icon={<Icon name="file" size={23} />} title="No explicit attachments" description={codex.binding ? 'Codex can inspect the linked local folder in read only mode. Explicit file selection is not available yet.' : 'Link a local folder to give Codex project context.'} /></Card></div><Card title="Environment Status" className="environment-card" bodyClassName="environment-card-body"><div className="environment-overall"><span className="unknown-dot" />Local observations</div>{environmentRows.map(row => <div key={row.label} className="environment-row"><span><Icon name={row.icon} size={15} /></span><div><strong>{row.label}</strong><small>{row.status}</small></div></div>)}</Card></div><Card title="Related Tasks" icon={<Icon name="tasks" size={14} />} className="related-tasks-card" action={<button type="button" className="text-link" data-route="tasks" onClick={() => onNavigate('tasks')}>View in Project<Icon name="arrow-up-right" size={12} /></button>}><EmptyPanel compact title="No tasks linked to this session" /></Card></> : <div className="context-tab-empty">{contextTab === 'tasks' ? <EmptyPanel icon={<Icon name="tasks" size={27} />} title="No session tasks" description="Tasks linked to a session will appear here." /> : session ? <dl className="codex-session-details"><div><dt>Session</dt><dd>{session.threadId}</dd></div><div><dt>Model</dt><dd>{session.model}</dd></div><div><dt>Local folder</dt><dd>{session.folderLabel}</dd></div><div><dt>Status</dt><dd>{session.status}</dd></div><div><dt>Sharing</dt><dd>Local only — messages are not uploaded.</dd></div><div><dt>Policy</dt><dd>Read only; escalation is blocked.</dd></div></dl> : <EmptyPanel icon={<Icon name="sessions" size={27} />} title="No session selected" description="Session details, runtime and sharing information appear here." />}</div>}</section>
      <section className="code-workspace" aria-label="Code workspace"><div className="code-workspace-heading"><Tabs items={codeTabs} selected={codeTab} onChange={setCodeTab} label="Code workspace" /><button type="button" className="split-view-button" disabled title="A repository diff is required to change the view."><Icon name="code" size={13} />Split View</button></div><div className="code-primary-panel">{codeTab === 'code' ? <><div className="code-file-tabs"><Icon name="file" size={13} />Runtime activity · {activities.length} observed</div>{activities.length ? <div className="codex-activities" aria-label="Observed Codex activity">{activities.map(activity => <details key={activity.id} open={activity.status === 'running' || activity.status === 'blocked'}><summary><Icon name={activity.kind === 'command' ? 'terminal' : activity.kind === 'fileChange' ? 'file' : activity.kind === 'plan' ? 'tasks' : 'sparkles'} size={14} /><strong>{activity.title}</strong><Badge tone={activity.status === 'blocked' || activity.status === 'failed' ? 'warning' : 'neutral'}>{activity.status}</Badge></summary>{activity.detail && <pre>{activity.detail}</pre>}</details>)}</div> : <div className="code-empty"><EmptyPanel icon={<Icon name="code" size={24} />} title="No file changes" description="Read only mode does not apply changes. Observable tool activity will appear here." /></div>}</> : codeTab === 'terminal' && commandActivities.length ? <div className="codex-activities">{commandActivities.map(activity => <section key={activity.id}><strong>{activity.title} · {activity.status}</strong><pre>{activity.detail}</pre></section>)}</div> : <EmptyPanel icon={<Icon name={codeTab === 'terminal' ? 'terminal' : codeTab === 'tests' ? 'test' : 'eye'} size={25} />} title={codeTab === 'terminal' ? 'No command output observed' : codeTab === 'tests' ? copy.noTests : copy.noPreview} description={codeTab === 'terminal' ? 'Output appears only for tools the local runtime actually reports.' : codeTab === 'tests' ? 'No recognized test report is available.' : 'Connect a deployment or local preview to view it here.'} />}</div><div className="code-output"><Tabs items={outputTabs} selected={outputTab} onChange={setOutputTab} label="Execution output" /><div className="output-body"><div className="output-empty">{outputTab === 'problems' && problemActivities.length ? <span>{problemActivities.map(activity => `${activity.title}: ${activity.status}`).join('\n')}</span> : <><Icon name={outputTab === 'problems' ? 'shield' : 'terminal'} size={15} /><span>{outputTab === 'problems' ? 'No diagnostics available' : outputTab === 'console' ? 'No debug session' : running ? 'Codex is responding…' : session ? `Session ${session.status}` : copy.noOutput}</span></>}</div><div className="test-results-empty"><strong>Test Results</strong><span>Not observed</span><dl><div><dt>Coverage</dt><dd>—</dd></div><div><dt>Duration</dt><dd>—</dd></div></dl></div></div></div></section>
    </div>
  </div>;
}

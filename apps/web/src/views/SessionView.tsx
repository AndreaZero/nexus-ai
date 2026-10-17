import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Avatar, Badge, Button, EmptyPanel, Icon, Tabs } from '@nexus-ai/ui';
import { viewCopy as copy } from './copy.js';
import type { WorkspaceViewProps } from './types.js';
import { useCodex } from '../codex/CodexProvider.js';
import { ModelControls } from '../codex/ModelControls.js';
import { useCollaboration } from '../collaboration/CollaborationProvider.js';
import { useAccount } from '../auth/AuthProvider.js';
import { useSessionContext } from '../session/SessionProvider.js';
import { Plan, LocalContextPanels, SessionDetails } from '../session/SessionPanels.js';
import { useProjectHistory, SharedHistory, TaskRows } from '../session/SharedHistory.js';
import { PublishSession } from '../session/PublishSession.js';
import { SHARE_SESSION_EVENT } from '../session/publication.js';

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
  const local = useSessionContext();
  const draft = local.draft;
  const [share, setShare] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const history = useProjectHistory(project?.id, collaboration.ready && Boolean(project), historyVersion);
  useEffect(() => { const open = () => setShare(true); window.addEventListener(SHARE_SESSION_EVENT, open); return () => window.removeEventListener(SHARE_SESSION_EVENT, open); }, []);
  const [newMessages, setNewMessages] = useState(false);
  useEffect(() => { if (local.preview) setCodeTab('code'); }, [local.preview]);
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

  useEffect(() => { opened.current = ''; follow.current = true; setNewMessages(false); }, [projectId, repositoryId, account.state.user?.id]);
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
    follow.current = true;
    const succeeded = await codex.request({ operation: 'send', projectId, repositoryId, model: modelName, effort: codex.effort, text, attachmentIds: local.context?.files.map(file => file.id) ?? [] });
    if (succeeded) local.clearSent(draft);
  }
  function openSession(operation: 'openSession' | 'newSession') {
    if (ready && projectId && repositoryId && modelName && !codex.busy && !running) { follow.current = true; void codex.request({ operation, projectId, repositoryId, model: modelName }); }
  }
  function interrupt() { if (projectId && repositoryId && !codex.busy) void codex.request({ operation: 'interrupt', projectId, repositoryId }); }
  const gate = !codex.desktop ? 'Open the desktop app to use local Codex.' : !codex.enabled ? 'Sign in to your Nexus account first.' : !project ? 'Select a project to start a conversation.' : !technical ? 'Local Codex sessions require an owner or developer role.' : !repository || !codex.binding ? 'Link a repository and local folder in Repos.' : codex.state.runtime !== 'ready' || !codex.state.account ? 'Connect Codex and sign in with your personal account in Settings.' : !codex.model ? 'Refresh the model catalog in Settings.' : 'Ask Codex about the files in your linked folder.';
  const messages = session?.messages ?? [];
  const activities = session?.activities ?? [];
  const commandActivities = activities.filter(activity => activity.kind === 'command');
  const problemActivities = activities.filter(activity => activity.status === 'blocked' || activity.status === 'failed');

  return <div className={`session-layout session-layout--${mobilePanel}`}>
    <div className="session-mobile-tabs"><Tabs items={[{ id: 'chat', label: 'Conversation' }, { id: 'context', label: 'Context' }, { id: 'code', label: 'Code & Output' }]} selected={mobilePanel} onChange={setMobilePanel} label="Session panel" /></div>
    <section className="session-conversation" aria-label="Codex conversation">
      <Plan session={session} compact />
      {messages.length ? <><div className="codex-transcript" ref={transcript} onScroll={() => { const element = transcript.current; if (element) { follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 70; if (follow.current) setNewMessages(false); } }} aria-label="Conversation messages" tabIndex={0}>
        {messages.map(message => <article className={`codex-message codex-message--${message.role}`} key={message.id}><span className="codex-message-avatar">{message.role === 'user' ? <Avatar size={32} {...(account.state.user ? { name: account.state.user.name } : {})} /> : <Icon name="sparkles" size={24} />}</span><div><header><strong>{message.role === 'user' ? account.state.user?.name ?? 'You' : 'Codex'}</strong><span>{message.status === 'streaming' ? 'Responding…' : message.status === 'complete' ? '' : message.status}</span></header><div className="codex-message-text">{message.text || (message.status === 'streaming' ? 'Waiting for response…' : 'No text output.')}</div></div></article>)}
        <Plan session={session} />
      </div>{newMessages && <button type="button" className="codex-new-messages" onClick={() => { follow.current = true; setNewMessages(false); if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; }}>Go to latest response ↓</button>}</> : <div className="conversation-empty"><span className="conversation-emblem"><Icon name="sparkles" size={39} /></span><EmptyPanel title={ready ? 'Start a conversation' : 'Connect your local workspace'} description={gate} /><Button size="sm" onClick={() => onNavigate(project && technical && (!repository || !codex.binding) ? 'repos' : 'settings')}><Icon name="settings" size={15} />{project && technical && (!repository || !codex.binding) ? 'Repository settings' : 'Connection settings'}<Icon name="arrow-right" size={14} /></Button></div>}
      <p className="sr-only" role="status">{session ? `Codex session ${session.status}.` : 'No Codex session selected.'}</p>
      {(codex.error || codex.bindingError || local.error || session?.error) && <p className="codex-session-error" role="alert">{codex.error || codex.bindingError || local.error || session?.error}</p>}
      {codex.state.notice && <p className="codex-notice" role="status">{codex.state.notice}</p>}
      <form className="session-composer" onSubmit={event => { void send(event); }}>
        <div className="codex-composer-selection"><ModelControls disabled={!ready || codex.busy || running} /><Button type="button" size="sm" disabled={!ready || codex.busy || running} onClick={() => openSession('newSession')}><Icon name="plus" size={12} />New chat</Button>{!session && ready && <Button type="button" size="sm" disabled={codex.busy} onClick={() => openSession('openSession')}>Open chat</Button>}</div>
        <div className="session-context-chips">{local.context?.files.map(file => <button type="button" key={file.id} title={file.path} onClick={() => { void local.request('readFile', file.id); }}><Icon name="file" size={12} /><span>{file.path}</span></button>)}</div><label className="sr-only" htmlFor="codex-message">Message Codex</label><div className="composer-input"><button type="button" disabled={!local.enabled || local.busy || running} title="Select local text files from the linked repository" aria-label="Attach files" onClick={() => { void local.request('pickFiles'); }}><Icon name="attachment" size={17} /></button><textarea id="codex-message" disabled={!ready || codex.busy || running} placeholder={ready ? 'Ask Codex about your linked project…' : gate} value={draft} maxLength={32000} onChange={event => local.setDraft(event.target.value)} onBlur={local.flushDraft} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={2} /><button type="submit" disabled={!ready || codex.busy || running || !draft.trim()} title="Send message (Enter)" aria-label="Send message"><Icon name="send" size={17} /></button></div>
        <div className="composer-tools"><span className="codex-policy-label"><Icon name="shield" size={12} />Read only · this device</span>{running && <Button type="button" size="sm" disabled={codex.busy} onClick={interrupt}><Icon name="pause" size={12} />Interrupt response</Button>}<span className="codex-input-hint">{local.enabled && draft ? local.draftStatus === 'saved' ? 'Draft saved locally' : local.draftStatus === 'saving' ? 'Saving draft…' : 'Draft not saved' : 'Shift + Enter for a new line'}</span></div>
      </form>
    </section>
    <div className="session-right"><section className="session-context" aria-label="Session context"><Tabs items={contextTabs} selected={contextTab} onChange={setContextTab} label="Session context" />{contextTab === 'context' ? <LocalContextPanels tasks={history.tasks} onNavigate={onNavigate} /> : contextTab === 'tasks' ? <div className="context-tab-empty"><TaskRows tasks={history.tasks} /></div> : <div className="session-info-panel"><SessionDetails session={session} /><SharedHistory items={history.items} projectId={project?.id} loading={history.loading} error={history.error} onRefresh={history.refresh} /></div>}</section>
      <section className="code-workspace" aria-label="Code workspace"><div className="code-workspace-heading"><Tabs items={codeTabs} selected={codeTab} onChange={setCodeTab} label="Code workspace" /><button type="button" className="split-view-button" disabled title="A repository diff is required to change the view."><Icon name="code" size={13} />Split View</button></div><div className="code-primary-panel">{codeTab === 'code' && local.preview ? <><div className="code-file-tabs"><Icon name="file" size={13} />{local.context?.files.find(file => file.id === local.preview?.fileId)?.path ?? 'Selected file'} · read only</div><pre className="session-file-preview">{local.preview.text}</pre></> : codeTab === 'code' ? <><div className="code-file-tabs"><Icon name="file" size={13} />Runtime activity · {activities.length} observed</div>{activities.length ? <div className="codex-activities" aria-label="Observed Codex activity">{activities.map(activity => <details key={activity.id} open={activity.status === 'running' || activity.status === 'blocked'}><summary><Icon name={activity.kind === 'command' ? 'terminal' : activity.kind === 'fileChange' ? 'file' : activity.kind === 'plan' ? 'tasks' : 'sparkles'} size={14} /><strong>{activity.title}</strong><Badge tone={activity.status === 'blocked' || activity.status === 'failed' ? 'warning' : 'neutral'}>{activity.status}</Badge></summary>{activity.detail && <pre>{activity.detail}</pre>}</details>)}</div> : <div className="code-empty"><EmptyPanel icon={<Icon name="code" size={24} />} title="No file changes" description="Read only mode does not apply changes. Observable tool activity will appear here." /></div>}</> : codeTab === 'terminal' && commandActivities.length ? <div className="codex-activities">{commandActivities.map(activity => <section key={activity.id}><strong>{activity.title} · {activity.status}</strong><pre>{activity.detail}</pre></section>)}</div> : <EmptyPanel icon={<Icon name={codeTab === 'terminal' ? 'terminal' : codeTab === 'tests' ? 'test' : 'eye'} size={25} />} title={codeTab === 'terminal' ? 'No command output observed' : codeTab === 'tests' ? copy.noTests : copy.noPreview} description={codeTab === 'terminal' ? 'Output appears only for tools the local runtime actually reports.' : codeTab === 'tests' ? 'No recognized test report is available.' : 'Connect a deployment or local preview to view it here.'} />}</div><div className="code-output"><Tabs items={outputTabs} selected={outputTab} onChange={setOutputTab} label="Execution output" /><div className="output-body"><div className="output-empty">{outputTab === 'problems' && problemActivities.length ? <span>{problemActivities.map(activity => `${activity.title}: ${activity.status}`).join('\n')}</span> : <><Icon name={outputTab === 'problems' ? 'shield' : 'terminal'} size={15} /><span>{outputTab === 'problems' ? 'No diagnostics available' : outputTab === 'console' ? 'No debug session' : running ? 'Codex is responding…' : session ? `Session ${session.status}` : copy.noOutput}</span></>}</div><div className="test-results-empty"><strong>Test Results</strong><span>Not observed</span><dl><div><dt>Coverage</dt><dd>—</dd></div><div><dt>Duration</dt><dd>—</dd></div></dl></div></div></div></section>
    </div>
    {share && session && technical && <PublishSession session={session} onClose={() => setShare(false)} onPublished={() => { setHistoryVersion(value => value + 1); setContextTab('info'); }} />}
  </div>;
}

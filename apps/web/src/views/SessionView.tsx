import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Avatar, Button, EmptyPanel, Icon, Tabs } from '@nexus-ai/ui';
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
import { APPROVALS_EVENT, Approvals, ExecutionPolicy } from '../session/Approvals.js';
import { CodeWorkspace } from '../session/CodeWorkspace.js';
import { useLocalWorkspace } from '../session/workspace.js';
import { DomainDialog } from '../collaboration/components.js';
import { ConnectionPanel, LiveShares, SHARE_LIVE_EVENT, ShareLiveSession } from '../realtime/RealtimePanels.js';
import { sessionTarget } from '../overview/state.js';

const contextTabs = [{ id: 'context', label: 'Context & Files' }, { id: 'tasks', label: 'Tasks' }, { id: 'info', label: 'Session Info' }];

export function SessionView({ onNavigate }: WorkspaceViewProps) {
  const codex = useCodex();
  const collaboration = useCollaboration();
  const account = useAccount();
  const project = collaboration.project;
  const repository = project?.repository;
  const session = codex.state.session;
  const target = sessionTarget(window.location.hash);
  const linked = Boolean(target.live || target.excerpt);
  const [contextTab, setContextTab] = useState(linked || !window.nexusDesktop ? 'info' : 'context');
  const [mobilePanel, setMobilePanel] = useState(linked || !window.nexusDesktop ? 'context' : 'chat');
  const local = useSessionContext();
  const workspace = useLocalWorkspace();
  const [approvals, setApprovals] = useState(false);
  useEffect(() => { const open = () => setApprovals(true); window.addEventListener(APPROVALS_EVENT, open); return () => window.removeEventListener(APPROVALS_EVENT, open); }, []);
  const draft = local.draft;
  const [share, setShare] = useState(false);
  const [shareChoice, setShareChoice] = useState(false);
  const [liveShare, setLiveShare] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const history = useProjectHistory(project?.id, collaboration.ready && Boolean(project), historyVersion);
  useEffect(() => { const open = () => setShareChoice(true); window.addEventListener(SHARE_SESSION_EVENT, open); return () => window.removeEventListener(SHARE_SESSION_EVENT, open); }, []);
  useEffect(() => { const open = () => setLiveShare(true); window.addEventListener(SHARE_LIVE_EVENT, open); return () => window.removeEventListener(SHARE_LIVE_EVENT, open); }, []);
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

  useEffect(() => { opened.current = ''; follow.current = true; setNewMessages(false); }, [projectId, repositoryId, account.state.user?.id]);
  useEffect(() => {
    if (linked || !openKey || opened.current === openKey || !projectId || !repositoryId || !modelName) return;
    opened.current = openKey;
    void codex.request({ operation: 'openSession', projectId, repositoryId, model: modelName });
  }, [linked, openKey, projectId, repositoryId, modelName, codex.request]);
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
        <div className="composer-tools"><ExecutionPolicy enabled={ready} />{running && <Button type="button" size="sm" disabled={codex.busy} onClick={interrupt}><Icon name="pause" size={12} />Interrupt response</Button>}<span className="codex-input-hint">{local.enabled && draft ? local.draftStatus === 'saved' ? 'Draft saved locally' : local.draftStatus === 'saving' ? 'Saving draft…' : 'Draft not saved' : 'Shift + Enter for a new line'}</span></div>
      </form>
    </section>
    <div className="session-right"><section className="session-context" aria-label="Session context"><Tabs items={contextTabs} selected={contextTab} onChange={setContextTab} label="Session context" />{contextTab === 'context' ? <LocalContextPanels tasks={history.tasks} onNavigate={onNavigate} workspace={workspace} /> : contextTab === 'tasks' ? <div className="context-tab-empty"><TaskRows tasks={history.tasks} /></div> : <div className="session-info-panel"><ConnectionPanel /><SessionDetails session={session} /><LiveShares /><SharedHistory items={history.items} projectId={project?.id} loading={history.loading} error={history.error} onRefresh={history.refresh} /></div>}</section>
      <CodeWorkspace workspace={workspace} />
    </div>
    {approvals && technical && <Approvals onClose={() => setApprovals(false)} />}
    {shareChoice && session && technical && <DomainDialog title="Share this session" onClose={() => setShareChoice(false)}><div className="session-publish-body"><p>Select and review message text before sharing it with the project. Execution and approvals stay on this device.</p><div className="realtime-share-options"><Button onClick={() => { setShareChoice(false); setShare(true); }}><Icon name="upload" size={15} />Publish a frozen excerpt</Button><p>Publish selected complete messages once.</p><Button onClick={() => { setShareChoice(false); setLiveShare(true); }}><Icon name="sessions" size={15} />Share selected messages live</Button><p>Share the selected text and future text appended to those same messages, after explicit consent.</p></div></div></DomainDialog>}
    {liveShare && session && technical && <ShareLiveSession session={session} onClose={() => setLiveShare(false)} onShared={() => setContextTab('info')} />}
    {share && session && technical && <PublishSession session={session} onClose={() => setShare(false)} onPublished={() => { setHistoryVersion(value => value + 1); setContextTab('info'); }} />}
  </div>;
}

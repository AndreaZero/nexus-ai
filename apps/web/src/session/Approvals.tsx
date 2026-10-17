import { useEffect, useRef, useState } from 'react';
import type { CodexApproval } from '@nexus-ai/contracts';
import { Badge, Button, EmptyPanel, Icon } from '@nexus-ai/ui';
import { DomainDialog } from '../collaboration/components.js';
import { useCodex } from '../codex/CodexProvider.js';
import { approvalActive, approvalFiles, approvalReviewable } from './approval-state.js';
import { DiffViewer } from './CodeWorkspace.js';

export const APPROVALS_EVENT = 'nexus:session:approvals';
export function Approvals({ onClose }: { onClose(): void }) {
  const codex = useCodex(); const session = codex.state.session;
  const [now, setNow] = useState(Date.now()); const [pending, setPending] = useState<string[]>([]);
  const inFlight = useRef(new Set<string>());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  async function decide(approval: CodexApproval, decision: 'acceptOnce' | 'decline') {
    if (!session || inFlight.current.has(approval.id) || !approvalActive(approval, session.threadId, session.turnId, Date.now())) return;
    if (decision === 'acceptOnce' && !approvalReviewable(approval, session.fileChanges)) return;
    inFlight.current.add(approval.id); setPending([...inFlight.current]);
    try { await codex.request({ operation: 'resolveApproval', projectId: session.projectId, repositoryId: session.repositoryId, approvalId: approval.id, decision }); }
    finally { inFlight.current.delete(approval.id); setPending([...inFlight.current]); }
  }
  return <DomainDialog title="Local execution approvals" onClose={onClose}><div className="execution-approvals"><p>These requests control Codex on this device. An approval permits this request once. Review the command, folder and requested access before continuing; commands may run outside the normal sandbox.</p><p className="approval-boundary"><Icon name="shield" size={15} />Client deliverable approvals and published excerpts do not grant local execution.</p>{codex.error && <p role="alert" className="codex-session-error">{codex.error}</p>}{session?.approvals.length ? session.approvals.map(approval => {
    const active = approvalActive(approval, session.threadId, session.turnId, now); const busy = pending.includes(approval.id);
    const files = approvalFiles(approval, session.fileChanges); const reviewable = approvalReviewable(approval, session.fileChanges);
    return <section className="execution-request" key={approval.id}><header><Icon name={approval.kind === 'command' ? 'terminal' : 'file'} size={17} /><strong>{approval.kind === 'command' ? 'Run command' : 'Apply file changes'}</strong><Badge tone={active ? 'warning' : 'neutral'}>{active ? `${Math.max(0, Math.ceil((Date.parse(approval.expiresAt) - now) / 1000))}s remaining` : 'Expired · cannot approve'}</Badge></header>{approval.reason && <p>{approval.reason}</p>}{approval.command && <pre aria-label="Requested command">{approval.command}</pre>}{approval.kind === 'fileChange' && <div className="approval-file-changes">{files.length ? files.map(file => <section key={file.id}><header><strong>{file.path}</strong><Badge tone={file.truncated ? 'warning' : 'neutral'}>{file.kind} · {file.status}{file.truncated ? ' · truncated' : ''}</Badge></header><DiffViewer patch={file.diff} split={false} /></section>) : <p>No patch reported. Decline this request and ask Codex to provide the patch for review.</p>}{files.length > 0 && !reviewable && <p>The patch is incomplete. Decline this request and ask Codex to provide the full patch.</p>}</div>}<dl>{approval.cwd && <div><dt>Working folder</dt><dd>{approval.cwd}</dd></div>}{approval.requestedRoot && <div><dt>Additional write root</dt><dd>{approval.requestedRoot}</dd></div>}<div><dt>Scope</dt><dd>Current local thread and turn only</dd></div></dl><div className="domain-actions"><Button disabled={busy || !active} variant="danger" onClick={() => { void decide(approval, 'decline'); }}>Decline</Button><Button disabled={busy || !active || !reviewable} variant="primary" onClick={() => { void decide(approval, 'acceptOnce'); }}>{busy ? 'Sending decision…' : 'Allow once'}</Button></div></section>;
  }) : <EmptyPanel icon={<Icon name="shield" size={26} />} title="No pending requests" description="Codex requests requiring your decision appear here. Requests expire automatically and are discarded when the session stops or changes." />}</div></DomainDialog>;
}
export function ExecutionPolicy({ enabled }: { enabled: boolean }) {
  const codex = useCodex(); const session = codex.state.session; const [confirm, setConfirm] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false); const [applying, setApplying] = useState(false);
  async function apply(policy: 'readOnly' | 'workspaceWrite') {
    if (!session || applying) return;
    setApplying(true);
    try { if (await codex.request({ operation: 'setPolicy', projectId: session.projectId, repositoryId: session.repositoryId, policy })) { setConfirm(false); setAcknowledged(false); } }
    finally { setApplying(false); }
  }
  return <><label className="session-policy-select"><Icon name="shield" size={12} /><span className="sr-only">Local execution policy</span><select disabled={!enabled || !session || session.status === 'running' || codex.busy || applying} value={codex.state.policy} onChange={event => { if (event.target.value === 'workspaceWrite') { setAcknowledged(false); setConfirm(true); } else void apply('readOnly'); }}><option value="readOnly">Read only · this device</option><option value="workspaceWrite">Workspace write · this device</option></select></label>{confirm && <DomainDialog title="Enable workspace writes" busy={applying} onClose={() => setConfirm(false)}><div className="execution-approvals"><p>Codex can edit files and run commands within the linked workspace, subject to the sandbox. Network access remains disabled in the sandbox. Requests for broader permissions need a separate local approval.</p><p className="approval-boundary">This choice applies to the current repository binding. It is reset when that binding or your Nexus account changes.</p><label className="policy-acknowledgement"><input type="checkbox" checked={acknowledged} disabled={applying} onChange={event => setAcknowledged(event.target.checked)} />Allow Codex to modify this workspace.</label>{codex.error && <p role="alert" className="codex-session-error">{codex.error}</p>}<div className="domain-actions"><Button disabled={applying} onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" disabled={!acknowledged || applying || !enabled || session?.status === 'running'} onClick={() => { void apply('workspaceWrite'); }}>{applying ? 'Applying…' : 'Enable workspace writes'}</Button></div></div></DomainDialog>}</>;
}

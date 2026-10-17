import { useState } from 'react';
import type { FormEvent } from 'react';
import { Badge, Button, Card, Icon, StatusIndicator } from '@nexus-ai/ui';
import { codexRequestSchema } from '@nexus-ai/contracts';
import { useCodex } from './CodexProvider.js';
import { ModelControls } from './ModelControls.js';
import { useDesktopInfo } from '../use-desktop-info.js';

function deviceUrl(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && (url.hostname === 'auth.openai.com' || url.hostname === 'chatgpt.com') ? url.href : null; } catch { return null; }
}

export function CodexSettings() {
  const codex = useCodex();
  const desktop = useDesktopInfo();
  const { state, busy, enabled } = codex;
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [keyError, setKeyError] = useState('');
  const verificationUrl = deviceUrl(state.login?.verificationUrl ?? null);
  async function submitApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const parsed = codexRequestSchema.safeParse({ operation: 'loginApiKey', apiKey });
    setApiKey('');
    if (!parsed.success) { setKeyError('Enter a valid API key.'); return; }
    setKeyError('');
    if (await codex.request(parsed.data)) setShowKey(false);
  }
  return <Card title="Codex runtime" icon={<Icon name="sparkles" />} action={<Badge tone="neutral">Local · {codex.state.policy === 'readOnly' ? 'Read only' : 'Workspace write'}</Badge>}>
    <div role="status"><StatusIndicator tone={state.runtime === 'ready' ? 'positive' : state.runtime === 'error' || state.runtime === 'incompatible' || state.runtime === 'missing' ? 'danger' : 'neutral'}>{!codex.desktop ? 'Desktop required' : !enabled ? 'Sign in to Nexus first' : state.runtime === 'starting' ? 'Starting Codex…' : `Runtime ${state.runtime}`}</StatusIndicator></div>
    <dl className="settings-details"><div><dt>Runtime version</dt><dd>{state.version ?? 'Not started'} · required {state.expectedVersion}</dd></div><div><dt>Executable</dt><dd className="codex-runtime-path">{state.runtimePath ?? 'Available after connection'}</dd></div><div><dt>Codex account</dt><dd>{state.account ? state.account.type === 'chatgpt' ? state.account.email ?? 'Personal ChatGPT account' : 'API key (explicit)' : 'Not signed in'}</dd></div>{state.account?.plan && <div><dt>Reported plan</dt><dd>{state.account.plan}</dd></div>}</dl>
    <p className="settings-note">Connect your personal ChatGPT account through the official Codex login. This is separate from your Nexus account. Credentials stay with Codex on this device.</p>
    <div className="codex-settings-actions"><Button size="sm" variant="primary" disabled={!enabled || busy || state.runtime === 'ready'} onClick={() => { void codex.request({ operation: 'connect' }); }}>Connect Codex</Button><Button size="sm" disabled={!enabled || busy || state.runtime === 'stopped'} onClick={() => { void codex.request({ operation: 'disconnect' }); }}>Disconnect runtime</Button>{state.runtime === 'ready' && <Button size="sm" disabled={busy} onClick={() => { void codex.refresh(); }}>Refresh status</Button>}</div>
    {state.runtime === 'ready' && desktop.status === 'ready' && desktop.info.platform === 'win32' && <div className="codex-settings-actions"><Button size="sm" disabled={busy} onClick={() => { void codex.request({ operation: 'setupSandbox' }); }}><Icon name="shield" size={14} />Set up Windows sandbox</Button><span className="settings-note">Initialize the restricted Windows runtime before your first conversation.</span></div>}
    {state.runtime === 'ready' && !state.account && !state.login && <div className="codex-settings-actions"><Button size="sm" variant="primary" disabled={busy} onClick={() => { void codex.request({ operation: 'login', method: 'browser' }); }}><Icon name="external-link" size={14} />Sign in with ChatGPT</Button><Button size="sm" disabled={busy} onClick={() => { void codex.request({ operation: 'login', method: 'device' }); }}>Use device code</Button></div>}
    {state.login && <div className="codex-login-pending" role="status"><strong>{state.login.method === 'browser' ? 'Complete the official login in your browser' : 'Complete device sign in'}</strong>{state.login.method === 'device' && <>{verificationUrl ? <><span>If the browser did not open, copy this address into your browser:</span><span className="codex-verification-url">{verificationUrl}</span></> : <span>Use the official verification page shown by Codex.</span>}{state.login.userCode && <code>{state.login.userCode}</code>}</>}<Button size="sm" disabled={busy} onClick={() => { void codex.request({ operation: 'cancelLogin' }); }}>Cancel sign in</Button></div>}
    {state.account && <div className="codex-settings-actions"><Button size="sm" disabled={busy} onClick={() => { void codex.request({ operation: 'logout' }); }}>Sign out of Codex</Button><Button size="sm" disabled={busy} onClick={() => { void codex.request({ operation: 'refreshModels' }); }}><Icon name="refresh" size={13} />Refresh models</Button></div>}
    {state.runtime === 'ready' && state.account && <ModelControls disabled={busy} />}
    {state.runtime === 'ready' && !state.account && !state.login && <div className="codex-api-option"><button type="button" className="text-link" aria-expanded={showKey} onClick={() => { setShowKey(value => !value); setApiKey(''); setKeyError(''); }}>Use an API key instead</button>{showKey && <form className="domain-form" onSubmit={event => { void submitApiKey(event); }}><p className="settings-note">API usage is billed to the key’s account. Nexus never switches to API billing automatically.</p><label>API key<input type="password" autoComplete="off" spellCheck={false} maxLength={512} value={apiKey} onChange={event => setApiKey(event.target.value)} disabled={busy} required /></label><Button size="sm" type="submit" disabled={busy || !apiKey}>Connect with this key</Button>{keyError && <p className="domain-error" role="alert">{keyError}</p>}</form>}</div>}
    <p className="settings-note">Sessions begin in read only mode. Enable workspace writes explicitly in AI Sessions; broader permissions require a local, single use approval. Model availability and usage limits are enforced by Codex.</p>
    {state.notice && <p className="codex-notice" role="status">{state.notice}</p>}{codex.error && <p className="domain-error" role="alert">{codex.error}</p>}
  </Card>;
}

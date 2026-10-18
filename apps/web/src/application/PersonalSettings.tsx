import { useState } from 'react';
import { Button, Card, Icon } from '@nexus-ai/ui';
import type { ApplicationPreferences, ApplicationSettings } from '@nexus-ai/contracts';
import { useApplication } from './ApplicationProvider.js';
import { useAccount } from '../auth/AuthProvider.js';
import { useCodex } from '../codex/CodexProvider.js';
import { Feedback } from '../collaboration/components.js';

export const notificationCategories = [{ id: 'sessions', label: 'AI sessions' }, { id: 'tasks', label: 'Tasks & milestones' }, { id: 'documents', label: 'Documents & deliverables' }, { id: 'comments', label: 'Comments & feedback' }, { id: 'commits', label: 'Commits & reviews' }, { id: 'deployments', label: 'Deployments' }] satisfies { id: ApplicationPreferences['notificationCategories'][number]; label: string }[];
export function PersonalSettings() {
  const application = useApplication();
  return <Card title="Profile & preferences" icon={<Icon name="settings" />}>
    {application.settings ? <PersonalSettingsForm key={application.settings.version} settings={application.settings} /> : <><p className="settings-note" role="status">{application.loading ? 'Loading your saved preferences…' : application.online ? 'Your preferences could not be loaded.' : 'Sign in and reconnect to load your saved preferences.'}</p><Feedback error={application.error} /><Button size="sm" disabled={!application.online || application.loading} onClick={application.refresh}>Reload preferences</Button></>}
  </Card>;
}
function PersonalSettingsForm({ settings }: { settings: ApplicationSettings }) {
  const application = useApplication(); const account = useAccount(); const codex = useCodex();
  const [name, setName] = useState(settings.name); const [preferences, setPreferences] = useState(settings.preferences); const [notice, setNotice] = useState('');
  const model = codex.state.models.find(model => model.id === preferences.defaultModelId);
  const missingModel = Boolean(preferences.defaultModelId && !model);
  function update(patch: Partial<ApplicationPreferences>) { setPreferences(previous => ({ ...previous, ...patch })); setNotice(''); }
  async function save() { setNotice(''); if (await application.save({ name: name.trim(), preferences }, settings.version)) { setNotice('Preferences saved.'); await account.refresh(); } }
  return <form className="domain-form application-preferences-form" onSubmit={event => { event.preventDefault(); void save(); }}>
    <label>Display name<input aria-label="Display name" required maxLength={200} value={name} onChange={event => { setName(event.target.value); setNotice(''); }} /></label>
    <fieldset><legend>In-app notifications</legend><label className="application-checkbox"><input type="checkbox" checked={preferences.notificationsEnabled} onChange={event => update({ notificationsEnabled: event.target.checked })} />Show notifications and unread badge</label><div className="application-category-settings">{notificationCategories.map(category => <label className="application-checkbox" key={category.id}><input type="checkbox" disabled={!preferences.notificationsEnabled} checked={preferences.notificationCategories.includes(category.id)} onChange={event => update({ notificationCategories: event.target.checked ? [...preferences.notificationCategories, category.id] : preferences.notificationCategories.filter(value => value !== category.id) })} />{category.label}</label>)}</div><small>These preferences filter in-app updates. Read state remains saved for each project.</small></fieldset>
    <label>Default sharing audience<select aria-label="Default sharing audience" value={preferences.defaultVisibility} onChange={event => update({ defaultVisibility: event.target.value as 'team' | 'client' })}><option value="team">Project team</option><option value="client">Team, clients & viewers</option></select><small>New editors start with this audience. Message selection, publication previews and confirmations remain explicit.</small></label>
    <label>Default Codex model<select aria-label="Default Codex model" value={preferences.defaultModelId ?? ''} onChange={event => { const selected = codex.state.models.find(model => model.id === event.target.value); update({ defaultModelId: selected?.id ?? null, defaultEffort: selected?.defaultEffort ?? null }); }}><option value="">Runtime default</option>{missingModel && <option value={preferences.defaultModelId!}>Saved model · currently unavailable</option>}{codex.state.models.map(model => <option key={model.id} value={model.id}>{model.name || model.model}</option>)}</select><small>{!codex.state.models.length ? 'Connect Codex to read the model catalog available to your account.' : 'Applies only when the saved model is present in the current runtime catalog.'}</small></label>
    <label>Default reasoning effort<select aria-label="Default reasoning effort" disabled={!model?.efforts.length} value={preferences.defaultEffort ?? ''} onChange={event => update({ defaultEffort: event.target.value || null })}><option value="">Runtime default</option>{preferences.defaultEffort && !model?.efforts.includes(preferences.defaultEffort) && <option value={preferences.defaultEffort}>Saved effort · unavailable</option>}{model?.efforts.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    <Feedback error={application.error} notice={notice} /><div className="domain-actions"><Button size="sm" disabled={application.saving || !application.online} onClick={application.refresh}>Reload saved preferences</Button><Button type="submit" size="sm" variant="primary" disabled={application.saving || !application.online || !name.trim()}>{application.saving ? 'Saving…' : 'Save profile & preferences'}</Button></div><p className="settings-note" role="status">{settings.updatedAt ? `Last saved ${new Date(settings.updatedAt).toLocaleString()}. ` : ''}Saved to your Nexus account. A conflicting revision keeps this draft; reload only when you are ready to discard it.</p>
  </form>;
}

import { useEffect, useId, useRef, useState } from 'react';
import { Button, Icon } from '@nexus-ai/ui';
import { NotificationList } from './overview/Activity.js';
import { useOverview } from './overview/OverviewProvider.js';
import { useApplication } from './application/ApplicationProvider.js';
import { visibleNotifications } from './application/state.js';
import { notificationCategories } from './application/PersonalSettings.js';
import { useCollaboration } from './collaboration/CollaborationProvider.js';
import { isDialogBackdropClick } from './dialog.js';

export function NotificationsDialog({ onClose }: { onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null); const titleId = useId(); const overview = useOverview(); const application = useApplication(); const { project } = useCollaboration();
  const [category, setCategory] = useState('all'); const [unreadOnly, setUnreadOnly] = useState(false);
  const snapshot = overview.snapshot; const items = snapshot && application.settings ? visibleNotifications(snapshot.notifications, application.preferences, snapshot.readThrough, category, unreadOnly) : [];
  const unread = items.filter(item => snapshot && BigInt(item.sequence) > BigInt(snapshot.readThrough)).length;
  const through = items.reduce((max, item) => BigInt(item.sequence) > BigInt(max) ? item.sequence : max, '0');
  useEffect(() => { const previous = document.activeElement; const element = dialog.current; element?.showModal(); return () => { element?.close(); if (previous instanceof HTMLElement) previous.focus(); }; }, []);
  return <dialog ref={dialog} className="navigation-dialog notification-dialog" aria-labelledby={titleId} onCancel={onClose} onClick={event => { if (isDialogBackdropClick(event)) onClose(); }}><div className="navigation-dialog__inner"><div className="navigation-dialog__heading"><h2 id={titleId}>Notifications · {unread} displayed unread</h2><button type="button" className="icon-control" aria-label="Close notifications" onClick={onClose}><Icon name="x" size={18} /></button></div><p className="application-search-note">{project?.name ?? 'Select a project'} · Latest {snapshot?.notifications.length ?? 0} authorized notifications, up to 30. Your saved category preferences apply.</p><div className="notification-filters"><select aria-label="Notification category" value={category} onChange={event => setCategory(event.target.value)}><option value="all">All enabled categories</option>{notificationCategories.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><label><input type="checkbox" checked={unreadOnly} onChange={event => setUnreadOnly(event.target.checked)} />Unread only</label></div><button className="text-link" type="button" title="The project read cursor includes all older activity, including categories hidden by these filters." disabled={!unread || through === '0'} onClick={() => { void overview.markRead(through); }}>Mark project read through newest displayed</button><NotificationList category={category} unreadOnly={unreadOnly} onOpen={onClose} />{overview.error && <p role="alert">{overview.error}</p>}{application.error && <p role="alert">{application.error}</p>}<div className="navigation-dialog__footer"><a href="#/overview" onClick={onClose}>Open project activity</a><Button size="sm" disabled={overview.loading || !project} onClick={overview.refresh}>Refresh notifications</Button></div></div></dialog>;
}

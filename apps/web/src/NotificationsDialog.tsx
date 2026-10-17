import { useEffect, useId, useRef } from 'react';
import { Icon } from '@nexus-ai/ui';
import { NotificationList } from './overview/Activity.js';
import { useOverview } from './overview/OverviewProvider.js';

export function NotificationsDialog({ onClose }: { onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const overview = useOverview();
  const renderedCursor = useRef(overview.snapshot?.cursor ?? null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="navigation-dialog notification-dialog" aria-labelledby={titleId} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="navigation-dialog__inner"><div className="navigation-dialog__heading"><h2 id={titleId}>Notifications {overview.snapshot ? `· ${overview.snapshot.unreadCount} unread` : ''}</h2><button type="button" className="icon-control" aria-label="Close notifications" onClick={onClose}><Icon name="x" size={18} /></button></div><button className="text-link" type="button" disabled={!overview.snapshot?.unreadCount || !renderedCursor.current} onClick={() => { if (renderedCursor.current) void overview.markRead(renderedCursor.current); }}>Mark displayed notifications read</button><NotificationList onOpen={onClose} />{overview.error && <p role="alert">{overview.error}</p>}</div></dialog>;
}

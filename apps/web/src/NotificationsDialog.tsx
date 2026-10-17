import { useEffect, useId, useRef } from 'react';
import { EmptyPanel, Icon } from '@nexus-ai/ui';

export function NotificationsDialog({ onClose }: { onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="navigation-dialog notification-dialog" aria-labelledby={titleId} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="navigation-dialog__inner"><div className="navigation-dialog__heading"><h2 id={titleId}>Notifications</h2><button type="button" className="icon-control" aria-label="Close notifications" onClick={onClose}><Icon name="x" size={18} /></button></div><EmptyPanel icon={<Icon name="bell" size={24} />} title="You're all caught up" description="No notifications are available in this workspace." /></div></dialog>;
}

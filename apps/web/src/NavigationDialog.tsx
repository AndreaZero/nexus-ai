import { useEffect, useId, useRef, useState } from 'react';
import { EmptyPanel, Icon } from '@nexus-ai/ui';
import { routes } from './routes.js';
import type { ShellRoute } from './shell/types.js';

interface NavigationDialogProps {
  onClose(): void;
  onNavigate(route: ShellRoute): void;
}

export function NavigationDialog({ onClose, onNavigate }: NavigationDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [query, setQuery] = useState('');
  const results = routes.filter((route) => `${route.label} ${route.description}`.toLowerCase().includes(query.toLowerCase().trim()));

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    search.current?.focus();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} className="navigation-dialog" aria-labelledby={titleId} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="navigation-dialog__inner">
        <div className="navigation-dialog__heading"><h2 id={titleId}>Go to a page</h2><button type="button" className="icon-control" aria-label="Close navigation" onClick={onClose}><Icon name="x" size={18} /></button></div>
        <label className="navigation-dialog__search"><Icon name="search" size={18} /><input ref={search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages…" aria-label="Search application pages" /></label>
        <div className="navigation-dialog__results">
          {results.map((route) => <button type="button" className="navigation-result" key={route.id} onClick={() => { onNavigate(route.id); onClose(); }}><span><strong>{route.label}</strong><small>{route.description}</small></span><Icon name="arrow-right" size={16} /></button>)}
          {!results.length && <EmptyPanel title="No matching pages" description="Try a different page name." compact />}
        </div>
        <div className="navigation-dialog__footer"><span>Application navigation</span><kbd>Esc to close</kbd></div>
      </div>
    </dialog>
  );
}

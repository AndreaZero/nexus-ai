import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  children: ReactNode;
}

export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <section className="nexus-empty-state" aria-labelledby="empty-state-title">
      <span className="nexus-empty-state__mark" aria-hidden="true">N</span>
      <h1 id="empty-state-title">{title}</h1>
      <div className="nexus-empty-state__description">{children}</div>
    </section>
  );
}

export interface StatusIndicatorProps {
  tone: 'neutral' | 'pending' | 'positive' | 'warning' | 'danger';
  children: ReactNode;
}

export function StatusIndicator({ tone, children }: StatusIndicatorProps) {
  return (
    <span className={`nexus-status nexus-status--${tone}`}>
      <span className="nexus-status__dot" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

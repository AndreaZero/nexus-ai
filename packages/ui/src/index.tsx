import { useId, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { Icon } from './icons.js';

export { Icon } from './icons.js';
export type { IconName, IconProps } from './icons.js';

function classes(...values: (string | false | undefined)[]) { return values.filter(Boolean).join(' '); }

export function NexusMark({ size = 40, className }: { size?: number; className?: string }) {
  const gradient = useId();
  return <svg className={classes('nexus-mark', className)} width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true"><defs><linearGradient id={gradient} x1="12" y1="3" x2="31" y2="37" gradientUnits="userSpaceOnUse"><stop stopColor="#00c8ff" /><stop offset="1" stopColor="#0961ff" /></linearGradient></defs><path d="m18 3-8.5 15 5.6 3.2L21 10.8 27.5 22l5.5-3.2L23.2 3a3 3 0 0 0-5.2 0Z" fill={`url(#${gradient})`} /><path d="M8.2 20 1.4 31.8A3.1 3.1 0 0 0 4.1 36h16l-3.6-6.2H9.8l4.1-7.1L8.2 20Z" fill={`url(#${gradient})`} /><path d="m27.1 24 6.6 11.8a3 3 0 0 0 5.3-2.9l-5-8.9-5.6 3.3L27.1 24ZM23.5 19.2 17 30.5l3.2 5.5h13.1l-3.6-6.2h-5.4l4.8-8.3-5.6-2.3Z" fill={`url(#${gradient})`} /></svg>;
}

export function NexusLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return <div className={classes('nexus-logo', compact && 'nexus-logo--compact', className)} aria-label="Nexus AI — Build together with AI"><NexusMark size={39} />{!compact && <div className="nexus-logo__type"><div className="nexus-logo__word">NEXUS <span>AI</span></div><div className="nexus-logo__payoff">BUILD TOGETHER<br />WITH AI</div></div>}</div>;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' }
export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...props }: ButtonProps) {
  return <button {...props} type={type} className={classes('nexus-button', `nexus-button--${variant}`, `nexus-button--${size}`, className)} />;
}

export interface BadgeProps { tone?: 'neutral' | 'cyan' | 'blue' | 'violet' | 'success' | 'warning' | 'danger'; live?: boolean; children: ReactNode; className?: string }
export function Badge({ tone = 'neutral', live = false, children, className }: BadgeProps) {
  return <span className={classes('nexus-badge', `nexus-badge--${tone}`, live && 'nexus-badge--live', className)}>{live && <span className="nexus-badge__dot" aria-hidden="true" />}{children}</span>;
}

export interface CardProps { title: string; children: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string; active?: boolean; id?: string; bodyClassName?: string }
export function Card({ title, children, icon, action, className, active = false, id, bodyClassName }: CardProps) {
  const headingId = useId();
  return <section id={id} aria-labelledby={headingId} className={classes('nexus-card', active && 'nexus-card--active', className)}><div className="nexus-card__header"><h2 id={headingId}>{icon}<span>{title}</span></h2>{action && <div className="nexus-card__action">{action}</div>}</div><div className={classes('nexus-card__body', bodyClassName)}>{children}</div></section>;
}

export interface EmptyPanelProps { icon?: ReactNode; title: string; description?: string; compact?: boolean }
export function EmptyPanel({ icon, title, description, compact = false }: EmptyPanelProps) {
  return <div className={classes('nexus-empty-panel', compact && 'nexus-empty-panel--compact')}>{icon && <span className="nexus-empty-panel__icon" aria-hidden="true">{icon}</span>}<span className="nexus-empty-panel__title">{title}</span>{description && <p>{description}</p>}</div>;
}

type ChartTone = 'blue' | 'success' | 'violet';
function boundedValue(value: number | null) { return value !== null && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null; }
export interface ProgressBarProps { value: number | null; tone?: ChartTone; label?: string }
export function ProgressBar({ value, tone = 'blue', label = 'Progress' }: ProgressBarProps) {
  const amount = boundedValue(value);
  return <div className={classes('nexus-progress', `nexus-progress--${tone}`, amount === null && 'nexus-progress--unknown')} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} {...(amount === null ? { 'aria-valuetext': 'Not available' } : { 'aria-valuenow': amount })}>{amount !== null && <span className="nexus-progress__fill" style={{ width: `${amount}%` }} />}</div>;
}

export interface DonutProps { value: number | null; label?: string; size?: number; tone?: ChartTone }
export function Donut({ value, label = 'Progress', size = 112, tone = 'blue' }: DonutProps) {
  const amount = boundedValue(value);
  const gradient = useId();
  const circumference = 2 * Math.PI * 44;
  return <div className={classes('nexus-donut', `nexus-donut--${tone}`, amount === null && 'nexus-donut--unknown')} style={{ width: size, height: size }} role="img" aria-label={`${label}: ${amount === null ? 'not available' : `${Math.round(amount)}%`}`}><svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1"><stop stopColor="var(--nexus-chart-start)" /><stop offset="1" stopColor="var(--nexus-chart-end)" /></linearGradient></defs><circle className="nexus-donut__track" cx="50" cy="50" r="44" />{amount !== null && amount > 0 && <circle className="nexus-donut__value" cx="50" cy="50" r="44" stroke={`url(#${gradient})`} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - amount / 100)} transform="rotate(-90 50 50)" />}</svg><div className="nexus-donut__center"><strong>{amount === null ? '—' : `${Math.round(amount)}%`}</strong><span>{label}</span></div></div>;
}

export interface AvatarProps { name?: string; src?: string; status?: 'online' | 'offline' | 'busy'; size?: number }
export function Avatar({ name, src, status, size = 36 }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | undefined>();
  const initials = name?.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => Array.from(part)[0]).join('').toUpperCase();
  return <span className={classes('nexus-avatar', status && `nexus-avatar--${status}`)} style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.32)) }} role="img" aria-label={`${name ?? 'Profile'}${status ? `, ${status}` : ''}`} title={name}>{src && src !== failedSrc ? <img src={src} alt="" onError={() => setFailedSrc(src)} /> : initials ? <span aria-hidden="true">{initials}</span> : <Icon name="user" size={Math.round(size * 0.5)} />}{status && <span className="nexus-avatar__status" aria-hidden="true" />}</span>;
}

export interface TabsProps { items: readonly { id: string; label: string; disabled?: boolean; panelId?: string }[]; selected: string; onChange: (id: string) => void; label?: string }
export function Tabs({ items, selected, onChange, label = 'View' }: TabsProps) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const enabledItems = items.filter((item) => !item.disabled);
  const selectedEnabled = enabledItems.some((item) => item.id === selected) ? selected : enabledItems[0]?.id;
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    const index = enabledItems.findIndex((item) => item.id === id);
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight': nextIndex = (index + 1) % enabledItems.length; break;
      case 'ArrowLeft': nextIndex = (index - 1 + enabledItems.length) % enabledItems.length; break;
      case 'Home': nextIndex = 0; break;
      case 'End': nextIndex = enabledItems.length - 1; break;
      default: return;
    }
    event.preventDefault();
    const next = enabledItems[nextIndex];
    if (next) { tabRefs.current.get(next.id)?.focus(); onChange(next.id); }
  }
  return <div className="nexus-tabs" role="tablist" aria-label={label}>{items.map((item) => <button key={item.id} ref={(element) => { if (element) tabRefs.current.set(item.id, element); else tabRefs.current.delete(item.id); }} type="button" role="tab" aria-controls={item.panelId} aria-selected={selected === item.id} tabIndex={selectedEnabled === item.id ? 0 : -1} disabled={item.disabled} className={classes('nexus-tabs__tab', selected === item.id && 'nexus-tabs__tab--selected')} onClick={() => onChange(item.id)} onKeyDown={(event) => handleKeyDown(event, item.id)}>{item.label}</button>)}</div>;
}

export interface EmptyStateProps { title: string; children: ReactNode }
export function EmptyState({ title, children }: EmptyStateProps) {
  const headingId = useId();
  return <section className="nexus-empty-state" aria-labelledby={headingId}><span className="nexus-empty-state__mark" aria-hidden="true"><NexusMark size={32} /></span><h1 id={headingId}>{title}</h1><div className="nexus-empty-state__description">{children}</div></section>;
}
export interface StatusIndicatorProps { tone: 'neutral' | 'pending' | 'positive' | 'warning' | 'danger'; children: ReactNode }
export function StatusIndicator({ tone, children }: StatusIndicatorProps) {
  return <span className={`nexus-status nexus-status--${tone}`}><span className="nexus-status__dot" aria-hidden="true" /><span>{children}</span></span>;
}
/** Use only while a request is pending; resolved empty content uses EmptyPanel. */
export function Skeleton({ className }: { className?: string }) { return <span className={classes('nexus-skeleton', className)} aria-hidden="true" />; }

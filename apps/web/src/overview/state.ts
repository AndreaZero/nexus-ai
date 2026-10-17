import type { OverviewActivity } from '@nexus-ai/contracts';

export function retainAuthorized(current: OverviewActivity[], targets: OverviewActivity['target'][]) {
  const allowed = new Set(targets.map(target => `${target.kind}:${target.id}`));
  return current.filter(item => allowed.has(`${item.target.kind}:${item.target.id}`));
}

// Keep the page already being read in place; changed entities wait behind the new activity button.
export function mergeActivity(current: OverviewActivity[], older: OverviewActivity[]) {
  const ids = new Set(current.map(item => `${item.target.kind}:${item.target.id}`));
  return [...current, ...older.filter(item => { const key = `${item.target.kind}:${item.target.id}`; if (ids.has(key)) return false; ids.add(key); return true; })].slice(0, 500);
}
export function activityChanged(current: OverviewActivity[], next: OverviewActivity[]) {
  if (!next.length) return current.length > 0;
  return current.slice(0, next.length).map(item => item.id).join(':') !== next.map(item => item.id).join(':');
}
export function activityHref(item: Pick<OverviewActivity, 'target'>) {
  return `#/session?${item.target.kind === 'live_share' ? 'live' : 'excerpt'}=${encodeURIComponent(item.target.id)}`;
}
export function sessionTarget(hash: string) {
  const params = new URLSearchParams(hash.split('?')[1] ?? '');
  const valid = (value: string | null) => value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
  return { live: valid(params.get('live')), excerpt: valid(params.get('excerpt')) };
}
export function samplePoints(values: (number | null)[], width = 360, height = 44) {
  // A null CPU interval breaks its line rather than inventing an initial zero.
  return values.map((value, index) => value === null ? null : `${values.length > 1 ? index / (values.length - 1) * width : width},${height - value / 100 * height}`);
}

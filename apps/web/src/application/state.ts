import type { ApplicationPreferences, CodexModel, OverviewActivity, SearchHit } from '@nexus-ai/contracts';

export function searchHref(hit: Pick<SearchHit, 'id' | 'kind'>) {
  const id = encodeURIComponent(hit.id);
  if (hit.kind === 'project') return '#/overview';
  if (hit.kind === 'shared_session' || hit.kind === 'live_share') return `#/session?${hit.kind === 'shared_session' ? 'excerpt' : 'live'}=${id}`;
  if (hit.kind === 'deployment' || hit.kind === 'environment') return `#/deployments?${hit.kind === 'deployment' ? 'id' : 'environment'}=${id}`;
  return `#/${hit.kind === 'task' || hit.kind === 'milestone' ? 'tasks' : 'docs'}?kind=${hit.kind}&id=${id}`;
}
export function visibleNotifications(items: OverviewActivity[], preferences: ApplicationPreferences, readThrough: string, category = 'all', unreadOnly = false) {
  if (!preferences.notificationsEnabled) return [];
  return items.filter(item => preferences.notificationCategories.includes(item.category) && (category === 'all' || item.category === category) && (!unreadOnly || BigInt(item.sequence) > BigInt(readThrough)));
}
export function preferredModel(models: CodexModel[], preferences: ApplicationPreferences) {
  const model = models.find(item => item.id === preferences.defaultModelId);
  if (!model) return null;
  return { id: model.id, effort: preferences.defaultEffort && model.efforts.includes(preferences.defaultEffort) ? preferences.defaultEffort : model.defaultEffort };
}

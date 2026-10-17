import type { WorkItem, WorkKind } from '@nexus-ai/contracts';
export const workLabels: Record<WorkKind, string> = { task: 'Tasks', milestone: 'Roadmap', document: 'Documents', update: 'Updates', deliverable: 'Deliverables', feedback: 'Client feedback', comment: 'Comments' };
export const taskStatuses = ['todo', 'in_progress', 'review', 'done'] as const;
export function workHref(kind: WorkKind, id: string, view: 'auto' | 'client' = 'auto') { return `#/${kind === 'task' || kind === 'milestone' ? 'tasks' : 'docs'}?kind=${kind}&id=${encodeURIComponent(id)}${view === 'client' ? '&view=client' : ''}`; }
export function workTarget(hash: string) {
  const params = new URLSearchParams(hash.split('?')[1] ?? ''); const kind = params.get('kind'); const id = params.get('id');
  return { kind: kind && Object.hasOwn(workLabels, kind) ? kind as WorkKind : null, id: id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null, client: params.get('view') === 'client' };
}
export function mergeWork(current: WorkItem[], incoming: WorkItem[]) { const ids = new Set(current.map(item => item.id)); return [...current, ...incoming.filter(item => !ids.has(item.id))]; }
export function attachmentType(name: string, mime: string) {
  if (name !== name.trim() || [...name].some(value => value.charCodeAt(0) < 32 || value.charCodeAt(0) === 127) || /[<>:"|?*]/.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || /(^|[\\/])\.|[\\/]|(?:^|[._-])(?:credentials?|secrets?|tokens?|passwords?|lock)(?:[._-]|$)|auth\.json|id_rsa|\.(?:pem|key|p12|pfx)$/i.test(name)) throw new Error('Choose a non-secret project file with a simple file name.');
  if (/\.pdf$/i.test(name)) return 'application/pdf';
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  if (/\.(?:md|markdown)$/i.test(name)) return 'text/markdown';
  if (/\.(?:html?|svg|exe|msi|bat|cmd|ps1|sh|app|dmg|dll)$/i.test(name)) throw new Error('Active documents and executables are not accepted for publication.');
  if (/\.(?:txt|ts|tsx|js|jsx|json|css|xml|yml|yaml|sql|rs|py|go|java|c|cpp|h)$/i.test(name) || mime === 'text/plain') return 'text/plain';
  throw new Error('Supported files: plain text/source, Markdown, PDF, PNG and JPEG.');
}

import type { ShellRoute } from './shell/types.js';

export const routes: readonly { id: ShellRoute; label: string; description: string }[] = [
  { id: 'getting-started', label: 'Getting started', description: 'Guided setup from Nexus sign in to your first Codex conversation' },
  { id: 'overview', label: 'Overview', description: 'Project activity and current work' },
  { id: 'pulse', label: 'Client & Team Pulse', description: 'Milestones, outcomes and client updates' },
  { id: 'session', label: 'AI Session', description: 'Conversation, context and code workspace' },
  { id: 'projects', label: 'Projects', description: 'Your shared project spaces' },
  { id: 'team', label: 'Team', description: 'People and workspace membership' },
  { id: 'tasks', label: 'Tasks', description: 'Project work and milestones' },
  { id: 'repos', label: 'Repos', description: 'Repository connections' },
  { id: 'portal', label: 'Client Portal', description: 'Published updates and deliverables' },
  { id: 'settings', label: 'Settings', description: 'Application, connection and appearance' },
  { id: 'code', label: 'Code', description: 'Repository files and changes' },
  { id: 'deployments', label: 'Deployments', description: 'Project environments and builds' },
  { id: 'docs', label: 'Docs', description: 'Project documentation and knowledge' },
  { id: 'invitations', label: 'Invitation', description: 'Accept a workspace or project invitation' },
];

export function parseRoute(hash: string): ShellRoute {
  const candidate = hash.replace(/^#\/?/, '').split('?')[0];
  return routes.find((route) => route.id === candidate)?.id ?? 'overview';
}

export function navigate(route: ShellRoute): void {
  window.location.hash = `/${route}`;
}

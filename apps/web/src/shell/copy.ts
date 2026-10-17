/** Shell copy stays together so a later locale does not change component structure. */
export const shellCopy = {
  overview: 'Overview', pulse: 'Client & Team Pulse', session: 'AI Sessions', projects: 'Projects', team: 'Team', tasks: 'Tasks', repos: 'Repos', portal: 'Client Portal', settings: 'Settings', code: 'Code', deployments: 'Deployments', docs: 'Docs',
  project: 'Project workspace', noProject: 'No project selected', sessionTitle: 'AI Session', sessionDescription: 'A focused space for your conversations, context and code.',
  search: 'Search anything...', notifications: 'Notifications', notConnected: 'Not connected', syncDescription: 'Shared workspace sync',
  liveSessions: 'Live Sessions', workspace: 'Workspace', selectWorkspace: 'No workspace selected', workspaceUnavailable: 'Workspace selection requires a connected Nexus account.',
  tagline: ['BUILD TOGETHER', 'WITH AI'], payoff: ['Human creativity', 'AI capability', 'Real progress.'],
  motionOn: 'Reduce ambient motion', motionOff: 'Enable ambient motion', profile: 'Profile and settings',
  noSession: 'Connect a local Codex session to use this action.', share: 'Share', pause: 'Pause', approvals: 'Approvals', publish: 'Publish Update',
} as const;

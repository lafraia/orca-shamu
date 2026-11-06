import type { ProjectChannel, ProjectChannelMember } from './project-channels'

export function channelMember(id = 'coordinator'): ProjectChannelMember {
  return {
    id,
    name: id,
    handle: id,
    tabId: `tab-${id}`,
    worktreeId: 'folder:project',
    sessionId: `session-${id}`,
    agent: 'codex',
    target: { kind: 'local' },
    baseline: [],
    historyImported: false,
    importHistory: id === 'coordinator'
  }
}

export function channelFixture(): ProjectChannel {
  return {
    id: 'project',
    name: 'Project Alpha',
    mainMemberId: 'coordinator',
    members: [channelMember(), channelMember('researcher')],
    messages: [],
    draft: '',
    createdAt: 1
  }
}

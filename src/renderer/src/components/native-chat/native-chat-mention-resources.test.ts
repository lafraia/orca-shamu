import { describe, expect, it } from 'vitest'
import {
  createNativeChatMentionResourceSelector,
  nativeChatMentionResources
} from './native-chat-mention-resources'
import {
  nativeChatFanoutFixture,
  repoFixture,
  worktreeFixture
} from './native-chat-workspace-test-fixtures'
import { nativeChatResourceToken } from '../../../../shared/native-chat/native-chat-resource-reference'
import { selectedNativeChatBots } from './native-chat-bot-mentions'

const folder = {
  ...nativeChatFanoutFixture(0, 1, 0).folderWorkspaces[0],
  executionHostId: 'runtime:primary' as const,
  name: 'Launch folder'
}
const group = {
  id: 'group',
  name: 'Launch project',
  parentPath: '/Projects/Launch',
  executionHostId: 'runtime:primary' as const,
  parentGroupId: null,
  createdFrom: 'manual' as const,
  tabOrder: 0,
  isCollapsed: false,
  color: null,
  createdAt: 0,
  updatedAt: 0
}
const repo = repoFixture({ displayName: 'Launch repo', executionHostId: 'runtime:primary' })
const tree = worktreeFixture('tree', '/Projects/Launch/tree', {
  hostId: 'runtime:primary',
  displayName: 'Launch branch',
  linkedItems: [
    {
      provider: 'github',
      type: 'issue',
      number: 42,
      title: 'Launch issue',
      url: 'https://github.com/example/launch/issues/42'
    }
  ]
})
const state = {
  repos: [repo],
  projectGroups: [group],
  folderWorkspaces: [folder],
  worktreesByRepo: { repo: [tree] },
  workItemsCache: {}
}
describe('mention resource catalogue', () => {
  it('offers worktrees, folder workspaces, projects and linked issues with exact identities', () => {
    const rows = nativeChatMentionResources(state, 'launch', 'runtime:primary')
    expect(rows.filter((row) => row.kind === 'workspace').map((row) => row.id)).toEqual([
      'tree',
      'folder:workspace-0'
    ])
    expect(rows.filter((row) => row.kind === 'project').map((row) => row.id)).toEqual([
      'repo',
      'group'
    ])
    expect(rows.find((row) => row.kind === 'issue')).toMatchObject({
      url: 'https://github.com/example/launch/issues/42',
      label: '#42 Launch issue'
    })
    expect(nativeChatMentionResources(state, '#42', 'runtime:primary')).toHaveLength(1)
  })
  it('does not mix local, foreign-host or archived copies into the paired catalogue', () => {
    const mixed = {
      ...state,
      repos: [
        repo,
        repoFixture({ id: 'foreign', executionHostId: 'runtime:other' }),
        repoFixture({ id: 'local' })
      ],
      folderWorkspaces: [
        folder,
        { ...folder, id: 'archived', isArchived: true },
        { ...folder, id: 'foreign', executionHostId: 'runtime:other' as const }
      ],
      worktreesByRepo: {
        repo: [
          tree,
          { ...tree, id: 'archived', isArchived: true },
          { ...tree, id: 'foreign', hostId: 'runtime:other' as const }
        ]
      }
    }
    expect(
      nativeChatMentionResources(mixed, '', 'runtime:primary').map((row) => row.id)
    ).not.toContain('foreign')
    expect(
      nativeChatMentionResources(mixed, '', 'runtime:primary').map((row) => row.id)
    ).not.toContain('archived')
    expect(
      nativeChatMentionResources(mixed, '', 'runtime:primary').map((row) => row.id)
    ).not.toContain('local')
  })
  it('does no catalogue work while closed and preserves the result across unrelated updates', () => {
    const closed = createNativeChatMentionResourceSelector(null, 'runtime:primary')
    const select = createNativeChatMentionResourceSelector('', 'runtime:primary')
    expect(closed(state)).toEqual([])
    const first = select(state)
    expect(select({ ...state })).toBe(first)
    expect(select({ ...state, folderWorkspaces: [] })).not.toBe(first)
  })
  it('does not notify a bot when a workspace or project happens to have that bot name', () => {
    const reference = {
      kind: 'workspace' as const,
      id: 'folder:ceo',
      hostId: 'runtime:primary' as const,
      label: 'CEO',
      description: '/ceo',
      path: '/ceo'
    }
    const token = nativeChatResourceToken(reference)
    expect(
      selectedNativeChatBots(token, {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'nativeChatResourceReference', attrs: { reference, token } }]
          }
        ]
      })
    ).toEqual([])
  })
})

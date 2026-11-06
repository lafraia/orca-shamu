import { defineFixture } from '../../component-fixtures/component-fixture'
import type { ProjectChannel } from '../../../../shared/project-channels'
import { BotSidebarDrag } from './BotSidebarDrag'
import { BotSidebarRow } from './BotSidebarRow'
import { useBotUnread } from './bot-unread-store'

const bots: ProjectChannel[] = [
  {
    id: 'pinned-unread',
    name: 'CEO',
    pinned: true,
    identity: { color: 'teal', animated: false },
    mainMemberId: null,
    members: [],
    messages: [],
    draft: '',
    createdAt: 1
  },
  {
    id: 'regular-unread',
    name: 'Development assistant',
    identity: { color: 'pink', animated: false, shape: 'star' },
    mainMemberId: null,
    members: [],
    messages: [],
    draft: '',
    createdAt: 2
  },
  {
    id: 'already-read',
    name: 'Research and planning',
    identity: { color: 'blue', animated: false },
    mainMemberId: null,
    members: [],
    messages: [],
    draft: '',
    createdAt: 3
  }
]

export const unreadAvatars = defineFixture({
  width: 360,
  setup: () => {
    useBotUnread.setState({ counts: { 'pinned-unread': 2, 'regular-unread': 1 }, pending: [] })
  },
  render: () => renderRows('pinned-unread')
})

export const selectedBot = defineFixture({
  ...unreadAvatars,
  render: () => renderRows('regular-unread')
})

export const narrow = defineFixture({
  ...selectedBot,
  width: 240
})

function renderRows(selectedId: string): React.JSX.Element {
  return (
    <div className="bg-worktree-sidebar p-2">
      <BotSidebarDrag>
        {bots.map((channel) => (
          <BotSidebarRow
            key={channel.id}
            channel={channel}
            sections={[]}
            selected={channel.id === selectedId}
            onSection={() => {}}
          />
        ))}
      </BotSidebarDrag>
    </div>
  )
}

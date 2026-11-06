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
    name: 'Dev: Vagalume',
    identity: { color: 'pink', animated: false, shape: 'star' },
    mainMemberId: null,
    members: [],
    messages: [],
    draft: '',
    createdAt: 2
  },
  {
    id: 'already-read',
    name: 'Orlando em Detalhes',
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
  render: () => (
    <div className="bg-worktree-sidebar p-2">
      <BotSidebarDrag>
        {bots.map((channel) => (
          <BotSidebarRow
            key={channel.id}
            channel={channel}
            sections={[]}
            selected={channel.pinned === true}
            onSection={() => {}}
          />
        ))}
      </BotSidebarDrag>
    </div>
  )
})

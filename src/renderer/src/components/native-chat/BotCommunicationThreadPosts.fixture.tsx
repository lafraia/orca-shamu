import { defineFixture } from '../../component-fixtures/component-fixture'
import type { ProjectChannel } from '../../../../shared/project-channels'
import { useProjectChannels } from '../project-channels/project-channel-store'
import { useShamuClient } from '../shamu/shamu-client-state'
import {
  CommunicationPair,
  CommunicationPost,
  CommunicationSkeleton,
  type CommunicationPostData
} from './BotCommunicationThreadPosts'

const ceo = { botId: 'ceo', name: 'CEO', sessionId: 'ceo-session' }
const specialist = {
  botId: 'specialist',
  name: 'Release specialist',
  sessionId: 'specialist-session'
}
const bots: ProjectChannel[] = [ceo, specialist].map((bot, index) => ({
  id: bot.botId,
  name: bot.name,
  identity: { color: index === 0 ? 'teal' : 'pink', animated: false },
  mainMemberId: null,
  members: [],
  messages: [],
  draft: '',
  createdAt: 1
}))
const posts: CommunicationPostData[] = [
  {
    id: 'question',
    entryId: 'consultation',
    author: ceo,
    at: 1793938320000,
    request: true,
    blocks: [
      {
        type: 'text',
        text: '@Release specialist, can you confirm the status of `example/app#33` and what remains before launch?'
      }
    ]
  },
  {
    id: 'answer',
    entryId: 'consultation',
    author: specialist,
    at: 1793938380000,
    request: false,
    blocks: [
      {
        type: 'text',
        text: 'I do not have a confirmed date yet.\n\nStore review is the main dependency. My estimate depends on approval, so I will include that condition with the timeline.'
      }
    ]
  },
  {
    id: 'followup',
    entryId: 'followup',
    author: ceo,
    at: 1793938440000,
    request: true,
    blocks: [
      {
        type: 'text',
        text: 'Understood. I will separate the estimate from the confirmed date and report that dependency.'
      }
    ]
  }
]

function Thread({ loading = false }: { loading?: boolean }): React.JSX.Element {
  return (
    <div className="native-chat-appearance bg-chat-canvas text-chat-foreground">
      <div className="border-b border-border p-4 text-center">
        <CommunicationPair
          source={{ participant: ceo, onOpen: () => {} }}
          recipient={{ participant: specialist, onOpen: () => {} }}
        />
      </div>
      <div className="space-y-8 p-5">
        {loading ? (
          <CommunicationSkeleton />
        ) : (
          posts.map((post) => <CommunicationPost key={post.id} post={post} />)
        )}
      </div>
    </div>
  )
}
const setup = () => {
  useShamuClient.setState({ enabled: true, environmentId: 'fixture' })
  useProjectChannels.setState({
    snapshot: { version: 1, revision: 0, channels: bots },
    loaded: true
  })
}
export const exchange = defineFixture({ width: 560, setup, render: () => <Thread /> })
export const narrow = defineFixture({ width: 360, setup, render: () => <Thread /> })
export const loading = defineFixture({ width: 360, setup, render: () => <Thread loading /> })

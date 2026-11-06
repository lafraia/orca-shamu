import { defineFixture } from '../../component-fixtures/component-fixture'
import type { ProjectChannel } from '../../../../shared/project-channels'
import { useProjectChannels } from '../project-channels/project-channel-store'
import {
  CommunicationPair,
  CommunicationPost,
  CommunicationSkeleton,
  type CommunicationPostData
} from './BotCommunicationThreadPosts'

const ceo = { botId: 'ceo', name: 'CEO', sessionId: 'ceo-session' }
const specialist = {
  botId: 'specialist',
  name: 'Orlando em Detalhes',
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
        text: 'Preciso passar uma previsão confiável para o Daniel. O que você consegue confirmar sobre o lançamento e o que ainda está pendente?'
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
        text: 'Ainda não tenho uma data confirmada.\n\nA revisão da loja é a dependência principal. Minha estimativa depende da aprovação, então prefiro informar essa condição junto do prazo.'
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
        text: 'Entendi. Vou separar a estimativa da confirmação e levar essa dependência para ele.'
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
const setup = () =>
  useProjectChannels.setState({
    snapshot: { version: 1, revision: 0, channels: bots },
    loaded: true
  })
export const exchange = defineFixture({ width: 560, setup, render: () => <Thread /> })
export const narrow = defineFixture({ width: 360, setup, render: () => <Thread /> })
export const loading = defineFixture({ width: 360, setup, render: () => <Thread loading /> })

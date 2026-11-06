import { defineFixture } from '../../component-fixtures/component-fixture'
import type { BotCommunication } from '../../../../shared/bot-communications'
import { NativeChatMarkdown } from './NativeChatMarkdown'
import { BotCommunicationSummaryLine, BotCommunicationSummaryPeer } from './BotCommunicationSummary'

const entry: BotCommunication = {
  id: 'consultation:dev',
  referenceId: 'consultation',
  environmentId: 'primary',
  createdAt: 1,
  source: { botId: 'ceo', name: 'CEO', sessionId: 'ceo-session' },
  recipient: { botId: 'dev', name: 'Dev: Vagalume', sessionId: 'dev-session', operationId: 'send' },
  actor: 'bot',
  state: 'recorded'
}
const specialist: BotCommunication = {
  ...entry,
  id: 'consultation:specialist',
  recipient: {
    ...entry.recipient,
    botId: 'specialist',
    name: 'Orlando em Detalhes',
    sessionId: 'specialist-session'
  }
}

function Conversation({ pending = false }: { pending?: boolean }): React.JSX.Element {
  return (
    <div className="native-chat-appearance bg-chat-pane p-5 text-sm text-chat-foreground">
      <NativeChatMarkdown
        content={
          pending
            ? 'Estou conferindo a previsão com os dois bots. Trago a resposta quando terminarem.'
            : 'O Dev: Vagalume confirmou que aguarda a primeira tarefa. Orlando ainda está conferindo a previsão do aplicativo.'
        }
        variant="document"
      />
      <BotCommunicationSummaryLine>
        <BotCommunicationSummaryPeer
          row={{ entry, direction: 'outgoing', state: pending ? 'working' : 'replied' }}
          identity={{ color: 'teal', animated: false }}
          onOpen={() => {}}
        />
        <BotCommunicationSummaryPeer
          row={{ entry: specialist, direction: 'outgoing', state: pending ? 'queued' : 'working' }}
          identity={{ color: 'pink', animated: false, shape: 'star' }}
          onOpen={() => {}}
        />
      </BotCommunicationSummaryLine>
    </div>
  )
}

export const repliedAndWaiting = defineFixture({ width: 740, render: () => <Conversation /> })
export const narrow = defineFixture({ width: 360, render: () => <Conversation pending /> })
export const needsInput = defineFixture({
  width: 360,
  render: () => (
    <div className="native-chat-appearance bg-chat-pane p-5">
      <BotCommunicationSummaryLine>
        <BotCommunicationSummaryPeer
          row={{ entry: specialist, direction: 'outgoing', state: 'waiting' }}
          identity={{ color: 'pink', animated: false }}
          onOpen={() => {}}
        />
      </BotCommunicationSummaryLine>
    </div>
  )
})

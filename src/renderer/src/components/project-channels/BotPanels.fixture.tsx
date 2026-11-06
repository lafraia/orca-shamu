import { useContext, useState } from 'react'
import { Button } from '@/components/ui/button'
import { defineFixture } from '../../component-fixtures/component-fixture'
import type { BotCommunication } from '../../../../shared/bot-communications'
import type { ProjectChannel } from '../../../../shared/project-channels'
import type { ShamuVaultApi, VaultSnapshot } from '../../../../shared/shamu-vault'
import { useShamuClient } from '../shamu/shamu-client-state'
import { BotCommunicationProvider } from './BotCommunicationProvider'
import { BotCommunicationContext } from './bot-communication-context'
import { BotMemoryPanel } from './BotMemoryPanel'
import { BotRoutinesPanel } from './BotRoutinesPanel'
import { VaultPanel } from './vault/VaultPanel'
import { useProjectChannels } from './project-channel-store'
import { BotCommunicationRow } from '../native-chat/BotCommunicationRow'

const channel: ProjectChannel = {
  id: 'coordinator',
  name: 'Coordinator',
  mainMemberId: null,
  members: [],
  messages: [],
  draft: '',
  createdAt: 1
}
const entry: BotCommunication = {
  id: 'consultation',
  referenceId: 'consultation',
  environmentId: 'fixture',
  source: { botId: channel.id, name: channel.name, sessionId: 'coordinator-session' },
  recipient: {
    botId: 'specialist',
    name: 'Release specialist',
    sessionId: 'specialist-session',
    operationId: 'consultation'
  },
  actor: 'bot',
  state: 'recorded',
  createdAt: 1,
  native: {
    itemId: 'question',
    blocks: [{ type: 'text', text: '@Release specialist, what is the status of `example/app#33`?' }]
  }
}

const history: BotCommunication[] = Array.from({ length: 36 }, (_, index) => ({
  ...entry,
  id: `exchange-${index}`,
  referenceId: `exchange-${index}`,
  createdAt: 1_800_000_000_000 + index * 60_000,
  native: {
    itemId: `message-${index}`,
    blocks: [
      {
        type: 'text',
        text: `**Consultation ${index}.**\n\n${'The release review is complete. Tests passed and the next step is ready.\n\n'.repeat(4)}`
      }
    ]
  }
}))
const storedEntry: BotCommunication = {
  ...entry,
  id: 'stored-message',
  referenceId: 'stored-message',
  native: undefined,
  createdAt: 1_800_000_000_000
}

const vaultSnapshot: VaultSnapshot = {
  state: 'unlocked',
  session: 'fixture-session',
  revision: 1,
  automaticUnlock: true,
  requests: [],
  entries: [
    {
      id: '047562c7-e5ea-40a7-bff6-91e67bd9510b',
      sealId: 'cfde9ffa-2d3c-4521-9fad-83562b768aa7',
      botId: channel.id,
      name: 'Example credential',
      username: 'example@example.invalid',
      website: 'https://example.invalid',
      allowAgent: false,
      environmentVariable: 'EXAMPLE_TOKEN',
      updatedAt: 1
    }
  ]
}
const readVault = async (): Promise<VaultSnapshot> => vaultSnapshot
const vault: ShamuVaultApi = {
  status: readVault,
  create: readVault,
  unlock: readVault,
  resume: readVault,
  lock: async () => {},
  save: readVault,
  remove: readVault,
  copy: async () => {},
  changePassphrase: async () => {},
  decide: async () => {},
  onChanged: () => () => {}
}

function Controls(): React.JSX.Element {
  const communication = useContext(BotCommunicationContext)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [routinesOpen, setRoutinesOpen] = useState(false)
  const [vaultOpen, setVaultOpen] = useState(false)
  return (
    <div className="flex gap-3 bg-background p-6 text-foreground">
      <Button onClick={() => communication?.open(entry)}>Open communication</Button>
      <Button onClick={() => setMemoryOpen(true)}>Open Memory</Button>
      <Button onClick={() => setRoutinesOpen(true)}>Open Routines</Button>
      <Button onClick={() => setVaultOpen(true)}>Open Vault</Button>
      <BotMemoryPanel channel={channel} open={memoryOpen} onOpenChange={setMemoryOpen} />
      <BotRoutinesPanel
        botId={channel.id}
        name={channel.name}
        open={routinesOpen}
        onOpenChange={setRoutinesOpen}
      />
      <VaultPanel
        botId={channel.id}
        name={channel.name}
        open={vaultOpen}
        onOpenChange={setVaultOpen}
        api={vault}
      />
    </div>
  )
}

export const drawers = defineFixture({
  width: 1100,
  setup: () => {
    useShamuClient.setState({ enabled: true, environmentId: 'fixture' })
    const snapshot = {
      version: 1 as const,
      revision: 0,
      channels: [channel, { ...channel, id: 'specialist', name: 'Release specialist' }]
    }
    useProjectChannels.setState({ snapshot, loaded: true })
    window.api.projectChannels = {
      projectCatalog: async () => ({ entries: [] }),
      read: async () => snapshot,
      write: async (value) => value,
      ensureConversation: async () => snapshot,
      readUnread: async () => ({ counts: {}, pending: [] }),
      markRead: async () => ({ counts: {}, pending: [] }),
      onUnreadChanged: () => () => {},
      onChanged: () => () => {},
      readMemory: async () => ({ memory: { version: 1, entries: [] }, fingerprint: 'fixture' }),
      writeMemory: async (_id, memory) => ({ memory, fingerprint: 'fixture' }),
      prepareMessage: async (_session, _environment, text) => text,
      notifyBots: async () => [],
      command: async () => ({
        version: 1,
        revision: 0,
        routines: [],
        runs: [],
        scheduler: 'running'
      }),
      communications: {
        read: async () => ({ entries: [entry, ...history, storedEntry], incomplete: false }),
        texts: async () => [
          {
            referenceId: storedEntry.referenceId,
            text: `Release review notes.\n\n${'A detailed note stays inside the message preview rather than filling the main conversation.\n\n'.repeat(24)}`
          }
        ],
        onChanged: () => () => {}
      }
    }
    window.api.runtimeEnvironments.call = async () => {
      throw new Error('No session history is attached to this component fixture.')
    }
  },
  render: () => (
    <BotCommunicationProvider
      sessionId={entry.source.sessionId}
      target={{ kind: 'environment', environmentId: 'fixture' }}
      isVisible
    >
      <Controls />
    </BotCommunicationProvider>
  )
})

export const communicationCards = defineFixture({
  ...drawers,
  width: 720,
  render: () => (
    <BotCommunicationProvider
      sessionId={entry.recipient.sessionId}
      target={{ kind: 'environment', environmentId: 'fixture' }}
      isVisible
    >
      <div className="native-chat-appearance space-y-4 bg-chat-canvas p-5 text-sm text-chat-foreground">
        <p>The coordinator is collecting the release updates.</p>
        <BotCommunicationRow
          row={{ entry: history[18], direction: 'incoming', state: 'replied' }}
        />
        <p>Your conversation continues here, independently of the bot exchange.</p>
        <BotCommunicationRow
          row={{ entry: history[30], direction: 'outgoing', state: 'working' }}
        />
        <BotCommunicationRow row={{ entry: storedEntry, direction: 'incoming', state: 'sent' }} />
      </div>
    </BotCommunicationProvider>
  )
})
export const narrowCommunication = defineFixture({ ...communicationCards, width: 360 })
export const expandedCommunication = defineFixture({
  ...communicationCards,
  interact: (frame) => {
    const triggers = frame.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"]')
    triggers[0]?.click()
    triggers[2]?.click()
  }
})

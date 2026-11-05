import type { NativeChatImageRefBlock } from './native-chat/native-chat-types'

export type BotCommunicationParticipant = {
  botId?: string
  sessionId: string
  name: string
}

export type BotCommunication = {
  id: string
  referenceId: string
  environmentId: string
  createdAt: number
  source: BotCommunicationParticipant & { itemId?: string }
  recipient: BotCommunicationParticipant & { botId: string; operationId: string }
  actor: 'user' | 'bot' | 'unknown'
  state: 'ready' | 'issued' | 'recorded' | 'refused' | 'unconfirmed'
}

export type BotCommunicationSnapshot = {
  entries: BotCommunication[]
  incomplete: boolean
}

export type BotCommunicationsApi = {
  read: (sessionId: string) => Promise<BotCommunicationSnapshot>
  texts: (referenceIds: string[]) => Promise<BotCommunicationText[]>
  onChanged: (listener: () => void) => () => void
}

export type BotCommunicationText = {
  referenceId: string
  text: string
  attachments?: NativeChatImageRefBlock[]
}

export const botCommunicationPairKey = (entry: BotCommunication): string =>
  JSON.stringify([
    entry.environmentId,
    ...[entry.source.sessionId, entry.recipient.sessionId].toSorted()
  ])

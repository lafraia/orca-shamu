import { createContext } from 'react'
import type {
  BotCommunication,
  BotCommunicationSnapshot
} from '../../../../shared/bot-communications'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'

export type BotCommunicationContextValue = BotCommunicationSnapshot & {
  sessionId: string
  target: RuntimeClientTarget
  loaded: boolean
  error: string | null
  selectedPair: string | null
  open: (entry: BotCommunication) => void
  close: () => void
  retry: () => void
}
export const BotCommunicationContext = createContext<BotCommunicationContextValue | null>(null)

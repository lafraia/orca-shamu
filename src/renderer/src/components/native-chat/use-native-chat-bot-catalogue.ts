import { useShamuClient } from '../shamu/shamu-client-state'
import { useProjectChannels } from '../project-channels/project-channel-store'
import { EMPTY_BOT_CATALOGUE, nativeChatBotCatalogue } from './native-chat-bot-catalogue'

export function useNativeChatBotCatalogue(active = true) {
  const connected = useShamuClient((state) => state.enabled && state.environmentId !== null)
  return useProjectChannels((state) =>
    connected && active ? nativeChatBotCatalogue(state.snapshot.channels) : EMPTY_BOT_CATALOGUE
  )
}

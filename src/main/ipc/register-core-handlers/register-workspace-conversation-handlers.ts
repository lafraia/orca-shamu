import type { Store } from '../../persistence/loading-store/store'
import { registerNativeChatHandlers } from '../native-chat'
import { registerProjectChannelsHandlers } from '../project-channels'

export function registerWorkspaceConversationHandlers(store: Store): void {
  registerNativeChatHandlers()
  registerProjectChannelsHandlers(store)
}

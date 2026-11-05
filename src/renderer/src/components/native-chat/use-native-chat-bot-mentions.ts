import { useEffect, useMemo } from 'react'
import { loadProjectChannels, useProjectChannels } from '../project-channels/project-channel-store'
import { useShamuClient } from '../shamu/shamu-client-state'
import type { BotMention } from '../../../../shared/bot-mentions'
import type { NativeChatResourceReference } from '../../../../shared/native-chat/native-chat-resource-reference'
import { toRuntimeExecutionHostId } from '../../../../shared/execution-host'
import { useAppStore } from '@/store'
import { createNativeChatMentionResourceSelector } from './native-chat-mention-resources'
import { useNativeChatMentionIssues } from './use-native-chat-mention-issues'
import {
  useNativeChatMentionFiles,
  type NativeChatMentionFiles
} from './use-native-chat-mention-files'

export type NativeChatMentionOptions = NativeChatMentionFiles & {
  bots?: readonly BotMention[]
  resources?: readonly NativeChatResourceReference[]
  issueSearch?: { loading: boolean; failed: boolean; searchEnabled: boolean; retry: () => void }
}
const NO_BOTS: readonly BotMention[] = []

function useNativeChatBotMentions(query: string | null, sessionId?: string): readonly BotMention[] {
  const enabled = useShamuClient((state) => state.enabled && state.environmentId !== null)
  const channels = useProjectChannels((state) => state.snapshot.channels)
  useEffect(() => {
    if (enabled && query !== null && sessionId) {
      void loadProjectChannels()
    }
  }, [enabled, query, sessionId])
  return useMemo(() => {
    if (!enabled || query === null || !sessionId) {
      return NO_BOTS
    }
    const needle = query.normalize('NFKD').toLocaleLowerCase()
    return channels
      .filter(
        (bot) =>
          (bot.home || (bot.members.length === 0 && bot.messages.length === 0)) &&
          !bot.members.some(
            (member) => member.id === bot.home?.memberId && member.sessionId === sessionId
          ) &&
          bot.name.normalize('NFKD').toLocaleLowerCase().includes(needle)
      )
      .slice(0, 20)
      .map(({ id, name, identity }) => ({ id, name, identity }))
  }, [channels, enabled, query, sessionId])
}

export function useNativeChatMentions(
  args: Parameters<typeof useNativeChatMentionFiles>[0] & { botSessionId?: string }
): NativeChatMentionOptions {
  const files = useNativeChatMentionFiles(args)
  const bots = useNativeChatBotMentions(args.query, args.botSessionId)
  const environmentId = useShamuClient((state) => (state.enabled ? state.environmentId : null))
  const hostId = environmentId ? toRuntimeExecutionHostId(environmentId) : null
  const select = useMemo(
    () => createNativeChatMentionResourceSelector(args.query, hostId),
    [args.query, hostId]
  )
  const local = useAppStore(select)
  const issues = useNativeChatMentionIssues(args.query, hostId)
  return useMemo(
    () => ({
      ...files,
      bots,
      ...(hostId
        ? {
            resources: [
              ...new Map(
                [...local, ...issues.resources].map((row) => [
                  `${row.kind}:${row.projectKind ?? ''}:${row.id}`,
                  row
                ])
              ).values()
            ],
            issueSearch: issues
          }
        : {})
    }),
    [files, bots, local, issues, hostId]
  )
}

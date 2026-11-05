import { useCallback, type RefObject } from 'react'
import type { BotMention } from '../../../../shared/bot-mentions'
import { applyMentionSuggestion } from '../../../../shared/native-chat/input/native-chat-composer-autocomplete'
import type { NativeChatComposerInput } from './native-chat-composer-input'
import { completeNativeChatBotMention } from './native-chat-bot-mentions'
import {
  completeNativeChatResourceMention,
  type NativeChatMentionTarget
} from './native-chat-mention-choices'

export function useNativeChatMentionCompletion({
  mode,
  disabledRef,
  isComposing,
  textareaRef,
  commitCompletion,
  liveDraft,
  setActiveSuggestion,
  clearDismissal
}: {
  mode: 'none' | 'slash' | 'mention'
  disabledRef: RefObject<boolean>
  isComposing: () => boolean
  textareaRef: RefObject<NativeChatComposerInput | null>
  commitCompletion: (result: { draft: string; caret: number }) => void
  liveDraft: () => [string, number]
  setActiveSuggestion: (index: number) => void
  clearDismissal: () => void
}) {
  const completeMention = useCallback(
    (target: NativeChatMentionTarget) => {
      if (disabledRef.current || mode !== 'mention' || isComposing()) {
        return
      }
      if (typeof target === 'string') {
        commitCompletion(applyMentionSuggestion(...liveDraft(), target))
      } else if (completeNativeChatResourceMention(textareaRef.current, target)) {
        setActiveSuggestion(-1)
        clearDismissal()
      }
    },
    [
      mode,
      disabledRef,
      isComposing,
      textareaRef,
      commitCompletion,
      liveDraft,
      setActiveSuggestion,
      clearDismissal
    ]
  )
  const completeBotMention = useCallback(
    (bot: BotMention) => {
      if (
        !disabledRef.current &&
        mode === 'mention' &&
        !isComposing() &&
        completeNativeChatBotMention(textareaRef.current, bot)
      ) {
        setActiveSuggestion(-1)
        clearDismissal()
      }
    },
    [mode, disabledRef, isComposing, textareaRef, setActiveSuggestion, clearDismissal]
  )
  return { completeMention, completeBotMention }
}

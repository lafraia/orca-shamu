import type { NativeChatMentionOptions } from './use-native-chat-bot-mentions'
import type { NativeChatResourceReference } from '../../../../shared/native-chat/native-chat-resource-reference'
import type { BotMention } from '../../../../shared/bot-mentions'
import type { NativeChatComposerInput } from './native-chat-composer-input'
import type { ComposerAutocomplete } from '../../../../shared/native-chat/input/native-chat-composer-autocomplete'
import { useShamuClient } from '../shamu/shamu-client-state'

export type NativeChatMentionTarget = string | NativeChatResourceReference
export type NativeChatMentionChoice =
  | { id: string; kind: 'bot'; bot: BotMention }
  | { id: string; kind: 'resource'; reference: NativeChatResourceReference }
  | { id: string; kind: 'file'; path: string }
export function nativeChatMentionChoices(
  mention: NativeChatMentionOptions
): NativeChatMentionChoice[] {
  return [
    ...(mention.bots ?? []).map((bot) => ({ id: `bot:${bot.id}`, kind: 'bot' as const, bot })),
    ...(['workspace', 'project', 'issue'] as const).flatMap((kind) =>
      (mention.resources ?? [])
        .filter((reference) => reference.kind === kind)
        .map((reference) => ({
          id: `${reference.kind}:${reference.projectKind ?? ''}:${reference.hostId}:${reference.id}`,
          kind: 'resource' as const,
          reference
        }))
    ),
    ...mention.files.map((path) => ({ id: `file:${path}`, kind: 'file' as const, path }))
  ]
}
export const nativeChatSuggestionResetIndex = (text: string, caret: number): number =>
  useShamuClient.getState().enabled && /(?:^|\s)@$/.test(text.slice(0, caret)) ? -1 : 0

export function completeNativeChatResourceMention(
  input: NativeChatComposerInput | null,
  reference: NativeChatResourceReference
): boolean {
  if (!input?.insertResourceReference || input.disabled) {
    return false
  }
  const at = input.selectionStart ?? input.value.length
  const match = input.value.slice(0, at).match(/(?:^|\s)@(\S*)$/)
  if (!match) {
    return false
  }
  input.insertResourceReference(at - match[1].length - 1, at, reference)
  input.focus()
  return true
}
export function nativeChatAutocompleteOptionId(
  autocomplete: ComposerAutocomplete,
  mention: NativeChatMentionOptions,
  active: number,
  listboxId: string
): string | undefined {
  const count =
    autocomplete.mode === 'slash'
      ? autocomplete.items.length
      : autocomplete.mode === 'mention'
        ? nativeChatMentionChoices(mention).length
        : 0
  return count > 0 && (autocomplete.mode === 'slash' || active >= 0)
    ? `${listboxId}-option-${Math.min(Math.max(0, active), count - 1)}`
    : undefined
}
export function nativeChatAutocompleteAria(
  autocomplete: ComposerAutocomplete,
  mention: NativeChatMentionOptions,
  active: number,
  listboxId: string
) {
  return {
    'aria-expanded': autocomplete.mode !== 'none',
    'aria-controls': autocomplete.mode !== 'none' ? listboxId : undefined,
    'aria-activedescendant': nativeChatAutocompleteOptionId(
      autocomplete,
      mention,
      active,
      listboxId
    )
  }
}

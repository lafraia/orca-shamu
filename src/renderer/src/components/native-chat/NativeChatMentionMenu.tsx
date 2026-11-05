import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { FilenameFirstPath } from '@/components/file-path-cursor-tooltip'
import { FileTypeIcon } from '@/components/FileTypeIcon'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { BotMention } from '../../../../shared/bot-mentions'
import type { NativeChatMentionOptions } from './use-native-chat-bot-mentions'
import { BotAvatar } from '../project-channels/BotAvatar'
import { NativeChatPickerListbox } from './NativeChatPickerListbox'
import { PickerOptionButton, PickerStatus } from './NativeChatPickerOption'
import {
  nativeChatMentionChoices,
  type NativeChatMentionChoice,
  type NativeChatMentionTarget
} from './native-chat-mention-choices'
import { NATIVE_CHAT_RESOURCE_ICONS } from './native-chat-resource-reference'

export const NativeChatMentionMenu = memo(function NativeChatMentionMenu({
  mention,
  activeIndex,
  listboxId,
  onChoose,
  onChooseBot,
  onActiveIndexChange
}: {
  mention: NativeChatMentionOptions
  activeIndex: number
  listboxId: string
  onChoose: (target: NativeChatMentionTarget) => void
  onChooseBot?: (bot: BotMention) => void
  onActiveIndexChange?: (index: number) => void
}): React.JSX.Element {
  useUiLanguageRevision()
  const choices = useMemo(() => nativeChatMentionChoices(mention), [mention])
  const signature = choices.map((row) => row.id).join('\0')
  const previous = useRef({ signature, ids: choices.map((row) => row.id) })
  const activeItemRef = useRef<HTMLButtonElement | null>(null)
  const selectedIndex =
    activeIndex < 0
      ? -1
      : previous.current.signature === signature
        ? Math.min(activeIndex, choices.length - 1)
        : choices.findIndex((row) => row.id === previous.current.ids[activeIndex])
  useLayoutEffect(() => {
    previous.current = { signature, ids: choices.map((row) => row.id) }
    if (selectedIndex !== activeIndex) {
      onActiveIndexChange?.(selectedIndex)
    }
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [signature, choices, selectedIndex, activeIndex, onActiveIndexChange])
  const groups = [
    { kind: 'bot', label: translate('shamu.mentions.bots', 'Bots') },
    { kind: 'workspace', label: translate('shamu.mentions.workspaces', 'Workspaces') },
    { kind: 'project', label: translate('shamu.mentions.projects', 'Projects') },
    { kind: 'issue', label: translate('shamu.mentions.issues', 'Issues') },
    { kind: 'file', label: translate('shamu.mentions.files', 'Files') }
  ]
  const fileStatus = mention.loading
    ? translate('components.native-chat.composer.loadingFiles', 'Loading files...')
    : mention.failed
      ? translate('components.native-chat.composer.filesLoadFailed', "Couldn't load files")
      : choices.length === 0 && !mention.issueSearch?.loading
        ? translate('components.native-chat.composer.noFiles', 'No matching files')
        : null
  return (
    <NativeChatPickerListbox id={listboxId}>
      {groups.map((group) => {
        const rows = choices.flatMap((row, index) =>
          (row.kind === 'resource' ? row.reference.kind : row.kind) === group.kind
            ? [{ row, index }]
            : []
        )
        const issueStatus = group.kind === 'issue' ? mention.issueSearch : undefined
        const status = group.kind === 'file' ? fileStatus : null
        if (!rows.length && !status && !issueStatus) {
          return null
        }
        return (
          <div key={group.kind} role="group" aria-label={group.label}>
            {choices.some((row) => row.kind !== 'file') || mention.issueSearch ? (
              <PickerStatus>{group.label}</PickerStatus>
            ) : null}
            {rows.map(({ row, index }) => (
              <PickerOptionButton
                key={row.id}
                id={`${listboxId}-option-${index}`}
                selected={index === selectedIndex}
                activeItemRef={activeItemRef}
                onActivate={() => onActiveIndexChange?.(index)}
                onChoose={() =>
                  row.kind === 'bot'
                    ? onChooseBot?.(row.bot)
                    : onChoose(row.kind === 'file' ? row.path : row.reference)
                }
              >
                <MentionChoiceContent choice={row} />
              </PickerOptionButton>
            ))}
            {status ? (
              <PickerStatus>
                {mention.loading ? <LoadingSpinner className="size-3.5" /> : null}
                {status}
              </PickerStatus>
            ) : null}
            {issueStatus?.loading ? (
              <PickerStatus>
                <LoadingSpinner className="size-3.5" />
                {translate('shamu.mentions.loadingIssues', 'Searching issues...')}
              </PickerStatus>
            ) : null}
            {issueStatus?.failed ? (
              <PickerStatus>
                <span className="min-w-0 flex-1">
                  {translate(
                    'shamu.mentions.issuesFailed',
                    'Some issue sources could not be loaded.'
                  )}
                </span>
                <button
                  type="button"
                  className="rounded-sm px-1.5 py-0.5 text-foreground hover:bg-accent"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={issueStatus.retry}
                >
                  {translate('shamu.communication.retry', 'Retry')}
                </button>
              </PickerStatus>
            ) : null}
            {issueStatus && !issueStatus.searchEnabled && !rows.length ? (
              <PickerStatus>
                {translate(
                  'shamu.mentions.issueHint',
                  'Type at least two characters to search issues.'
                )}
              </PickerStatus>
            ) : null}
            {issueStatus?.searchEnabled &&
            !issueStatus.loading &&
            !issueStatus.failed &&
            !rows.length ? (
              <PickerStatus>
                {translate('shamu.mentions.noIssues', 'No matching issues')}
              </PickerStatus>
            ) : null}
          </div>
        )
      })}
      <div aria-live="polite" className="sr-only">
        {fileStatus ?? ''}
      </div>
    </NativeChatPickerListbox>
  )
})
function MentionChoiceContent({ choice }: { choice: NativeChatMentionChoice }): React.JSX.Element {
  if (choice.kind === 'file') {
    return (
      <>
        <FileTypeIcon
          filePath={choice.path}
          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
        />
        <FilenameFirstPath path={choice.path} />
      </>
    )
  }
  if (choice.kind === 'bot') {
    return (
      <>
        <BotAvatar
          id={choice.bot.id}
          identity={choice.bot.identity}
          className="size-7 rounded-lg"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{choice.bot.name}</span>
          <span className="block text-xs text-muted-foreground">
            {translate('shamu.mentions.ownChat', 'Replies in its own chat')}
          </span>
        </span>
      </>
    )
  }
  const Icon = NATIVE_CHAT_RESOURCE_ICONS[choice.reference.kind]
  return (
    <>
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{choice.reference.label}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {choice.reference.description}
        </span>
      </span>
    </>
  )
}

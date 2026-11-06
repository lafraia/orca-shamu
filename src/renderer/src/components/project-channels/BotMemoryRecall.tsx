import { useContext } from 'react'
import { Pin } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { BotReferenceText } from './BotReferenceText'
import { useNativeChatBotCatalogue } from '../native-chat/use-native-chat-bot-catalogue'
import { BotCommunicationContext } from './bot-communication-context'
import { NativeChatToolRunIcon } from '../native-chat/NativeChatToolIcon'
import { NativeChatReasoningChevron } from '../native-chat/NativeChatReasoningDisclosure'
import { useNativeChatDisclosure } from '../native-chat/native-chat-disclosure-store'
import { getIntlLocale, translate } from '@/i18n/i18n'
import type { BotTurnContext } from '../../../../shared/bot-turn-context'

export function BotMemoryRecall({
  context,
  messageId
}: {
  context: BotTurnContext
  messageId: string
}): React.JSX.Element | null {
  const catalogue = useNativeChatBotCatalogue()
  const communication = useContext(BotCommunicationContext)
  const disclosure = useNativeChatDisclosure(`bot-memory:${messageId}`, false)
  if (!context.entries.length && !context.omitted) {
    return null
  }
  const matches = new Map(context.selection?.matches.map(({ id, terms }) => [id, terms]))
  const total = context.entries.length + context.omitted
  return (
    <div className="min-w-0 font-sans text-sm text-chat-foreground-faint">
      <Collapsible open={disclosure.open} onOpenChange={disclosure.setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group/reasoning flex min-h-6 w-full min-w-0 items-center gap-1.5 rounded-md py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <NativeChatToolRunIcon iconName="brain" className="text-chat-foreground-faint" />
            <span className="min-w-0 truncate text-sm leading-relaxed text-chat-foreground-faint transition-colors group-hover/reasoning:text-chat-foreground">
              {translate('shamu.memory.read', 'Bot memory read')}
            </span>
            <NativeChatReasoningChevron />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent animation="height" data-native-chat-member-detail>
          <div className="pl-5.5">
            <div className="mt-2 space-y-2 text-xs text-chat-foreground-faint">
              <p>
                {translate(
                  'shamu.memory.includedCount',
                  '{{included}} of {{total}} active notes included with this message.',
                  {
                    included: context.entries.length,
                    total
                  }
                )}
              </p>
              {context.selection ? (
                <>
                  <p>
                    {translate(
                      'shamu.memory.selectionMethod',
                      'Selected by matching terms, pinned notes, task state and summaries.'
                    )}
                  </p>
                  {context.omitted ? (
                    <p>
                      {translate(
                        'shamu.memory.excludedCounts',
                        '{{unmatched}} without a match or priority; {{overBudget}} did not fit the note budget.',
                        {
                          unmatched: context.selection.unmatched,
                          overBudget: context.selection.overBudget
                        }
                      )}
                    </p>
                  ) : null}
                </>
              ) : (
                <p>
                  {translate(
                    'shamu.memory.legacySelection',
                    'Selection details were not recorded for this earlier message.'
                  )}
                </p>
              )}
            </div>
            <div className="scrollbar-sleek mt-3 max-h-80 space-y-2 overflow-y-auto">
              {context.entries.map((entry) => {
                const terms = matches.get(entry.id) ?? []
                return (
                  <article
                    key={entry.id}
                    aria-label={entry.key}
                    className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm text-card-foreground"
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <h4 className="min-w-0 flex-1 break-words font-medium">
                        <BotReferenceText
                          text={entry.key}
                          catalogue={catalogue}
                          onOpen={communication?.close}
                        />
                      </h4>
                      {entry.pinned ? (
                        <Badge variant="outline">
                          <Pin aria-hidden="true" />
                          {translate('shamu.memory.pinned', 'Pinned')}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {entry.kind === 'fact'
                        ? translate('shamu.memory.fact', 'Fact')
                        : entry.kind === 'task'
                          ? translate('shamu.memory.taskState', 'Task state')
                          : translate('shamu.memory.summary', 'Summary')}
                      {' · '}
                      <BotReferenceText
                        text={entry.scope}
                        catalogue={catalogue}
                        onOpen={communication?.close}
                      />
                    </p>
                    {terms.length ? (
                      <p className="break-words text-xs text-muted-foreground">
                        {translate('shamu.memory.matchedTerms', 'Matched terms: {{terms}}', {
                          terms: terms.join(', ')
                        })}
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap break-words leading-relaxed">
                      <BotReferenceText
                        text={entry.text}
                        catalogue={catalogue}
                        onOpen={communication?.close}
                      />
                    </p>
                    <div className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                      {entry.sources.map((source) => (
                        <p key={`${source.sessionId}:${source.messageId ?? ''}:${source.label}`}>
                          {translate('shamu.memory.sourceLabel', 'Source:')}{' '}
                          <BotReferenceText
                            text={source.label}
                            catalogue={catalogue}
                            onOpen={communication?.close}
                          />
                        </p>
                      ))}
                    </div>
                  </article>
                )
              })}
            </div>
            {context.selection ? (
              <p className="mt-2 text-2xs text-chat-foreground-faint">
                {translate(
                  'shamu.memory.noteBudget',
                  '{{characters}} / {{budget}} note characters',
                  {
                    characters: context.selection.characters.toLocaleString(getIntlLocale()),
                    budget: context.selection.characterBudget.toLocaleString(getIntlLocale())
                  }
                )}
              </p>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

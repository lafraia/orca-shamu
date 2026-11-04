import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Bot, MessageSquare, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { NativeChatMarkdown } from '../native-chat/NativeChatMarkdown'
import type { ProjectChannel } from '../../../../shared/project-channels'
import {
  setProjectChannelDraft,
  openProjectChannelEditor,
  useProjectChannels
} from './project-channel-store'
import { ProjectChannelAgent } from './ProjectChannelAgent'
import { BotNativeConversation } from './BotNativeConversation'
import { ProjectChannelSettingsButton } from './ProjectChannelSettingsButton'
import { sendProjectChannelMessage, type ProjectChannelControllers } from './project-channel-send'

export default function ProjectChannelPage(): React.JSX.Element {
  const selectedId = useProjectChannels((state) => state.selectedId)
  const channel = useProjectChannels((state) =>
    state.snapshot.channels.find((row) => row.id === selectedId)
  )
  return channel ? (
    channel.home || (channel.members.length === 0 && channel.messages.length === 0) ? (
      <BotNativeConversation key={channel.id} channel={channel} />
    ) : (
      <ProjectChannelConversation key={channel.id} channel={channel} />
    )
  ) : (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-background p-8">
      <Bot className="size-7 text-muted-foreground" />
      <h1 className="text-lg font-medium">{translate('projectChannels.projects', 'Bots')}</h1>
      <Button onClick={() => openProjectChannelEditor({})}>
        <Plus />
        {translate('projectChannels.new', 'New bot')}
      </Button>
    </div>
  )
}

function ProjectChannelConversation({ channel }: { channel: ProjectChannel }): React.JSX.Element {
  const draft = useProjectChannels((state) => state.drafts[channel.id] ?? channel.draft)
  const setDraft = (text: string): void => setProjectChannelDraft(channel.id, text)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controllers = useRef<ProjectChannelControllers>(new Map())
  const log = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (stickToBottom.current && log.current) {
      log.current.scrollTop = log.current.scrollHeight
    }
  }, [channel.messages])
  const send = async (): Promise<void> => {
    if (sending || !draft.trim() || channel.members.length === 0) {
      return
    }
    setSending(true)
    setError(null)
    const text = draft
    try {
      await sendProjectChannelMessage(channel.id, text, controllers.current)
      stickToBottom.current = true
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : translate('projectChannels.sendError', 'Could not send this message.')
      )
    } finally {
      setSending(false)
      input.current?.focus()
    }
  }
  const mention = (handle: string): void => {
    setDraft(`${draft}${draft && !draft.endsWith(' ') ? ' ' : ''}@${handle} `)
    input.current?.focus()
  }
  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
      aria-label={channel.name}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <Bot className="size-4 shrink-0 text-muted-foreground" />
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{channel.name}</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            openProjectChannelEditor({ channelId: channel.id, section: 'conversations' })
          }
        >
          <MessageSquare />
          {translate('projectChannels.conversations', 'Conversations')}
          <span className="tabular-nums text-muted-foreground">{channel.members.length}</span>
        </Button>
        <ProjectChannelSettingsButton channelId={channel.id} />
      </header>
      <div
        ref={log}
        onScroll={() => {
          const node = log.current
          if (node) {
            stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80
          }
        }}
        role="log"
        aria-label={translate('projectChannels.conversation', 'Bot conversation')}
        aria-live="polite"
        aria-relevant="additions"
        className="min-h-0 flex-1 overflow-y-auto px-5 py-5 scrollbar-sleek"
      >
        <div className="mx-auto w-full max-w-(--chat-content-max-width) space-y-6">
          {channel.messages.length === 0 ? (
            <div className="space-y-3 py-12 text-center">
              <Bot className="mx-auto size-7 text-muted-foreground" />
              {channel.instructions ? (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {channel.instructions}
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {channel.members.length === 0
                  ? translate(
                      'projectChannels.noLinkedConversations',
                      'No conversations linked. You can add them later from Conversations.'
                    )
                  : translate(
                      'projectChannels.start',
                      'Message the bot or mention a linked conversation.'
                    )}
              </p>
            </div>
          ) : null}
          {channel.messages.map((message) => {
            const member = channel.members.find((row) => row.id === message.memberId)
            const name =
              message.role === 'user'
                ? translate('projectChannels.you', 'You')
                : (member?.name ??
                  message.authorName ??
                  translate('projectChannels.agent', 'Agent'))
            return (
              <article key={message.id} className="flex gap-3" data-project-message={message.id}>
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground"
                >
                  {name.slice(0, 1).toLocaleUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold">{name}</span>
                    {message.imported ? (
                      <span className="text-[11px] text-muted-foreground">
                        {translate('projectChannels.earlier', 'Earlier conversation')}
                      </span>
                    ) : null}
                  </div>
                  <NativeChatMarkdown content={message.text} className="text-sm text-foreground" />
                  {message.deliveries ? (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {Object.entries(message.deliveries).map(([id, status]) => (
                        <span
                          key={id}
                          className={
                            status === 'returned' || status === 'unconfirmed'
                              ? 'text-destructive'
                              : undefined
                          }
                        >
                          @{channel.members.find((row) => row.id === id)?.handle ?? 'agent'}:{' '}
                          {status === 'sending'
                            ? translate('projectChannels.sending', 'Sending…')
                            : status === 'recorded'
                              ? translate('projectChannels.sent', 'Sent')
                              : status === 'unconfirmed'
                                ? translate(
                                    'projectChannels.unconfirmed',
                                    'Delivery unconfirmed. Check the original chat.'
                                  )
                                : translate('projectChannels.notSent', 'Not sent')}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      </div>
      <div className="shrink-0 border-t border-border px-2 pt-2">
        {channel.members.map((member) => (
          <ProjectChannelAgent
            key={member.id}
            channelId={channel.id}
            member={member}
            controllers={controllers.current}
          />
        ))}
      </div>
      {channel.members.length > 0 ? (
        <form
          className="shrink-0 px-4 pb-4 pt-2"
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          <div className="mx-auto w-full max-w-(--chat-content-max-width) rounded-lg border border-input bg-card p-3 shadow-xs focus-within:ring-1 focus-within:ring-ring">
            <Textarea
              ref={input}
              aria-label={translate('projectChannels.message', 'Message bot')}
              placeholder={translate('projectChannels.message', 'Message bot')}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={sending}
              maxLength={100_000}
              variant="chat"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
            />
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {channel.members.map((member) => (
                <Button
                  type="button"
                  key={member.id}
                  variant="ghost"
                  size="xs"
                  onClick={() => mention(member.handle)}
                  aria-label={translate('projectChannels.mention', 'Mention {{name}}', {
                    name: member.name
                  })}
                >
                  @{member.handle}
                  {member.id === channel.mainMemberId ? (
                    <span className="text-[11px]">{translate('projectChannels.main', 'Main')}</span>
                  ) : null}
                </Button>
              ))}
              {channel.members.length > 1 ? (
                <Button type="button" variant="ghost" size="xs" onClick={() => mention('all')}>
                  @all
                </Button>
              ) : null}
              <Button
                type="submit"
                size="sm"
                className="ml-auto"
                disabled={sending || !draft.trim()}
              >
                <ArrowUp />
                {sending
                  ? translate('projectChannels.sending', 'Sending…')
                  : translate('projectChannels.send', 'Send')}
              </Button>
            </div>
          </div>
          {error ? (
            <p
              role="alert"
              className="mx-auto mt-2 max-w-(--chat-content-max-width) text-xs text-destructive"
            >
              {error}
            </p>
          ) : null}
        </form>
      ) : channel.messages.length > 0 ? (
        <p
          role="status"
          className="shrink-0 border-t border-border px-5 py-4 text-sm text-muted-foreground"
        >
          {translate(
            'projectChannels.noLinkedConversations',
            'No conversations linked. You can add them later from Conversations.'
          )}
        </p>
      ) : null}
    </section>
  )
}

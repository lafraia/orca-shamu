import { ArrowLeftRight, MessagesSquare } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { BotCommunicationParticipant } from '../../../../shared/bot-communications'
import type { NativeChatBlock } from '../../../../shared/native-chat/native-chat-types'
import { BotAvatar } from '../project-channels/BotAvatar'
import { useProjectChannels } from '../project-channels/project-channel-store'
import { NativeChatMarkdown } from './NativeChatMarkdown'
import { NativeChatCodeBlock } from './NativeChatCodeBlock'
import { NativeChatCopyButton } from './NativeChatCopyButton'
import { NativeChatMessageTimestamp } from './NativeChatMessageTimestamp'
import { NativeChatImageAttachments } from './NativeChatTranscriptChrome'
import { NativeChatMarkdownImageOwnerContext } from './native-chat-markdown-image-owner'
import { NativeChatLinkPeekProvider } from './native-chat-link-peek-context'
import { useBotCommunicationMedia } from './use-bot-communication-media'

export type CommunicationPostData = {
  id: string
  entryId: string
  author: BotCommunicationParticipant
  at: number
  blocks: NativeChatBlock[]
  caption?: string
  request: boolean
}

export function CommunicationParticipant({
  participant,
  onOpen,
  available,
  className
}: {
  participant: BotCommunicationParticipant
  onOpen: () => void
  available?: boolean
  className?: string
}): React.JSX.Element {
  const identity = useProjectChannels(
    (state) => state.snapshot.channels.find((bot) => bot.id === participant.botId)?.identity
  )
  return (
    <button
      type="button"
      disabled={available === false || (!participant.botId && available !== true)}
      onClick={onOpen}
      className={cn(
        'flex min-w-0 items-center gap-1.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      {participant.botId ? (
        <BotAvatar id={participant.botId} identity={identity} className="size-6 rounded-md" />
      ) : (
        <MessagesSquare aria-hidden className="size-4 shrink-0" />
      )}
      <span className="truncate">{participant.name}</span>
    </button>
  )
}

export function CommunicationPair({
  source,
  recipient
}: {
  source: React.ComponentProps<typeof CommunicationParticipant>
  recipient: React.ComponentProps<typeof CommunicationParticipant>
}): React.JSX.Element {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-chat-user-border bg-chat-user-surface px-3 py-2">
      <CommunicationParticipant
        {...source}
        className={cn('max-w-1/2 shrink-0', source.className)}
      />
      <ArrowLeftRight aria-hidden className="size-3.5 shrink-0 text-chat-foreground-faint" />
      <CommunicationParticipant {...recipient} />
    </span>
  )
}

export function CommunicationPost({
  post,
  selectedRef
}: {
  post: CommunicationPostData
  selectedRef?: React.RefObject<HTMLElement | null>
}): React.JSX.Element {
  const identity = useProjectChannels(
    (state) => state.snapshot.channels.find((bot) => bot.id === post.author.botId)?.identity
  )
  const media = useBotCommunicationMedia(post.author)
  const runtimeContext = media?.runtimeContext ?? null
  const text = post.blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n')
  return (
    <article
      ref={selectedRef}
      aria-label={translate('shamu.communication.postFrom', 'Message from {{name}}', {
        name: post.author.name
      })}
      className="group flex items-end gap-3"
      data-communication-message={post.id}
    >
      {post.author.botId ? (
        <BotAvatar id={post.author.botId} identity={identity} className="size-7" />
      ) : (
        <span
          aria-hidden
          className="inline-flex size-7 shrink-0 items-center justify-center text-chat-foreground-faint"
        >
          <MessagesSquare className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-chat-foreground-faint">
          <span className="text-sm font-medium text-chat-foreground-strong">
            {post.author.name}
          </span>
          {post.caption ? <span>{post.caption}</span> : null}
          <span className="ml-auto flex items-center gap-1">
            <NativeChatCopyButton text={text} />
            {post.at > 0 ? <NativeChatMessageTimestamp timestamp={post.at} /> : null}
          </span>
        </div>
        <div className="rounded-xl border border-chat-user-border bg-chat-user-surface px-3.5 py-2.5 text-sm text-chat-foreground">
          <NativeChatMarkdownImageOwnerContext.Provider value={media}>
            <NativeChatLinkPeekProvider fileLinkContext={media?.fileLinkContext ?? null}>
              <NativeChatImageAttachments
                blocks={post.blocks}
                runtimeContext={runtimeContext}
                enablePreview={Boolean(runtimeContext)}
              />
              {text ? (
                <NativeChatMarkdown
                  content={text}
                  variant="document"
                  renderCodeBlock={NativeChatCodeBlock}
                />
              ) : null}
            </NativeChatLinkPeekProvider>
          </NativeChatMarkdownImageOwnerContext.Provider>
        </div>
      </div>
    </article>
  )
}

export function CommunicationSkeleton(): React.JSX.Element {
  return (
    <div
      aria-busy="true"
      aria-label={translate('shamu.communication.loading', 'Loading communication')}
      className="space-y-8"
    >
      {[0, 1].map((id) => (
        <div key={id} aria-hidden className="flex items-end gap-3">
          <span className="size-7 shrink-0 rounded-lg bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="space-y-3 rounded-xl border border-chat-user-border bg-chat-user-surface px-3.5 py-2.5">
              <div className="h-3 w-full rounded bg-muted" />
              <div className="h-3 w-3/4 rounded bg-muted" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

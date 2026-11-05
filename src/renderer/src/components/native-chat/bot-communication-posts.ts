import { translate } from '@/i18n/i18n'
import type { BotCommunication, BotCommunicationText } from '../../../../shared/bot-communications'
import type { BotCommunicationPeerSnapshot } from './BotCommunicationPeer'
import type { CommunicationPostData } from './BotCommunicationThreadPosts'

export function botCommunicationPosts(
  entries: readonly BotCommunication[],
  texts: ReadonlyMap<string, BotCommunicationText>,
  peers: readonly BotCommunicationPeerSnapshot[]
): CommunicationPostData[] {
  const ids = new Set(entries.map((entry) => entry.id))
  const requests: CommunicationPostData[] = entries.flatMap((entry) => {
    const text = texts.get(entry.referenceId)
    const blocks =
      entry.native?.blocks ??
      (text ? [{ type: 'text' as const, text: text.text }, ...(text.attachments ?? [])] : undefined)
    return blocks
      ? [
          {
            id: `request:${entry.id}`,
            entryId: entry.id,
            author: entry.source,
            at: entry.createdAt,
            blocks,
            request: true,
            ...(entry.actor !== 'bot' && entry.actor !== 'workspace'
              ? {
                  caption:
                    entry.actor === 'user'
                      ? translate('shamu.communication.yourMention', 'Your mention')
                      : translate('shamu.communication.reference', 'Conversation reference')
                }
              : {})
          }
        ]
      : []
  })
  const replies: CommunicationPostData[] = peers.flatMap((peer) =>
    peer.replies
      .filter(({ entry }) => ids.has(entry.id))
      .map(({ entry, message }) => ({
        id: `${entry.recipient.sessionId}:${message.id}`,
        entryId: entry.id,
        author: entry.recipient,
        at: Math.max(entry.createdAt, message.timestamp ?? entry.createdAt),
        request: false,
        blocks: message.blocks.filter(
          (block) => block.type === 'text' || block.type === 'image-ref'
        )
      }))
  )
  return [...requests, ...replies].toSorted(
    (a, b) => a.at - b.at || Number(b.request) - Number(a.request)
  )
}

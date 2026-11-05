import {
  CommunicationParticipant,
  CommunicationPost,
  CommunicationSkeleton
} from './BotCommunicationThreadPosts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { motionSafeScrollBehavior } from '@/hooks/usePrefersReducedMotion'
import {
  botCommunicationPairKey,
  type BotCommunication,
  type BotCommunicationParticipant,
  type BotCommunicationText
} from '../../../../shared/bot-communications'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { openProjectChannel, useProjectChannels } from '../project-channels/project-channel-store'
import {
  openProjectChannelSource,
  projectChannelCandidates
} from '../project-channels/project-channel-candidates'
import { BotCommunicationPeer, type BotCommunicationPeerSnapshot } from './BotCommunicationPeer'
import { botCommunicationPosts } from './bot-communication-posts'
import { useNativeChatAppearanceStyle } from './native-chat-appearance-style'

export function BotCommunicationThread({
  selected,
  entries,
  target,
  onClose
}: {
  selected: BotCommunication
  entries: readonly BotCommunication[]
  target: RuntimeClientTarget
  onClose: () => void
}): React.JSX.Element {
  const [count, setCount] = useState(20)
  const [texts, setTexts] = useState<ReadonlyMap<string, BotCommunicationText>>(new Map())
  const textCache = useRef(new Map<string, BotCommunicationText>())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [peers, setPeers] = useState<Record<string, BotCommunicationPeerSnapshot>>({})
  const selectedElement = useRef<HTMLElement | null>(null)
  const scrolled = useRef<string | null>(null)
  const settings = useAppStore((state) => state.settings)
  const appearance = useNativeChatAppearanceStyle(settings)
  const pair = botCommunicationPairKey(selected)
  const baseEntries = useMemo(
    () => [
      ...new Map(
        [...entries, selected]
          .filter((entry) => botCommunicationPairKey(entry) === pair)
          .map((entry) => [entry.id, entry])
      ).values()
    ],
    [entries, selected, pair]
  )
  const pairEntries = useMemo(
    () =>
      [
        ...new Map(
          [
            ...baseEntries,
            ...Object.values(peers)
              .flatMap((peer) => peer.nativeEntries)
              .filter((entry) => botCommunicationPairKey(entry) === pair)
          ].map((entry) => [entry.id, entry])
        ).values()
      ].toSorted((a, b) => a.createdAt - b.createdAt),
    [baseEntries, peers, pair]
  )
  const shown = useMemo(() => {
    const tail = pairEntries.slice(-count)
    return tail.some((entry) => entry.id === selected.id) ? tail : [selected, ...tail]
  }, [pairEntries, count, selected])
  const referenceIds = useMemo(
    () => [...new Set(shown.filter((entry) => !entry.native).map((entry) => entry.referenceId))],
    [shown]
  )
  useEffect(() => {
    let current = true
    setLoading(true)
    setError(null)
    const missing = referenceIds.filter((id) => !textCache.current.has(id))
    if (!missing.length) {
      setLoading(false)
      return
    }
    const batches = Array.from({ length: Math.ceil(missing.length / 100) }, (_, index) =>
      missing.slice(index * 100, index * 100 + 100)
    )
    void Promise.all(batches.map((ids) => window.api.projectChannels!.communications!.texts(ids)))
      .then((next) => {
        if (current) {
          next.flat().forEach((row) => textCache.current.set(row.referenceId, row))
          setTexts(new Map(textCache.current))
          setLoading(false)
        }
      })
      .catch(() => {
        if (current) {
          setError('Could not load the messages. Retry to read this communication.')
          setLoading(false)
        }
      })
    return () => {
      current = false
    }
  }, [referenceIds, attempt])
  const receive = useCallback((sessionId: string, snapshot: BotCommunicationPeerSnapshot) => {
    setPeers((current) =>
      current[sessionId] === snapshot ? current : { ...current, [sessionId]: snapshot }
    )
  }, [])
  const sessions = useMemo(
    () => [selected.source.sessionId, selected.recipient.sessionId],
    [selected.source.sessionId, selected.recipient.sessionId]
  )
  const open = (participant: BotCommunicationParticipant): void => {
    if (participant.botId) {
      onClose()
      openProjectChannel(participant.botId)
    } else {
      const member = projectChannelCandidates(useAppStore.getState()).find(
        (row) =>
          row.sessionId === participant.sessionId &&
          row.target.kind === 'environment' &&
          row.target.environmentId === selected.environmentId
      )
      if (member) {
        onClose()
        useProjectChannels.setState({ mode: 'workspaces' })
        openProjectChannelSource(member)
      }
    }
  }
  const sourceAvailable = useAppStore((state) =>
    Boolean(
      selected.source.botId ||
      projectChannelCandidates(state).some(
        (member) =>
          member.sessionId === selected.source.sessionId &&
          member.target.kind === 'environment' &&
          member.target.environmentId === selected.environmentId
      )
    )
  )
  const recipientAvailable = useAppStore((state) =>
    Boolean(
      selected.recipient.botId ||
      projectChannelCandidates(state).some(
        (member) =>
          member.sessionId === selected.recipient.sessionId &&
          member.target.kind === 'environment' &&
          member.target.environmentId === selected.environmentId
      )
    )
  )
  const recipientName = useAppStore(
    (state) =>
      projectChannelCandidates(state).find(
        (member) =>
          member.sessionId === selected.recipient.sessionId &&
          member.target.kind === 'environment' &&
          member.target.environmentId === selected.environmentId
      )?.name
  )
  const sourceName = useAppStore(
    (state) =>
      projectChannelCandidates(state).find(
        (member) =>
          member.sessionId === selected.source.sessionId &&
          member.target.kind === 'environment' &&
          member.target.environmentId === selected.environmentId
      )?.name
  )
  const source = useMemo(
    () =>
      selected.source.botId || !sourceName
        ? selected.source
        : { ...selected.source, name: sourceName },
    [selected.source, sourceName]
  )
  const recipient = useMemo(
    () =>
      selected.recipient.botId || !recipientName
        ? selected.recipient
        : { ...selected.recipient, name: recipientName },
    [selected.recipient, recipientName]
  )
  const posts = useMemo(
    () =>
      botCommunicationPosts(shown, texts, Object.values(peers)).map((post) => ({
        ...post,
        author: post.author.sessionId === source.sessionId ? source : recipient
      })),
    [shown, texts, peers, source, recipient]
  )
  useEffect(() => {
    if (loading || scrolled.current === selected.id || !selectedElement.current) {
      return
    }
    scrolled.current = selected.id
    selectedElement.current.scrollIntoView({ block: 'start', behavior: motionSafeScrollBehavior() })
  }, [loading, posts, selected.id])
  const replied = Object.values(peers).some((peer) =>
    peer.replies.some(({ entry }) => entry.id === selected.id)
  )
  const mixed = Object.values(peers).some((peer) => peer.mixed.has(selected.id))
  return (
    <Sheet
      open
      onOpenChange={(value) => {
        if (!value) {
          onClose()
        }
      }}
    >
      <SheetContent
        side="right"
        motion="theme"
        data-bot-communication-thread
        surface="chat"
        style={appearance}
      >
        <div className="shrink-0 border-b border-border">
          <SheetHeader>
            <div className="pr-8">
              <SheetTitle>
                <span className="flex min-w-0 items-center gap-2">
                  <CommunicationParticipant
                    participant={source}
                    available={sourceAvailable}
                    onOpen={() => open(selected.source)}
                  />
                  <ArrowLeftRight
                    aria-hidden
                    className="size-3.5 shrink-0 text-chat-foreground-faint"
                  />
                  <CommunicationParticipant
                    participant={recipient}
                    available={recipientAvailable}
                    onOpen={() => open(selected.recipient)}
                  />
                </span>
              </SheetTitle>
            </div>
            <SheetDescription>
              {translate(
                'shamu.communication.description',
                'Bot communication. Your conversation stays separate.'
              )}
            </SheetDescription>
          </SheetHeader>
        </div>
        <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-5">
          {error ? (
            <div
              role="alert"
              className="mb-5 flex items-center justify-between gap-3 text-sm text-chat-warning"
            >
              <span>{error}</span>
              <Button variant="ghost" size="sm" onClick={() => setAttempt((value) => value + 1)}>
                <RefreshCw />
                {translate('shamu.communication.retry', 'Retry')}
              </Button>
            </div>
          ) : null}
          {pairEntries.length > count ? (
            <Button
              variant="ghost"
              size="sm"
              className="mb-5"
              onClick={() => setCount((value) => value + 20)}
            >
              {translate('shamu.communication.earlier', 'Load earlier communication')}
            </Button>
          ) : null}
          {loading && !posts.length ? (
            <CommunicationSkeleton />
          ) : (
            <div className="space-y-8">
              {posts.map((post) => (
                <CommunicationPost
                  key={post.id}
                  post={post}
                  selectedRef={
                    post.request && post.entryId === selected.id ? selectedElement : undefined
                  }
                />
              ))}
            </div>
          )}
          {!loading && !error && !replied ? (
            <p className="mt-6 text-sm text-chat-foreground-faint">
              {mixed
                ? translate(
                    'shamu.communication.sharedTurn',
                    'This reply shares a turn with your message. Open the original chat to read it in context.'
                  )
                : selected.state === 'refused'
                  ? translate(
                      'shamu.communication.notDelivered',
                      'The message was not delivered. Open the original chat to check its status.'
                    )
                  : translate('shamu.communication.noReply', 'No reply in the loaded history yet.')}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            {sessions.map((sessionId) => (
              <BotCommunicationPeer
                key={sessionId}
                sessionId={sessionId}
                target={target}
                entries={baseEntries}
                selected={selected}
                onSnapshot={receive}
              />
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

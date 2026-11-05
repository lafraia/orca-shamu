import type { ProjectChannel } from '../../../../shared/project-channels'
import { botUnreadSnapshotSchema, type BotReadMark } from '../../../../shared/bot-unread'
import { getStructuredAgentSessionStatusFeed } from '@/runtime/structured-agent-session-status-feed'
import { getStructuredAgentSessionTurnCompletionFeed } from '@/runtime/structured-agent-session-turn-completion-feed'
import { findStructuredAgentSessionReadOwner } from '../native-chat/structured-agent-session-read-owner'
import { subscribeStructuredAttentionViews } from '@/attention/agent-subject-read-actions'
import { subscribeAutoAckPresenceSignals } from '@/hooks/agent-auto-ack-presence'
import { useAppStore } from '@/store'
import { useProjectChannels } from './project-channel-store'
import { useBotUnread } from './bot-unread-store'
import { isBotChatViewed } from './bot-read-visibility'

export function startBotUnreadMonitor(channels: ProjectChannel[]): () => void {
  const api = window.api.projectChannels
  if (!api?.readUnread || !api.markRead) {
    return () => {}
  }
  const bindings = channels.flatMap((bot) => {
    const member = bot.members.find((row) => row.id === bot.home?.memberId)
    return bot.home?.ready && member?.target.kind === 'environment'
      ? [{ id: bot.id, member, target: member.target }]
      : []
  })
  if (!bindings.length) {
    useBotUnread.setState({ counts: {}, pending: [] })
    return () => {}
  }
  let disposed = false
  let reading = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const dirty = new Set(bindings.map((row) => row.id))
  const acknowledged = new Map<string, string>()
  const acknowledging = new Set<string>()
  const subscriptions: (() => void)[] = []
  const accept = (value: unknown): void => {
    if (!disposed) {
      useBotUnread.setState(botUnreadSnapshotSchema.parse(value))
    }
  }
  const observeViews = (): void => {
    for (const binding of bindings) {
      if (!isBotChatViewed(binding.id, binding.member)) {
        continue
      }
      const snapshot = findStructuredAgentSessionReadOwner(
        binding.member.sessionId,
        binding.target
      )?.getSnapshot()
      const cursor = snapshot?.state.cursor
      if (!snapshot?.current || !cursor) {
        continue
      }
      const key = JSON.stringify([binding.member.sessionId, cursor])
      if (
        acknowledging.has(binding.id) ||
        acknowledged.get(binding.id) === key ||
        (acknowledged.has(binding.id) && !useBotUnread.getState().counts[binding.id])
      ) {
        continue
      }
      acknowledging.add(binding.id)
      acknowledged.set(binding.id, key)
      const mark: BotReadMark = {
        botId: binding.id,
        environmentId: binding.target.environmentId,
        sessionId: binding.member.sessionId,
        cursor: { ...cursor }
      }
      let confirmed = false
      void api
        .markRead(mark)
        .then((value) => {
          confirmed = true
          accept(value)
          if (!disposed) {
            schedule([binding.id])
          }
        })
        .catch(() => {
          if (acknowledged.get(binding.id) === key) {
            acknowledged.delete(binding.id)
          }
        })
        .finally(() => {
          acknowledging.delete(binding.id)
          if (confirmed && !disposed) {
            observeViews()
          }
        })
    }
  }
  const flush = async (): Promise<void> => {
    timer = null
    if (disposed || reading || !dirty.size) {
      return
    }
    reading = true
    const ids = [...dirty]
    dirty.clear()
    let delay = 500
    try {
      const value = await api.readUnread(ids)
      accept(value)
      value.pending.forEach((id) => dirty.add(id))
      observeViews()
    } catch {
      ids.forEach((id) => dirty.add(id))
      delay = 5000
    } finally {
      reading = false
      if (!disposed && dirty.size && !timer) {
        timer = setTimeout(() => void flush(), delay)
      }
    }
  }
  const schedule = (ids: string[]): void => {
    ids.forEach((id) => dirty.add(id))
    if (!disposed && !reading && !timer && dirty.size) {
      timer = setTimeout(() => void flush(), 500)
    }
  }
  for (const environmentId of new Set(bindings.map((row) => row.target.environmentId))) {
    const feed = getStructuredAgentSessionStatusFeed({ kind: 'environment', environmentId })
    const stamps = new Map<string, string>()
    const observe = (): void => {
      const changed: string[] = []
      for (const binding of bindings.filter((row) => row.target.environmentId === environmentId)) {
        const summary = feed.getSnapshot().get(binding.member.sessionId)
        const stamp =
          summary &&
          JSON.stringify([
            summary.status,
            summary.statusStartedAt,
            summary.turnOutcome,
            feed.getSessionObservation(binding.member.sessionId),
            summary.status === 'working' ? null : summary.updatedAt
          ])
        if (stamp && stamps.get(binding.id) !== stamp) {
          stamps.set(binding.id, stamp)
          changed.push(binding.id)
        }
      }
      schedule(changed)
    }
    subscriptions.push(feed.activate(), feed.subscribe(observe))
    const completions = getStructuredAgentSessionTurnCompletionFeed({
      kind: 'environment',
      environmentId
    })
    subscriptions.push(
      completions.activate(),
      completions.subscribe((edge) => {
        const sessionId =
          edge.type === 'completion' ? edge.completion.sessionId : edge.prompt.sessionId
        schedule(
          bindings
            .filter(
              (row) =>
                row.target.environmentId === environmentId && row.member.sessionId === sessionId
            )
            .map((row) => row.id)
        )
      })
    )
    observe()
  }
  subscriptions.push(
    subscribeStructuredAttentionViews(observeViews),
    useAppStore.subscribe(observeViews),
    useProjectChannels.subscribe(observeViews),
    useBotUnread.subscribe(observeViews),
    subscribeAutoAckPresenceSignals(observeViews, () => queueMicrotask(observeViews))
  )
  if (api.onUnreadChanged) {
    subscriptions.push(api.onUnreadChanged((id) => schedule([id])))
  }
  schedule([...dirty])
  observeViews()
  return () => {
    disposed = true
    if (timer) {
      clearTimeout(timer)
    }
    subscriptions.forEach((unsubscribe) => unsubscribe())
  }
}

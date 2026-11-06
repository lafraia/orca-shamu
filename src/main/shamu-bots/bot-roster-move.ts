import type { ProjectChannel, ProjectChannelsSnapshot } from '../../shared/project-channels'
import type { BotRosterMove } from '../../shared/bot-roster-move'
import { botSectionNames } from '../../shared/bot-sections'

export function moveBotRoster(
  snapshot: ProjectChannelsSnapshot,
  move: BotRosterMove
): ProjectChannelsSnapshot {
  const visible = botSectionNames(
    snapshot.channels.filter((bot) => !bot.pinned),
    snapshot.sectionOrder
  )
  if (move.kind === 'section') {
    if (!visible.includes(move.section) || !visible.includes(move.targetSection)) {
      throw new Error('This group no longer exists. Reload bots before trying again.')
    }
    if (move.section === move.targetSection) {
      return snapshot
    }
    const order = botSectionNames(snapshot.channels, snapshot.sectionOrder)
    const next = order.filter((section) => section !== move.section)
    next.splice(
      next.indexOf(move.targetSection) + (move.placement === 'after' ? 1 : 0),
      0,
      move.section
    )
    return next.every((section, index) => section === order[index])
      ? snapshot
      : { ...snapshot, sectionOrder: next }
  }

  const bot = snapshot.channels.find((row) => row.id === move.botId)
  if (!bot) {
    throw new Error('This bot no longer exists. Reload bots before trying again.')
  }
  if (move.section !== null && !visible.includes(move.section)) {
    throw new Error('This group no longer exists. Reload bots before trying again.')
  }
  const inDestination = (row: ProjectChannel): boolean =>
    move.section === null
      ? Boolean(row.pinned)
      : !row.pinned && (row.section ?? '') === move.section
  const target = snapshot.channels.find((row) => row.id === move.relativeTo)
  if (move.relativeTo && (!target || !inDestination(target))) {
    throw new Error('The destination changed. Reload bots before trying again.')
  }
  if (move.relativeTo === bot.id) {
    return snapshot
  }
  const channels = snapshot.channels.filter((row) => row.id !== bot.id)
  const destination = channels.filter(inDestination)
  const anchor = target ?? destination.at(-1)
  const index = anchor
    ? channels.indexOf(anchor) + (!target || move.placement === 'after' ? 1 : 0)
    : channels.length
  channels.splice(
    index,
    0,
    inDestination(bot)
      ? bot
      : {
          ...bot,
          pinned: move.section === null,
          ...(move.section !== null ? { section: move.section } : {})
        }
  )
  return channels.every((row, index) => row === snapshot.channels[index])
    ? snapshot
    : { ...snapshot, channels }
}

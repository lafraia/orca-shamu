import { z } from 'zod'
import type { BotReadMark, BotUnreadSnapshot } from '../../shared/bot-unread'
import type { AgentJournalCursor } from '../../shared/agent-session/journal/agent-session-journal-identity'
import { isAdmissibleAgentJournalRenderItem } from '../../shared/agent-session/journal/agent-session-journal-schemas'
import { JournalCursor } from '../../shared/rpc-contract/structured-agent-session-identifiers'
import type { ProjectChannelsStore } from '../project-channels-store'
import { withSidecarSnapshotQueue } from '../filesystem/sidecar-snapshot-file'
import { botJournalPageSchema, type BotPrimary } from './bot-journal-reader'
import { BotReadStore, botReadKey } from './bot-read-store'

const pageSchema = botJournalPageSchema.shape.page.extend({ liveCursor: JournalCursor.optional() })
const responseSchema = z.object({ ok: z.literal(true), page: pageSchema })
type Progress = {
  key: string
  head: AgentJournalCursor
  before?: AgentJournalCursor
  seen: Set<string>
  done: boolean
}
export class BotUnreadService {
  private readonly receipts: BotReadStore
  private readonly progress = new Map<string, Progress>()
  constructor(
    private readonly channels: ProjectChannelsStore,
    private readonly primary: BotPrimary,
    directory: string
  ) {
    this.receipts = new BotReadStore(directory)
  }
  private async page(sessionId: string, before?: AgentJournalCursor, limit = 100) {
    const { page } = responseSchema.parse(
      await this.primary.call('agentSession.history', {
        sessionId,
        direction: before ? 'before' : 'tail',
        ...(before ? { cursor: before } : {}),
        limit
      })
    )
    if (page.sessionId !== sessionId) {
      throw new Error('The primary returned another conversation.')
    }
    return page
  }
  read(ids?: string[]): Promise<BotUnreadSnapshot> {
    return withSidecarSnapshotQueue(`${this.receipts.file}.scan`, async () => {
      const { environmentId } = await this.primary.read()
      if (!environmentId) {
        throw new Error('Connect to the primary Orca to refresh unread messages.')
      }
      const channels = (await this.channels.read()).channels
      const receipts = await this.receipts.read()
      const marks = receipts.marks
      for (const bot of channels) {
        if (ids && !ids.includes(bot.id)) {
          continue
        }
        const member = bot.members.find((row) => row.id === bot.home?.memberId)
        if (
          !bot.home?.ready ||
          member?.target.kind !== 'environment' ||
          member.target.environmentId !== environmentId
        ) {
          continue
        }
        let page = await this.page(member.sessionId, undefined, 1)
        const head = page.liveCursor ?? page.window.newest ?? page.window.nextCursor
        const identity = { botId: bot.id, environmentId, sessionId: member.sessionId }
        let mark = marks.find((row) => botReadKey(row) === botReadKey(identity))
        if (!mark || mark.cursor.epoch !== head.epoch) {
          mark = {
            ...identity,
            cursor:
              mark || bot.createdAt >= receipts.startedAt
                ? { epoch: head.epoch, sequence: 0 }
                : head
          }
          await this.receipts.write(mark)
          this.progress.delete(bot.id)
        }
        let progress = this.progress.get(bot.id)
        if (
          !progress ||
          progress.key !== botReadKey(identity) ||
          progress.head.epoch !== head.epoch ||
          progress.head.sequence !== head.sequence
        ) {
          progress = {
            key: botReadKey(identity),
            head,
            seen: new Set(),
            done: mark.cursor.sequence >= head.sequence
          }
          this.progress.set(bot.id, progress)
        } else if (progress.done) {
          continue
        }
        if (!progress.done) {
          page = await this.page(member.sessionId, progress.before)
        }
        for (let index = 0; index < 5 && !progress.done; index++) {
          if (page.epoch !== head.epoch) {
            this.progress.delete(bot.id)
            throw new Error('The bot history changed. Refresh unread messages.')
          }
          for (const item of page.items.filter(isAdmissibleAgentJournalRenderItem)) {
            if (
              item.sequence > mark.cursor.sequence &&
              !item.agentId &&
              item.body.kind === 'message' &&
              item.body.role === 'assistant' &&
              item.body.blocks.some(
                (block) =>
                  (block.type === 'text' && block.text.trim().length > 0) ||
                  block.type === 'image-ref'
              )
            ) {
              progress.seen.add(item.itemId)
            }
            if (progress.seen.size >= 100) {
              break
            }
          }
          const oldest = page.window.oldest
          progress.done =
            progress.seen.size >= 100 ||
            !page.hasOlder ||
            !oldest ||
            oldest.sequence <= mark.cursor.sequence ||
            oldest.sequence === progress.before?.sequence
          progress.before = oldest ?? undefined
          if (!progress.done && index < 4) {
            page = await this.page(member.sessionId, progress.before)
          }
        }
      }
      for (const id of this.progress.keys()) {
        if (!channels.some((bot) => bot.id === id)) {
          this.progress.delete(id)
        }
      }
      return this.snapshot()
    })
  }
  async markRead(mark: BotReadMark): Promise<BotUnreadSnapshot> {
    await withSidecarSnapshotQueue(`${this.receipts.file}.scan`, async () => {
      const { environmentId } = await this.primary.read()
      const bot = (await this.channels.read()).channels.find((row) => row.id === mark.botId)
      const member = bot?.members.find((row) => row.id === bot.home?.memberId)
      if (
        !bot?.home?.ready ||
        member?.sessionId !== mark.sessionId ||
        member.target.kind !== 'environment' ||
        member.target.environmentId !== mark.environmentId ||
        environmentId !== mark.environmentId
      ) {
        throw new Error('This read receipt belongs to another bot conversation.')
      }
      const page = await this.page(mark.sessionId, undefined, 1)
      const head = page.liveCursor ?? page.window.newest ?? page.window.nextCursor
      if (mark.cursor.epoch !== head.epoch || mark.cursor.sequence > head.sequence) {
        throw new Error('Only observed bot messages can be marked read.')
      }
      await this.receipts.write(mark)
      this.progress.set(mark.botId, {
        key: botReadKey(mark),
        head: mark.cursor,
        seen: new Set(),
        done: true
      })
    })
    return this.read([mark.botId])
  }
  private snapshot(): BotUnreadSnapshot {
    return {
      counts: Object.fromEntries(
        [...this.progress].map(([id, progress]) => [id, progress.seen.size])
      ),
      pending: [...this.progress].filter(([, progress]) => !progress.done).map(([id]) => id)
    }
  }
}

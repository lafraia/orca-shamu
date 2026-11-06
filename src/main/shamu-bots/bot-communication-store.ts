import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type {
  BotCommunication,
  BotCommunicationSnapshot,
  BotCommunicationText
} from '../../shared/bot-communications'
import type { ProjectChannelsStore } from '../project-channels-store'
import type { BotPrimary } from './bot-journal-reader'
import { botMentionRecordSchema, type BotMentionRecord } from './bot-mention-record'
import type { BotCliService } from './bot-cli-service'

type CachedRecord = { stamp: string; entries: BotCommunication[] }

export class BotCommunicationStore {
  private readonly directory: string
  private readonly cache = new Map<string, CachedRecord>()
  constructor(
    profileDirectory: string,
    private readonly channels: Pick<ProjectChannelsStore, 'read'>,
    private readonly primary: Pick<BotPrimary, 'read'>,
    private readonly cli?: Pick<BotCliService, 'communications' | 'text'> | null
  ) {
    this.directory = join(profileDirectory, 'bot-mentions')
  }

  async read(sessionId: string): Promise<BotCommunicationSnapshot> {
    const { environmentId } = await this.primary.read()
    if (!environmentId) {
      throw new Error('Connect to the primary Orca to read bot communication.')
    }
    let files: string[]
    try {
      files = (await readdir(this.directory, { withFileTypes: true }))
        .filter(
          (entry) =>
            entry.isFile() &&
            z.uuid().safeParse(entry.name.slice(0, -5)).success &&
            entry.name.endsWith('.json')
        )
        .map((entry) => entry.name)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        files = []
      } else {
        throw error
      }
    }
    const present = new Set(files)
    for (const file of this.cache.keys()) {
      if (!present.has(file)) {
        this.cache.delete(file)
      }
    }
    let incomplete = false
    const cli = await this.cli?.communications(sessionId)
    const entries: BotCommunication[] = cli?.entries ?? []
    incomplete ||= cli?.incomplete ?? false
    for (const file of files) {
      try {
        const path = join(this.directory, file)
        const info = await stat(path)
        const stamp = `${info.mtimeMs}:${info.size}`
        let cached = this.cache.get(file)
        if (cached?.stamp !== stamp) {
          const saved = botMentionRecordSchema.parse(JSON.parse(await readFile(path, 'utf8')))
          cached = { stamp, entries: communicationEntries(saved, info.birthtimeMs || info.mtimeMs) }
          this.cache.set(file, cached)
        }
        entries.push(
          ...cached.entries.filter(
            (entry) =>
              entry.environmentId === environmentId &&
              (entry.source.sessionId === sessionId || entry.recipient.sessionId === sessionId)
          )
        )
      } catch {
        incomplete = true
      }
    }
    const bots = (await this.channels.read()).channels
    const names = new Map(
      bots.flatMap((bot) => {
        const member = bot.members.find((row) => row.id === bot.home?.memberId)
        return member?.target.kind === 'environment' &&
          member.target.environmentId === environmentId
          ? [[member.sessionId, { botId: bot.id, name: bot.name }] as const]
          : []
      })
    )
    return {
      entries: entries
        .map((entry) => ({
          ...entry,
          source: { ...entry.source, ...names.get(entry.source.sessionId) },
          recipient: { ...entry.recipient, ...names.get(entry.recipient.sessionId) }
        }))
        .toSorted((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
      incomplete
    }
  }

  async texts(ids: string[]): Promise<BotCommunicationText[]> {
    const { environmentId } = await this.primary.read()
    if (!environmentId) {
      throw new Error('Connect to the primary Orca to read bot communication.')
    }
    const messages: BotCommunicationText[] = []
    for (const id of new Set(ids)) {
      const referenceId = z.uuid().parse(id)
      const cli = await this.cli?.text(referenceId)
      if (cli) {
        messages.push(cli)
        continue
      }
      const saved = botMentionRecordSchema.parse(
        JSON.parse(await readFile(join(this.directory, `${referenceId}.json`), 'utf8'))
      )
      if (saved.request.source.environmentId !== environmentId) {
        throw new Error('This communication belongs to a different primary Orca.')
      }
      const source = saved.context?.messages.findLast(
        (row) => row.role === 'user' && row.text === saved.request.text
      )
      messages.push({
        referenceId,
        text: saved.request.text,
        ...(source?.attachments ? { attachments: source.attachments } : {})
      })
    }
    return messages
  }
}

function communicationEntries(saved: BotMentionRecord, fallbackAt: number): BotCommunication[] {
  const request = saved.request
  const users = saved.context?.messages.filter((row) => row.role === 'user') ?? []
  const sourceItemId =
    saved.origin?.sourceItemId ?? users.findLast((row) => row.text === request.text)?.id
  return saved.receipts.flatMap((receipt) =>
    receipt.state === 'self'
      ? []
      : [
          {
            id: `${request.id}:${receipt.botId}`,
            referenceId: request.id,
            environmentId: request.source.environmentId,
            createdAt: saved.createdAt ?? saved.context?.capturedAt ?? fallbackAt,
            source: {
              sessionId: request.source.sessionId,
              name: request.source.label,
              ...(sourceItemId ? { itemId: sourceItemId } : {})
            },
            recipient: {
              botId: receipt.botId,
              sessionId: receipt.sessionId,
              name: receipt.name,
              operationId: receipt.operationId
            },
            actor: saved.origin ? 'bot' : saved.createdAt ? 'user' : 'unknown',
            state: receipt.state
          }
        ]
  )
}

import { createStructuredAgentSessionOperationId } from '../shared/agent-session/lifecycle/structured-agent-session-mutation'
import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import {
  botMentionPrompt,
  botMentionRequestSchema,
  type BotMentionReceipt,
  type BotMentionRequest
} from '../shared/bot-mentions'
import type { ProjectChannelsStore } from './project-channels-store'
import type { BotConversationService } from './bot-conversation-service'
import type { BotMemoryService } from './bot-memory-service'
import type { ShamuPrimaryConnection } from './shamu-primary-connection'
import { withSidecarSnapshotQueue, writeSidecarSnapshot } from './filesystem/sidecar-snapshot-file'
import { readBotReferenceContext } from './shamu-bots/bot-journal-reader'
import {
  botMentionRecordSchema as savedSchema,
  type botMentionReceiptSchema as receiptSchema,
  type BotMentionOrigin,
  type BotMentionRecord
} from './shamu-bots/bot-mention-record'
import { dispatchBotPrompt } from './shamu-bots/bot-prompt-dispatch'
import type { AgentJournalCursor } from '../shared/agent-session/journal/agent-session-journal-identity'
import { readBotPromptResult } from './shamu-bots/bot-cli-result'

export class BotMentionDelivery {
  constructor(
    private readonly channels: Pick<ProjectChannelsStore, 'read'>,
    private readonly bots: Pick<BotConversationService, 'ensure'>,
    private readonly primary: Pick<ShamuPrimaryConnection, 'read' | 'call'>,
    private readonly profileDirectory: string,
    private readonly memory?: Pick<BotMemoryService, 'prepare'> | null,
    private readonly changed?: () => void
  ) {}

  deliver(input: BotMentionRequest, origin?: BotMentionOrigin): Promise<BotMentionReceipt[]> {
    const request = botMentionRequestSchema.parse(input)
    const file = join(this.profileDirectory, 'bot-mentions', `${request.id}.json`)
    return withSidecarSnapshotQueue(file, async () => {
      const { environmentId } = await this.primary.read()
      if (!environmentId || environmentId !== request.source.environmentId) {
        throw new Error('This mention belongs to a different Orca server.')
      }
      const fingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex')
      let saved: z.infer<typeof savedSchema>
      try {
        saved = savedSchema.parse(JSON.parse(await readFile(file, 'utf8')))
        if (saved.fingerprint !== fingerprint) {
          throw new Error('This mention identifier was already used for another message.')
        }
        if (
          saved.origin?.actorId !== origin?.actorId ||
          saved.origin?.sourceItemId !== origin?.sourceItemId
        ) {
          throw new Error('This communication belongs to another originating request.')
        }
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          throw error
        }
        const context = await readBotReferenceContext(this.primary, request.source.sessionId)
        const snapshot = await this.channels.read()
        const selected = [...new Set(request.botIds)].map((id) =>
          snapshot.channels.find((bot) => bot.id === id)
        )
        if (
          selected.some(
            (bot) => !bot || (!bot.home && (bot.members.length > 0 || bot.messages.length > 0))
          )
        ) {
          throw new Error('A mentioned bot no longer has a permanent chat. Choose it again.')
        }
        const receipts: z.infer<typeof receiptSchema>[] = []
        for (const bot of selected) {
          const current = (await this.bots.ensure(bot!.id)).channels.find(
            (row) => row.id === bot!.id
          )!
          const member = current.members.find((row) => row.id === current.home?.memberId)
          if (
            !member ||
            member.target.kind !== 'environment' ||
            member.target.environmentId !== environmentId
          ) {
            throw new Error('A mentioned bot belongs to a different Orca server.')
          }
          receipts.push({
            botId: current.id,
            name: current.name,
            sessionId: member.sessionId,
            operationId: createStructuredAgentSessionOperationId(randomUUID),
            state: member.sessionId === request.source.sessionId ? 'self' : 'ready'
          })
        }
        saved = {
          version: 1,
          fingerprint,
          request,
          receipts,
          context,
          createdAt: Date.now(),
          ...(origin ? { origin } : {})
        }
        await mkdir(join(this.profileDirectory, 'bot-mentions'), { recursive: true, mode: 0o700 })
        await this.persist(file, saved)
      }
      for (const receipt of saved.receipts) {
        if (receipt.state === 'issued') {
          receipt.state = 'unconfirmed'
          receipt.message = 'Delivery was interrupted. Check the bot chat before sending again.'
          await this.persist(file, saved)
        }
        if (receipt.state !== 'ready') {
          continue
        }
        let issued = false
        try {
          const channels = (await this.channels.read()).channels
          const current = channels.find((bot) => bot.id === receipt.botId)
          if (
            !current?.home ||
            !current.members.some(
              (member) =>
                member.id === current.home?.memberId && member.sessionId === receipt.sessionId
            )
          ) {
            throw new Error('This bot conversation changed. Choose the bot again.')
          }
          const prompt = botMentionPrompt(
            request,
            { id: receipt.botId, name: receipt.name },
            saved.context,
            saved.origin ? channels.find((bot) => bot.id === saved.origin?.actorId) : undefined
          )
          const prepared = this.memory
            ? await this.memory.prepare(receipt.sessionId, environmentId, prompt)
            : prompt
          const { result, evidence } = await dispatchBotPrompt(
            this.primary,
            receipt.sessionId,
            receipt.operationId,
            prepared,
            async () => {
              issued = true
              receipt.state = 'issued'
              await this.persist(file, saved)
            }
          )
          receipt.state =
            evidence.kind === 'recorded'
              ? 'recorded'
              : evidence.kind === 'not-recorded'
                ? 'refused'
                : 'unconfirmed'
          if (result.ok) {
            receipt.messageId = result.value.clientMessageId
          }
          if (receipt.state === 'refused' && !result.ok) {
            receipt.message = result.refusal.message
          }
        } catch (error) {
          receipt.state = issued ? 'unconfirmed' : 'refused'
          receipt.message =
            error instanceof Error ? error.message : 'Could not deliver the mention.'
        }
        await this.persist(file, saved)
      }
      return saved.receipts.map(({ botId, name, state, message }) => ({
        botId,
        name,
        state: state === 'issued' || state === 'ready' ? 'unconfirmed' : state,
        ...(message ? { message } : {})
      }))
    })
  }

  private async persist(file: string, saved: BotMentionRecord): Promise<void> {
    await writeSidecarSnapshot(file, saved, 0o600)
    this.changed?.()
  }

  async result(actorId: string, referenceId: string) {
    const saved = savedSchema.parse(
      JSON.parse(
        await readFile(
          join(this.profileDirectory, 'bot-mentions', `${z.uuid().parse(referenceId)}.json`),
          'utf8'
        )
      )
    )
    const { environmentId } = await this.primary.read()
    const actor = (await this.channels.read()).channels.find((bot) => bot.id === actorId)
    const owner = actor?.members.find((member) => member.id === actor.home?.memberId)
    if (
      saved.origin?.actorId !== actorId ||
      !owner ||
      owner.sessionId !== saved.request.source.sessionId ||
      environmentId !== saved.request.source.environmentId ||
      owner.target.kind !== 'environment' ||
      owner.target.environmentId !== environmentId ||
      saved.receipts.length !== 1
    ) {
      throw new Error('This consultation does not belong to this bot and primary Orca.')
    }
    const receipt = saved.receipts[0]
    return readBotPromptResult(this.primary, {
      requestId: referenceId,
      botId: receipt.botId,
      botName: receipt.name,
      sessionId: receipt.sessionId,
      operationId: receipt.operationId,
      messageId: receipt.messageId,
      state: receipt.state,
      error: receipt.message
    })
  }

  async context(botId: string, referenceId: string, cursor?: AgentJournalCursor) {
    const saved = savedSchema.parse(
      JSON.parse(
        await readFile(
          join(this.profileDirectory, 'bot-mentions', `${z.uuid().parse(referenceId)}.json`),
          'utf8'
        )
      )
    )
    const { environmentId } = await this.primary.read()
    if (
      environmentId !== saved.request.source.environmentId ||
      !saved.receipts.some(
        (receipt) =>
          receipt.botId === botId && ['recorded', 'unconfirmed', 'issued'].includes(receipt.state)
      )
    ) {
      throw new Error(
        'This source reference does not belong to this bot on the connected primary Orca.'
      )
    }
    if (!saved.context) {
      throw new Error('This older notification has no context snapshot. Mention the bot again.')
    }
    if (!cursor) {
      return saved.context
    }
    if (
      !saved.context.before ||
      cursor.epoch !== saved.context.before.epoch ||
      cursor.sequence > saved.context.before.sequence
    ) {
      throw new Error('Use the earlier-message cursor returned by this reference.')
    }
    return readBotReferenceContext(this.primary, saved.request.source.sessionId, cursor)
  }
}

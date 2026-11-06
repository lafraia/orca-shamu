import { createHash, randomUUID } from 'node:crypto'
import type { ProjectChannelsStore } from '../project-channels-store'
import type { BotConversationService } from '../bot-conversation-service'
import type { BotMemoryService } from '../bot-memory-service'
import type {
  BotCommunicationSnapshot,
  BotCommunicationText
} from '../../shared/bot-communications'
import {
  botCliPromptText,
  botCliSendSchema,
  type BotCliSend,
  type BotCliReceipt
} from '../../shared/bot-cli-prompts'
import { createStructuredAgentSessionOperationId } from '../../shared/agent-session/lifecycle/structured-agent-session-mutation'
import { withSidecarSnapshotQueue } from '../filesystem/sidecar-snapshot-file'
import { dispatchBotPrompt } from './bot-prompt-dispatch'
import { BotCliStore } from './bot-cli-store'
import { readBotCliResult } from './bot-cli-result'
import type { BotPrimary } from './bot-journal-reader'

export class BotCliService {
  private readonly store: BotCliStore
  constructor(
    private readonly channels: Pick<ProjectChannelsStore, 'read'>,
    private readonly bots: Pick<BotConversationService, 'ensure'>,
    private readonly memory: Pick<BotMemoryService, 'prepare'>,
    private readonly primary: BotPrimary,
    directory: string,
    private readonly changed: () => void
  ) {
    this.store = new BotCliStore(directory)
  }

  async send(input: BotCliSend) {
    const request = botCliSendSchema.parse(input)
    const fingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex')
    return withSidecarSnapshotQueue(this.store.file(request.requestId), async () => {
      const { environmentId } = await this.primary.read()
      if (!environmentId) {
        throw new Error('Connect Shamu to the primary Orca before sending to a bot.')
      }
      let receipt = await this.store.read(request.requestId)
      if (
        receipt &&
        (receipt.fingerprint !== fingerprint || receipt.environmentId !== environmentId)
      ) {
        throw new Error('This request ID belongs to a different prompt, bot or primary Orca.')
      }
      if (!receipt) {
        const roster = (await this.channels.read()).channels
        const matches = roster.filter((bot) => bot.id === request.bot)
        const candidates = matches.length
          ? matches
          : roster.filter((bot) => bot.name.toLocaleLowerCase() === request.bot.toLocaleLowerCase())
        if (candidates.length !== 1) {
          throw new Error('Choose a unique bot name or use its ID from bots list.')
        }
        const bot = (await this.bots.ensure(candidates[0].id)).channels.find(
          (bot) => bot.id === candidates[0].id
        )!
        const member = bot.members.find((row) => row.id === bot.home?.memberId)
        if (
          !bot.home?.ready ||
          member?.target.kind !== 'environment' ||
          member.target.environmentId !== environmentId
        ) {
          throw new Error(
            'This bot does not have a ready conversation on the connected primary Orca.'
          )
        }
        const prompt = await this.memory.prepare(
          member.sessionId,
          environmentId,
          botCliPromptText(request)
        )
        receipt = {
          version: 1,
          request,
          fingerprint,
          botId: bot.id,
          botName: bot.name,
          sessionId: member.sessionId,
          environmentId,
          operationId: createStructuredAgentSessionOperationId(randomUUID),
          prompt,
          state: 'prepared',
          createdAt: Date.now()
        }
        await this.persist(receipt)
      }
      if (receipt.state === 'prepared') {
        const sending = receipt
        let issued = false
        try {
          const { result, evidence } = await dispatchBotPrompt(
            this.primary,
            receipt.sessionId,
            receipt.operationId,
            receipt.prompt,
            async () => {
              issued = true
              sending.state = 'issued'
              await this.persist(sending)
            }
          )
          receipt.state =
            evidence.kind === 'recorded'
              ? result.ok && 'queued' in result.value
                ? 'queued'
                : 'submitted'
              : evidence.kind === 'not-recorded'
                ? 'refused'
                : 'unconfirmed'
          if (result.ok) {
            receipt.messageId = result.value.clientMessageId
          } else {
            receipt.error = result.refusal.message
          }
        } catch (error) {
          receipt.state = issued ? 'unconfirmed' : 'prepared'
          receipt.error =
            error instanceof Error ? error.message : 'Could not deliver this CLI prompt.'
        }
        await this.persist(receipt)
      }
      return this.result(request.requestId)
    })
  }
  async result(id: string) {
    const receipt = await this.store.read(id)
    if (!receipt) {
      throw new Error('This CLI request was not found in the selected Shamu profile.')
    }
    if ((await this.primary.read()).environmentId !== receipt.environmentId) {
      throw new Error('This request belongs to another primary Orca.')
    }
    try {
      return await readBotCliResult(this.primary, receipt)
    } catch {
      return {
        requestId: id,
        botId: receipt.botId,
        name: receipt.botName,
        sessionId: receipt.sessionId,
        operationId: receipt.operationId,
        delivery: receipt.state,
        state: receipt.state === 'issued' ? 'unconfirmed' : receipt.state,
        response: null,
        error: 'The primary history is unavailable. Reuse this request ID to check again.'
      }
    }
  }
  async communications(sessionId: string): Promise<BotCommunicationSnapshot> {
    const { receipts, incomplete } = await this.store.list()
    const { environmentId } = await this.primary.read()
    return {
      incomplete,
      entries: receipts
        .filter((row) => row.environmentId === environmentId && row.sessionId === sessionId)
        .map((row) => ({
          id: `cli:${row.request.requestId}`,
          referenceId: row.request.requestId,
          environmentId: row.environmentId,
          createdAt: row.createdAt,
          source: { sessionId: `cli:${row.request.sender}`, name: row.request.sender },
          recipient: {
            botId: row.botId,
            name: row.botName,
            sessionId: row.sessionId,
            operationId: row.operationId
          },
          actor: 'cli',
          state:
            row.state === 'prepared'
              ? 'ready'
              : row.state === 'queued' || row.state === 'submitted'
                ? 'recorded'
                : row.state,
          cli: { text: row.request.text, sender: row.request.sender }
        }))
    }
  }
  async text(id: string): Promise<BotCommunicationText | null> {
    const receipt = await this.store.read(id)
    if (!receipt) {
      return null
    }
    if ((await this.primary.read()).environmentId !== receipt.environmentId) {
      throw new Error('This request belongs to another primary Orca.')
    }
    return { referenceId: id, text: receipt.request.text }
  }
  private async persist(receipt: BotCliReceipt): Promise<void> {
    await this.store.write(receipt)
    this.changed()
  }
}

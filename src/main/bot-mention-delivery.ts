import { structuredAgentSessionBlocksTooLarge } from '../shared/rpc-contract/structured-agent-session-message-params'
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
import {
  structuredAgentSessionMessageSendMutation,
  structuredAgentSessionSendBody
} from '../shared/agent-session/requests/structured-agent-session-send-mutation'
import { structuredAgentSessionSendEvidence } from '../shared/agent-session/requests/structured-agent-session-send-evidence'
import type {
  AgentSessionMutationResult,
  AgentSessionSendResult
} from '../shared/agent-session/agent-session-wire'
import type { ProjectChannelsStore } from './project-channels-store'
import type { BotConversationService } from './bot-conversation-service'
import type { ShamuPrimaryConnection } from './shamu-primary-connection'
import { withSidecarSnapshotQueue, writeSidecarSnapshot } from './filesystem/sidecar-snapshot-file'

const receiptSchema = z.object({
  botId: z.string(),
  name: z.string(),
  state: z.enum(['ready', 'issued', 'recorded', 'refused', 'unconfirmed', 'self']),
  operationId: z.string().regex(/^\d{13}-[0-9a-f]{32}$/),
  sessionId: z.string(),
  message: z.string().optional()
})
const savedSchema = z.object({
  version: z.literal(1),
  fingerprint: z.string(),
  request: botMentionRequestSchema,
  receipts: z.array(receiptSchema)
})
const historySchema = z.object({
  ok: z.boolean(),
  page: z.object({ fence: z.number().optional() })
})

export class BotMentionDelivery {
  constructor(
    private readonly channels: Pick<ProjectChannelsStore, 'read'>,
    private readonly bots: Pick<BotConversationService, 'ensure'>,
    private readonly primary: Pick<ShamuPrimaryConnection, 'read' | 'call'>,
    private readonly profileDirectory: string
  ) {}

  deliver(input: BotMentionRequest): Promise<BotMentionReceipt[]> {
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
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          throw error
        }
        const source = historySchema.parse(
          await this.primary.call('agentSession.history', {
            sessionId: request.source.sessionId,
            direction: 'tail',
            limit: 1
          })
        )
        if (!source.ok) {
          throw new Error('The source conversation could not be verified.')
        }
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
        saved = { version: 1, fingerprint, request, receipts }
        await mkdir(join(this.profileDirectory, 'bot-mentions'), { recursive: true, mode: 0o700 })
        await writeSidecarSnapshot(file, saved, 0o600)
      }
      for (const receipt of saved.receipts) {
        if (receipt.state === 'issued') {
          receipt.state = 'unconfirmed'
          receipt.message = 'Delivery was interrupted. Check the bot chat before sending again.'
          await writeSidecarSnapshot(file, saved, 0o600)
        }
        if (receipt.state !== 'ready') {
          continue
        }
        try {
          const history = historySchema.parse(
            await this.primary.call('agentSession.history', {
              sessionId: receipt.sessionId,
              direction: 'tail',
              limit: 1
            })
          )
          if (!history.ok || history.page.fence === undefined) {
            throw new Error('The bot conversation is not ready. Open its chat and try again.')
          }
          const current = (await this.channels.read()).channels.find(
            (bot) => bot.id === receipt.botId
          )
          if (
            !current?.home ||
            !current.members.some(
              (member) =>
                member.id === current.home?.memberId && member.sessionId === receipt.sessionId
            )
          ) {
            throw new Error('This bot conversation changed. Choose the bot again.')
          }
          const body = structuredAgentSessionSendBody(
            botMentionPrompt(request, { id: receipt.botId, name: receipt.name }),
            []
          )
          if (structuredAgentSessionBlocksTooLarge(body.blocks)) {
            throw new Error('The mention is too large. Send a shorter message to the bot.')
          }
          const params = structuredAgentSessionMessageSendMutation({
            sessionId: receipt.sessionId,
            clientOperationId: receipt.operationId,
            expectedRuntimeFence: history.page.fence,
            delivery: 'queue-if-active',
            body
          })
          receipt.state = 'issued'
          await writeSidecarSnapshot(file, saved, 0o600)
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the authenticated primary serves the upstream agentSession.send wire contract.
          const result = (await this.primary.call(
            'agentSession.send',
            params
          )) as AgentSessionMutationResult<AgentSessionSendResult>
          const evidence = structuredAgentSessionSendEvidence({ kind: 'result', result })
          receipt.state =
            evidence.kind === 'recorded'
              ? 'recorded'
              : evidence.kind === 'not-recorded'
                ? 'refused'
                : 'unconfirmed'
          if (receipt.state === 'refused' && !result.ok) {
            receipt.message = result.refusal.message
          }
        } catch (error) {
          receipt.state = receipt.state === 'issued' ? 'unconfirmed' : 'refused'
          receipt.message =
            error instanceof Error ? error.message : 'Could not deliver the mention.'
        }
        await writeSidecarSnapshot(file, saved, 0o600)
      }
      return saved.receipts.map(({ botId, name, state, message }) => ({
        botId,
        name,
        state: state === 'issued' || state === 'ready' ? 'unconfirmed' : state,
        ...(message ? { message } : {})
      }))
    })
  }
}

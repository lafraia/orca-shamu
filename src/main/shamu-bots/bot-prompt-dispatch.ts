import { z } from 'zod'
import type {
  AgentSessionMutationResult,
  AgentSessionSendResult
} from '../../shared/agent-session/agent-session-wire'
import {
  structuredAgentSessionMessageSendMutation,
  structuredAgentSessionSendBody
} from '../../shared/agent-session/requests/structured-agent-session-send-mutation'
import { structuredAgentSessionSendEvidence } from '../../shared/agent-session/requests/structured-agent-session-send-evidence'
import { structuredAgentSessionBlocksTooLarge } from '../../shared/rpc-contract/structured-agent-session-message-params'
import type { BotPrimary } from './bot-journal-reader'

export async function dispatchBotPrompt(
  primary: BotPrimary,
  sessionId: string,
  operationId: string,
  prompt: string,
  beforeIssue: () => Promise<void>
) {
  const history = z
    .object({ ok: z.literal(true), page: z.object({ fence: z.number() }) })
    .parse(await primary.call('agentSession.history', { sessionId, direction: 'tail', limit: 1 }))
  const body = structuredAgentSessionSendBody(prompt, [])
  if (structuredAgentSessionBlocksTooLarge(body.blocks)) {
    throw new Error('The bot message is too large.')
  }
  const params = structuredAgentSessionMessageSendMutation({
    sessionId,
    clientOperationId: operationId,
    expectedRuntimeFence: history.page.fence,
    delivery: 'queue-if-active',
    body
  })
  await beforeIssue()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the pinned authenticated primary implements the upstream agentSession.send wire contract.
  const result = (await primary.call(
    'agentSession.send',
    params
  )) as AgentSessionMutationResult<AgentSessionSendResult>
  const evidence = structuredAgentSessionSendEvidence({ kind: 'result', result })
  return { result, evidence }
}

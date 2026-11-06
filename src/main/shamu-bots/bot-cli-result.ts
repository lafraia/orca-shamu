import type { BotCliReceipt } from '../../shared/bot-cli-prompts'
import type { AgentJournalSnapshot } from '../../shared/agent-session/journal/agent-session-journal-types'
import { resolveChatAutomationRun } from '../automations/automation-chat-run-observation'
import { readBotJournal, type BotPrimary } from './bot-journal-reader'

export async function readBotCliResult(primary: BotPrimary, receipt: BotCliReceipt) {
  return readBotPromptResult(primary, {
    ...receipt,
    requestId: receipt.request.requestId
  })
}

export async function readBotPromptResult(
  primary: BotPrimary,
  receipt: {
    requestId: string
    botId: string
    botName: string
    sessionId: string
    operationId: string
    messageId?: string
    state: string
    error?: string
  }
) {
  const base = {
    requestId: receipt.requestId,
    botId: receipt.botId,
    name: receipt.botName,
    sessionId: receipt.sessionId,
    operationId: receipt.operationId,
    state: receipt.state,
    delivery: receipt.state,
    error: receipt.error,
    response: null
  }
  if (['prepared', 'ready', 'refused', 'self'].includes(receipt.state)) {
    return base
  }
  let page = await readBotJournal(primary, receipt.sessionId)
  const queued = page.page.queuedMessages?.find(
    (row) => row.messageId === (receipt.messageId ?? receipt.operationId)
  )
  if (queued) {
    return {
      ...base,
      state: queued.state === 'waiting' ? 'queued' : 'unconfirmed',
      ...(queued.state === 'returned'
        ? { error: 'The queued prompt was returned. Review the bot chat before sending again.' }
        : {})
    }
  }
  const snapshot: AgentJournalSnapshot = {
    sessionId: receipt.sessionId,
    cursor: page.snapshot.cursor,
    items: [],
    submissions: []
  }
  let running = false
  for (let index = 0; index < 20; index++) {
    snapshot.items.push(...page.snapshot.items)
    snapshot.submissions.push(...page.snapshot.submissions)
    snapshot.items.sort((a, b) => a.sequence - b.sequence)
    const linked = snapshot.submissions.find(
      (row) => row.queuedMessageId === (receipt.messageId ?? receipt.operationId)
    )
    const result = resolveChatAutomationRun(
      snapshot,
      receipt.messageId ?? receipt.operationId,
      receipt.botName,
      linked
        ? { clientMessageId: receipt.messageId ?? receipt.operationId, submission: linked }
        : null
    )
    running ||= Boolean(result.turnItem)
    if (result.observation && (!page.page.hasOlder || result.turnItem)) {
      return {
        ...base,
        state: result.observation.status === 'completed' ? 'completed' : 'failed',
        response: result.observation.outputSnapshot?.content ?? null,
        truncated: result.observation.outputSnapshot?.truncated ?? false,
        error: result.observation.error ?? undefined
      }
    }
    if (!page.page.hasOlder || !page.page.window.oldest) {
      return { ...base, state: running ? 'running' : 'unconfirmed' }
    }
    const cursor = page.page.window.oldest
    const older = await readBotJournal(primary, receipt.sessionId, cursor)
    if (older.page.window.oldest?.sequence === cursor.sequence) {
      break
    }
    page = older
  }
  return {
    ...base,
    state: 'unconfirmed',
    error: 'This request is outside the recent history window. Review the bot chat.'
  }
}

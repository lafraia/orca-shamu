import type { BotRoutineRun } from '../../shared/bot-routines'
import type { AgentJournalSnapshot } from '../../shared/agent-session/journal/agent-session-journal-types'
import { chatAutomationRunObservation } from '../automations/automation-chat-run-observation'
import { readBotJournal, type BotPrimary } from './bot-journal-reader'

export async function observeBotRoutine(primary: BotPrimary, run: BotRoutineRun) {
  let page = await readBotJournal(primary, run.sessionId)
  const queueKnown = page.page.queuedMessages !== undefined
  const card = page.page.queuedMessages?.find((row) => row.messageId === run.messageId)
  if (card?.state === 'waiting') {
    return null
  }
  if (card?.state === 'returned') {
    return {
      status: 'unconfirmed' as const,
      error:
        'The queued routine was returned. Review its card in the bot chat before allowing another run.'
    }
  }
  const snapshot: AgentJournalSnapshot = {
    sessionId: run.sessionId,
    cursor: page.snapshot.cursor,
    items: [],
    submissions: []
  }
  for (let index = 0; index < 20; index++) {
    snapshot.items.push(
      ...page.snapshot.items.filter(
        (item) =>
          item.body.kind === 'turn' || (item.body.kind === 'status' && item.body.turnLifecycle)
      )
    )
    snapshot.submissions.push(
      ...page.snapshot.submissions.filter(
        (row) => row.clientMessageId === run.messageId || row.queuedMessageId === run.messageId
      )
    )
    const linked = snapshot.submissions
      .filter((row) => row.queuedMessageId === run.messageId)
      .toSorted(
        (a, b) => (b.submittedSequence ?? b.submittedAt) - (a.submittedSequence ?? a.submittedAt)
      )[0]
    const observation = chatAutomationRunObservation(
      snapshot,
      run.messageId!,
      'Bot',
      linked ? { clientMessageId: run.messageId!, submission: linked } : null
    )
    if (observation) {
      return observation
    }
    if (!page.page.hasOlder || !page.page.window.oldest) {
      if (queueKnown && run.state === 'queued' && snapshot.submissions.length === 0) {
        return {
          status: 'unconfirmed' as const,
          error:
            'The queued routine is no longer in the queue and has no delivery record. Review the bot chat before allowing another run.'
        }
      }
      return null
    }
    const cursor = page.page.window.oldest
    const older = await readBotJournal(primary, run.sessionId, cursor)
    if (older.page.window.oldest?.sequence === cursor.sequence) {
      return null
    }
    page = older
  }
  return {
    status: 'unconfirmed' as const,
    error:
      'The outcome is outside the recent history window. Review the bot chat before allowing another run.'
  }
}

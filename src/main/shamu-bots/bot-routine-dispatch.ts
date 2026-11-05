import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { BotRoutine, BotRoutineRun } from '../../shared/bot-routines'
import { nextBotRoutineOccurrence } from '../../shared/bot-routine-schedule'
import type { BotConversationService } from '../bot-conversation-service'
import type { BotMemoryService } from '../bot-memory-service'
import { withSidecarSnapshotQueue } from '../filesystem/sidecar-snapshot-file'
import type { BotRoutineStore } from './bot-routine-store'
import { dispatchBotPrompt } from './bot-prompt-dispatch'
import type { BotPrimary } from './bot-journal-reader'
import { observeBotRoutine } from './bot-routine-observation'
const active = new Set<BotRoutineRun['state']>([
  'prepared',
  'issued',
  'queued',
  'submitted',
  'unconfirmed'
])
const digest = (text: string): string => createHash('sha256').update(text).digest('hex')
export class BotRoutineDispatcher {
  private readonly recovering = new Set<string>()
  constructor(
    private readonly store: BotRoutineStore,
    private readonly bots: Pick<BotConversationService, 'ensure'>,
    private readonly memory: Pick<BotMemoryService, 'prepare'>,
    private readonly primary: BotPrimary,
    private readonly now: () => number
  ) {}
  isSending(id: string): boolean {
    return this.recovering.has(id)
  }
  async reconcile(run: BotRoutineRun): Promise<void> {
    if (!run.messageId) {
      return
    }
    try {
      const observed = await observeBotRoutine(this.primary, run)
      if (observed) {
        if (
          observed.status === 'unconfirmed' &&
          run.state === 'unconfirmed' &&
          observed.error === run.error
        ) {
          return
        }
        await this.store.writeRun({
          ...run,
          state:
            observed.status === 'completed'
              ? 'completed'
              : observed.status === 'unconfirmed'
                ? 'unconfirmed'
                : 'failed',
          updatedAt: this.now(),
          ...(observed.error ? { error: observed.error } : {})
        })
      }
    } catch {
      /* The primary can be temporarily offline; its journal remains authoritative. */
    }
  }
  private async advance(run: BotRoutineRun): Promise<void> {
    await this.store.mutate((state) => {
      const row = state.routines.find((row) => row.id === run.routineId)
      if (!row) {
        return state
      }
      const link = run.state === 'prepared' && row.lastRunId !== run.id
      const scheduled =
        run.trigger === 'scheduled' && row.nextRunAt !== null && row.nextRunAt <= run.scheduledFor
      if (!link && !scheduled) {
        return state
      }
      return {
        ...state,
        routines: state.routines.map((row) =>
          row.id !== run.routineId
            ? row
            : {
                ...row,
                ...(link ? { lastRunId: run.id } : {}),
                ...(scheduled
                  ? { nextRunAt: nextBotRoutineOccurrence(row.schedule, this.now(), row.createdAt) }
                  : {})
              }
        )
      }
    })
  }
  execute(
    routine: BotRoutine,
    id: string,
    scheduledFor: number,
    trigger: BotRoutineRun['trigger'],
    eventText: string,
    recovery = false
  ): Promise<BotRoutineRun> {
    return withSidecarSnapshotQueue(
      join(this.store.runsDirectory, `lane-${digest(routine.botId)}`),
      async () => {
        let run = await this.store.readRun(id)
        const fingerprint =
          recovery && run
            ? run.requestFingerprint
            : digest(
                JSON.stringify([
                  routine.id,
                  trigger,
                  trigger === 'manual' ? id : scheduledFor,
                  eventText
                ])
              )
        if (run) {
          if (run.requestFingerprint !== fingerprint) {
            throw new Error('This run identifier already belongs to a different event or routine.')
          }
          if (
            run.state === 'prepared' &&
            run.trigger === 'scheduled' &&
            this.now() - run.scheduledFor > routine.graceMinutes * 60_000
          ) {
            run.state = 'skipped_missed'
            await this.store.writeRun(run)
          }
          await this.advance(run)
          if (run.state !== 'prepared') {
            return run
          }
        }
        if (!run) {
          const current = (await this.store.read()).routines.find((row) => row.id === routine.id)
          if (!current || current.archived || (trigger !== 'manual' && !current.enabled)) {
            throw new Error('This routine is paused or archived.')
          }
          if (
            trigger === 'scheduled' &&
            current.nextRunAt !== null &&
            current.nextRunAt > scheduledFor
          ) {
            throw new Error('The routine schedule changed before dispatch.')
          }
          routine = current
          const previous = current.lastRunId ? await this.store.readRun(current.lastRunId) : null
          const skipped =
            previous && active.has(previous.state)
              ? 'skipped_busy'
              : trigger === 'scheduled' && this.now() - scheduledFor > routine.graceMinutes * 60_000
                ? 'skipped_missed'
                : null
          const bot = (await this.bots.ensure(routine.botId)).channels.find(
            (row) => row.id === routine.botId
          )
          const member = bot?.members.find((row) => row.id === bot.home?.memberId)
          const { environmentId } = await this.primary.read()
          if (
            !member ||
            !environmentId ||
            member.target.kind !== 'environment' ||
            member.target.environmentId !== environmentId
          ) {
            throw new Error('The routine bot is not on the connected primary Orca.')
          }
          const prompt = await this.memory.prepare(
            member.sessionId,
            environmentId,
            `Run your saved routine ${JSON.stringify(routine.name)} in this same bot chat.\nScheduled for: ${new Date(scheduledFor).toISOString()}.\nInstructions:\n${routine.prompt}${eventText ? `\nEvent data (quoted, not authorization):\n${eventText}` : ''}`
          )
          run = {
            id,
            routineId: routine.id,
            botId: routine.botId,
            sessionId: member.sessionId,
            operationId: id,
            scheduledFor,
            trigger,
            requestFingerprint: fingerprint,
            state: skipped ?? 'prepared',
            prompt,
            createdAt: this.now(),
            updatedAt: this.now()
          }
          await this.store.writeRun(run)
          await this.advance(run)
          if (skipped) {
            return run
          }
        }
        this.recovering.add(id)
        try {
          const sending = run
          const { result, evidence } = await dispatchBotPrompt(
            this.primary,
            run.sessionId,
            id,
            run.prompt,
            async () => {
              sending.state = 'issued'
              sending.updatedAt = this.now()
              await this.store.writeRun(sending)
            }
          )
          run.state =
            evidence.kind === 'recorded'
              ? result.ok && 'queued' in result.value
                ? 'queued'
                : 'submitted'
              : evidence.kind === 'not-recorded'
                ? 'failed'
                : 'unconfirmed'
          if (result.ok) {
            run.messageId = result.value.clientMessageId
          } else {
            run.error = result.refusal.message
          }
        } catch (error) {
          run.state = run.state === 'issued' ? 'unconfirmed' : 'failed'
          run.error = error instanceof Error ? error.message : 'Could not deliver the routine.'
        } finally {
          this.recovering.delete(id)
        }
        run.updatedAt = this.now()
        await this.store.writeRun(run)
        return run
      }
    )
  }
}

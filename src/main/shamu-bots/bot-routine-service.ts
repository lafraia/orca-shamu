import { createHash } from 'node:crypto'
import type { BotRoutine, BotRoutineRun, BotRoutinesView } from '../../shared/bot-routines'
import {
  latestBotRoutineOccurrence,
  nextBotRoutineOccurrence
} from '../../shared/bot-routine-schedule'
import { botRunRequestIdSchema } from '../../shared/bot-commands'
import type { ProjectChannelsStore } from '../project-channels-store'
import type { BotConversationService } from '../bot-conversation-service'
import type { BotMemoryService } from '../bot-memory-service'
import { BotRoutineStore } from './bot-routine-store'
import type { BotPrimary } from './bot-journal-reader'
import { BotRoutineDispatcher } from './bot-routine-dispatch'

const digest = (text: string): string => createHash('sha256').update(text).digest('hex')
const runIdFor = (routine: BotRoutine, at: number, key: string): string =>
  `${String(at).padStart(13, '0')}-${digest(`${routine.id}:${key}`).slice(0, 32)}`

export class BotRoutineService {
  private readonly store: BotRoutineStore
  private timer: ReturnType<typeof setInterval> | null = null
  private ticking = false
  private readonly dispatcher: BotRoutineDispatcher
  private error: string | undefined
  constructor(
    private readonly channels: ProjectChannelsStore,
    private readonly bots: Pick<BotConversationService, 'ensure'>,
    memory: Pick<BotMemoryService, 'prepare'>,
    primary: BotPrimary,
    directory: string,
    private readonly now: () => number = Date.now
  ) {
    this.store = new BotRoutineStore(directory)
    this.dispatcher = new BotRoutineDispatcher(this.store, bots, memory, primary, now)
  }

  start(): void {
    if (this.timer) {
      return
    }
    this.timer = setInterval(() => {
      void this.tick().catch(() => {})
    }, 15_000)
    this.timer.unref()
    void this.tick().catch(() => {})
  }
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
    }
    this.timer = null
  }
  async view(botId?: string): Promise<BotRoutinesView> {
    if (botId && !(await this.channels.read()).channels.some((row) => row.id === botId)) {
      throw new Error('This bot no longer exists.')
    }
    const state = await this.store.read()
    return {
      ...state,
      routines: state.routines.filter((row) => (!botId || row.botId === botId) && !row.archived),
      runs: (await this.store.listRuns(botId)).map(
        ({ prompt: _prompt, requestFingerprint: _fingerprint, ...summary }) => summary
      ),
      scheduler: this.timer ? 'running' : 'stopped',
      ...(this.error ? { error: this.error } : {})
    }
  }
  async save(input: BotRoutine, revision: number): Promise<BotRoutinesView> {
    const snapshot = await this.bots.ensure(input.botId)
    if (!snapshot.channels.find((row) => row.id === input.botId)?.home?.ready) {
      throw new Error('Open this bot before adding a routine.')
    }
    await this.store.mutate((state) => {
      const previous = state.routines.find((row) => row.id === input.id)
      if (previous && previous.botId !== input.botId) {
        throw new Error('A routine cannot move to another bot.')
      }
      const config = (row: BotRoutine): string =>
        JSON.stringify([row.name, row.prompt, row.schedule, row.enabled, row.graceMinutes])
      if (
        revision > state.revision ||
        (previous && input.updatedAt !== previous.updatedAt && config(previous) !== config(input))
      ) {
        throw new Error('Routines changed. Reload before saving.')
      }
      if (previous && config(previous) === config(input)) {
        return state
      }
      const now = this.now()
      if (
        input.schedule.kind === 'once' &&
        input.schedule.at <= now &&
        (!previous || JSON.stringify(previous.schedule) !== JSON.stringify(input.schedule))
      ) {
        throw new Error('Choose a future time for this routine.')
      }
      const next = {
        ...input,
        archived: false,
        createdAt: previous?.createdAt ?? now,
        updatedAt: Math.max(now, (previous?.updatedAt ?? 0) + 1),
        lastRunId: previous?.lastRunId,
        nextRunAt:
          previous && JSON.stringify(previous.schedule) === JSON.stringify(input.schedule)
            ? previous.nextRunAt
            : nextBotRoutineOccurrence(input.schedule, now, previous?.createdAt ?? now)
      }
      return {
        ...state,
        routines: previous
          ? state.routines.map((row) => (row.id === input.id ? next : row))
          : [...state.routines, next]
      }
    })
    return this.view(input.botId)
  }
  async control(
    id: string,
    action: 'pause' | 'resume' | 'run' | 'archive' | 'acknowledge',
    requestId: string
  ): Promise<BotRoutinesView> {
    const routine = (await this.store.read()).routines.find((row) => row.id === id && !row.archived)
    if (!routine) {
      throw new Error('This routine no longer exists.')
    }
    if (action === 'run') {
      await this.dispatcher.execute(
        routine,
        botRunRequestIdSchema.parse(requestId),
        this.now(),
        'manual',
        ''
      )
      return this.view(routine.botId)
    }
    await this.store.mutate((state) => ({
      ...state,
      routines: state.routines.map((row) =>
        row.id !== id
          ? row
          : {
              ...row,
              updatedAt: Math.max(this.now(), row.updatedAt + 1),
              enabled:
                action === 'pause' || action === 'archive'
                  ? false
                  : action === 'resume'
                    ? true
                    : row.enabled,
              archived: action === 'archive',
              ...(action === 'resume'
                ? { nextRunAt: nextBotRoutineOccurrence(row.schedule, this.now(), row.createdAt) }
                : {}),
              ...(action === 'acknowledge' ? { lastRunId: undefined } : {})
            }
      )
    }))
    return this.view(routine.botId)
  }
  async trigger(key: string, eventId: string, text = ''): Promise<BotRoutineRun[]> {
    const timestamp = Number(botRunRequestIdSchema.parse(eventId).slice(0, 13))
    const routines = (await this.store.read()).routines.filter(
      (row) =>
        row.enabled && !row.archived && row.schedule.kind === 'event' && row.schedule.key === key
    )
    const runs: BotRoutineRun[] = []
    for (const routine of routines) {
      runs.push(
        await this.dispatcher.execute(
          routine,
          runIdFor(routine, timestamp, eventId),
          timestamp,
          'event',
          text
        )
      )
    }
    return runs
  }
  async tick(): Promise<void> {
    if (this.ticking) {
      return
    }
    this.ticking = true
    try {
      this.error = undefined
      for (const routine of (await this.store.read()).routines) {
        try {
          if (routine.lastRunId) {
            const previous = await this.store.readRun(routine.lastRunId)
            if (previous?.state === 'issued' && !this.dispatcher.isSending(previous.id)) {
              await this.store.writeRun({
                ...previous,
                state: 'unconfirmed',
                updatedAt: this.now(),
                error: 'Delivery was interrupted. Check the bot chat before allowing the next run.'
              })
            } else if (
              previous &&
              (['queued', 'submitted'].includes(previous.state) ||
                (previous.state === 'unconfirmed' && previous.messageId))
            ) {
              await this.dispatcher.reconcile(previous)
            } else if (
              previous?.state === 'prepared' &&
              (routine.enabled || previous.trigger === 'manual') &&
              !routine.archived
            ) {
              await this.dispatcher.execute(
                routine,
                previous.id,
                previous.scheduledFor,
                previous.trigger,
                '',
                true
              )
            }
          }
          if (
            !routine.enabled ||
            routine.archived ||
            routine.nextRunAt === null ||
            routine.nextRunAt > this.now()
          ) {
            continue
          }
          const preparedId = runIdFor(routine, routine.nextRunAt, 'scheduled')
          const prepared = await this.store.readRun(preparedId)
          if (prepared?.state === 'prepared') {
            await this.dispatcher.execute(
              routine,
              prepared.id,
              prepared.scheduledFor,
              'scheduled',
              '',
              true
            )
            continue
          }
          const scheduledFor =
            latestBotRoutineOccurrence(routine.schedule, this.now(), routine.createdAt) ??
            routine.nextRunAt
          await this.dispatcher.execute(
            routine,
            runIdFor(routine, scheduledFor, 'scheduled'),
            scheduledFor,
            'scheduled',
            ''
          )
        } catch (failure) {
          this.error = failure instanceof Error ? failure.message : 'A routine could not run.'
        }
      }
    } finally {
      this.ticking = false
    }
  }
}

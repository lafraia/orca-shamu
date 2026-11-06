import { randomUUID } from 'node:crypto'
import { rm, stat } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { BotRoutine } from '../../shared/bot-routines'
import { createStructuredAgentSessionOperationId } from '../../shared/agent-session/lifecycle/structured-agent-session-mutation'
import { agentJournalSubmissionKey } from '../../shared/agent-session/journal/agent-session-journal-item-key'
import { botControlFixture } from './bot-control.test-fixture'
import { BotRoutineStore } from './bot-routine-store'

describe('durable bot routine workflow', () => {
  let fixture: Awaited<ReturnType<typeof botControlFixture>>
  beforeEach(async () => {
    fixture = await botControlFixture()
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(fixture.directory, { recursive: true, force: true })
  })
  const requestId = (): string => createStructuredAgentSessionOperationId(randomUUID)
  function routine(patch: Partial<BotRoutine> = {}): BotRoutine {
    return {
      id: randomUUID(),
      botId: 'actor',
      name: 'Review',
      prompt: 'Check current sources and report here.',
      schedule: { kind: 'interval', minutes: 1 },
      enabled: true,
      archived: false,
      nextRunAt: null,
      graceMinutes: 5,
      createdAt: 0,
      updatedAt: 0,
      ...patch
    }
  }
  const sends = () => fixture.call.mock.calls.filter(([method]) => method === 'agentSession.send')

  it('saves without starting a model, then queues a due job in the bot same native chat', async () => {
    const service = fixture.service()
    const saved = await service.save(routine(), 0)
    expect(sends()).toHaveLength(0)
    fixture.advance(60_000)
    await service.tick()
    const view = await service.view('actor')
    expect(view.runs).toHaveLength(1)
    expect(view.runs[0]).toMatchObject({
      state: 'queued',
      sessionId: fixture.actor.members[0].sessionId
    })
    expect(view.runs[0]).not.toHaveProperty('prompt')
    expect(sends()[0][1]).toMatchObject({
      delivery: 'queue-if-active',
      envelope: { sessionId: fixture.actor.members[0].sessionId }
    })
    expect(view.routines[0].nextRunAt).toBeGreaterThan(fixture.now())
    expect(saved.routines[0].nextRunAt).toBe(fixture.now())
    if (process.platform !== 'win32') {
      expect(
        (await stat(new BotRoutineStore(fixture.directory).runFile(view.runs[0].id))).mode & 0o777
      ).toBe(0o600)
    }
    fixture.advance(60_000)
    await service.tick()
    expect(sends()).toHaveLength(1)
    expect((await service.view()).runs.some((run) => run.state === 'skipped_busy')).toBe(true)
  })
  it('replays a manual request once even after service restart', async () => {
    const first = fixture.service()
    const job = (await first.save(routine({ enabled: false }), 0)).routines[0]
    const id = requestId()
    await Promise.all([first.control(job.id, 'run', id), first.control(job.id, 'run', id)])
    await fixture.service().control(job.id, 'run', id)
    expect(sends()).toHaveLength(1)
    expect((await fixture.channels.read()).channels[0].members).toEqual(fixture.actor.members)
  })
  it('persists an uncertain delivery and requires review before a future occurrence', async () => {
    const service = fixture.service()
    await service.save(routine(), 0)
    const implementation = fixture.call.getMockImplementation()!
    fixture.call.mockImplementation(async (method, params) => {
      if (method === 'agentSession.send') {
        throw new Error('Reply lost after issue')
      }
      return implementation(method, params)
    })
    fixture.advance(60_000)
    await service.tick()
    expect((await service.view()).runs[0].state).toBe('unconfirmed')
    fixture.advance(60_000)
    await fixture.service().tick()
    expect(sends()).toHaveLength(1)
    const pending = (await service.view()).routines[0]
    await service.control(pending.id, 'acknowledge', requestId())
    fixture.call.mockImplementation(implementation)
    fixture.advance(60_000)
    await service.tick()
    expect(sends()).toHaveLength(2)
  })
  it('recovers a prepared job if shutdown happened before its schedule pointer advanced', async () => {
    const service = fixture.service()
    await service.save(routine(), 0)
    vi.spyOn(BotRoutineStore.prototype, 'mutate').mockRejectedValueOnce(
      new Error('Shutdown before advance')
    )
    fixture.advance(60_000)
    await service.tick()
    expect(sends()).toHaveLength(0)
    expect((await service.view()).runs[0].state).toBe('prepared')
    const reopened = fixture.service()
    await reopened.tick()
    await reopened.tick()
    expect(sends()).toHaveLength(1)
    expect((await reopened.view()).routines[0].nextRunAt).toBeGreaterThan(fixture.now())
  })
  it('skips old occurrences once after downtime and respects pause and resume', async () => {
    const service = fixture.service()
    await service.save(routine({ schedule: { kind: 'once', at: fixture.now() + 60_000 } }), 0)
    fixture.advance(60 * 60_000)
    await service.tick()
    await service.tick()
    expect(sends()).toHaveLength(0)
    expect((await service.view()).runs).toHaveLength(1)
    expect((await service.view()).runs[0].state).toBe('skipped_missed')
    const current = await service.view()
    const job = (await service.save(routine(), current.revision)).routines.find(
      (row) => row.schedule.kind === 'interval'
    )!
    await service.control(job.id, 'pause', requestId())
    fixture.advance(60_000)
    await service.tick()
    expect(sends()).toHaveLength(0)
    await service.control(job.id, 'resume', requestId())
    fixture.advance(60_000)
    await service.tick()
    expect(sends()).toHaveLength(1)
  })
  it('deduplicates named events and refuses payload changes under the same event ID', async () => {
    const service = fixture.service()
    await service.save(routine({ schedule: { kind: 'event', key: 'project.review' } }), 0)
    const id = requestId()
    await service.trigger('project.review', id, 'Issue 42 changed')
    await fixture.service().trigger('project.review', id, 'Issue 42 changed')
    expect(sends()).toHaveLength(1)
    await expect(service.trigger('project.review', id, 'Another event')).rejects.toThrow(
      'different event'
    )
  })
  it('catches up only the most recent eligible occurrence after a long shutdown', async () => {
    const service = fixture.service()
    await service.save(routine(), 0)
    fixture.advance(3 * 60 * 60_000 + 30_000)
    await service.tick()
    await service.tick()
    expect(sends()).toHaveLength(1)
    const view = await service.view()
    expect(view.runs).toHaveLength(1)
    expect(view.runs[0].scheduledFor).toBe(fixture.now() - 30_000)
    expect(view.routines[0].nextRunAt).toBeGreaterThan(fixture.now())
  })
  it('marks completion only from the native journal outcome', async () => {
    const service = fixture.service()
    const job = (await service.save(routine(), 0)).routines[0]
    const id = requestId()
    await service.control(job.id, 'run', id)
    const session = fixture.actor.members[0].sessionId
    fixture.submissions.set(session, [
      {
        clientMessageId: id,
        fence: 7,
        payloadFingerprint: 'payload',
        dispatchState: 'accepted',
        providerItemId: null,
        reason: null,
        submittedAt: fixture.now(),
        resolvedAt: fixture.now()
      }
    ])
    fixture.journals.set(session, [
      {
        itemId: 'turn',
        revision: 1,
        sequence: 2,
        observedAt: fixture.now(),
        body: {
          kind: 'turn',
          turnId: 'turn',
          state: 'completed',
          outcome: 'success',
          userItemId: agentJournalSubmissionKey(id)
        }
      }
    ])
    await service.tick()
    expect((await service.view()).runs[0].state).toBe('completed')
  })
  it('follows a queued draft into its distinct native handoff submission', async () => {
    const service = fixture.service()
    const job = (await service.save(routine(), 0)).routines[0]
    const draftId = requestId()
    const handoffId = requestId()
    await service.control(job.id, 'run', draftId)
    const session = fixture.actor.members[0].sessionId
    fixture.submissions.set(session, [
      {
        clientMessageId: handoffId,
        queuedMessageId: draftId,
        fence: 7,
        payloadFingerprint: 'handoff',
        dispatchState: 'accepted',
        providerItemId: null,
        reason: null,
        submittedAt: fixture.now(),
        resolvedAt: fixture.now()
      }
    ])
    fixture.journals.set(session, [
      {
        itemId: 'turn',
        revision: 1,
        sequence: 2,
        observedAt: fixture.now(),
        body: {
          kind: 'turn',
          turnId: 'turn',
          state: 'completed',
          outcome: 'success',
          userItemId: agentJournalSubmissionKey(handoffId)
        }
      }
    ])
    await service.tick()
    expect((await service.view()).runs[0].state).toBe('completed')
    expect(sends()).toHaveLength(1)
  })
  it('requires review after a confirmed queued card disappears without a handoff', async () => {
    const service = fixture.service()
    const job = (await service.save(routine(), 0)).routines[0]
    await service.control(job.id, 'run', requestId())
    const implementation = fixture.call.getMockImplementation()!
    fixture.call.mockImplementation(async (method, params) => {
      const result = await implementation(method, params)
      if (method !== 'agentSession.history') {
        return result
      }
      const history = z.object({ page: z.record(z.string(), z.unknown()) }).parse(result)
      return { ok: true, page: { ...history.page, queuedMessages: [] } }
    })
    await service.tick()
    expect((await service.view()).runs[0].state).toBe('unconfirmed')
    fixture.advance(60_000)
    await service.tick()
    expect(sends()).toHaveLength(1)
  })
})

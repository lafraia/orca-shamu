import { readFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  botRoutineRunSchema,
  botRoutinesSnapshotSchema,
  type BotRoutineRun,
  type BotRoutinesSnapshot
} from '../../shared/bot-routines'
import { botRunRequestIdSchema } from '../../shared/bot-commands'
import { withSidecarSnapshotQueue, writeSidecarSnapshot } from '../filesystem/sidecar-snapshot-file'

export class BotRoutineStore {
  readonly file: string
  readonly runsDirectory: string
  constructor(directory: string) {
    this.file = join(directory, 'bot-routines.json')
    this.runsDirectory = join(directory, 'bot-routine-runs')
  }
  async read(): Promise<BotRoutinesSnapshot> {
    try {
      return botRoutinesSnapshotSchema.parse(JSON.parse(await readFile(this.file, 'utf8')))
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return { version: 1, revision: 0, routines: [] }
      }
      throw error
    }
  }
  mutate(
    update: (state: BotRoutinesSnapshot) => BotRoutinesSnapshot
  ): Promise<BotRoutinesSnapshot> {
    return withSidecarSnapshotQueue(this.file, async () => {
      const current = await this.read()
      const changed = update(current)
      if (changed === current) {
        return current
      }
      const next = botRoutinesSnapshotSchema.parse({ ...changed, revision: current.revision + 1 })
      if (new Set(next.routines.map((row) => row.id)).size !== next.routines.length) {
        throw new Error('Routine identifiers must be unique.')
      }
      await writeSidecarSnapshot(this.file, next, 0o600)
      return next
    })
  }
  runFile(id: string): string {
    return join(this.runsDirectory, `${botRunRequestIdSchema.parse(id)}.json`)
  }
  async readRun(id: string): Promise<BotRoutineRun | null> {
    try {
      return botRoutineRunSchema.parse(JSON.parse(await readFile(this.runFile(id), 'utf8')))
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null
      }
      throw error
    }
  }
  async writeRun(run: BotRoutineRun): Promise<void> {
    await mkdir(this.runsDirectory, { recursive: true, mode: 0o700 })
    await writeSidecarSnapshot(this.runFile(run.id), botRoutineRunSchema.parse(run), 0o600)
  }
  async listRuns(botId?: string): Promise<BotRoutineRun[]> {
    let files: string[]
    try {
      files = await readdir(this.runsDirectory)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return []
      }
      throw error
    }
    const runs: BotRoutineRun[] = []
    for (const file of files
      .filter((file) => /^\d{13}-[a-f0-9]{32}\.json$/.test(file))
      .toSorted()
      .toReversed()) {
      const run = await this.readRun(file.slice(0, -5))
      if (run && (!botId || run.botId === botId)) {
        runs.push(run)
      }
      if (runs.length >= 100) {
        break
      }
    }
    return runs
  }
}

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { botReadMarkSchema, type BotReadMark } from '../../shared/bot-unread'
import { withSidecarSnapshotQueue, writeSidecarSnapshot } from '../filesystem/sidecar-snapshot-file'

const schema = z
  .object({
    version: z.literal(1),
    startedAt: z.number(),
    marks: z.array(botReadMarkSchema).max(1000)
  })
  .strict()
export const botReadKey = (mark: Omit<BotReadMark, 'cursor'>): string =>
  JSON.stringify([mark.botId, mark.environmentId, mark.sessionId])
export class BotReadStore {
  readonly file: string
  private readonly startedAt = Date.now()
  constructor(directory: string) {
    this.file = join(directory, 'bot-read-state.json')
  }
  async read(): Promise<z.infer<typeof schema>> {
    try {
      return schema.parse(JSON.parse(await readFile(this.file, 'utf8')))
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return { version: 1, startedAt: this.startedAt, marks: [] }
      }
      throw new Error('Could not read bot read receipts. The saved file has not been changed.')
    }
  }
  write(mark: BotReadMark): Promise<void> {
    return withSidecarSnapshotQueue(this.file, async () => {
      const current = await this.read()
      const key = botReadKey(mark)
      const previous = current.marks.find((row) => botReadKey(row) === key)
      if (
        previous?.cursor.epoch === mark.cursor.epoch &&
        previous.cursor.sequence >= mark.cursor.sequence
      ) {
        return
      }
      const next = schema.parse({
        version: 1,
        startedAt: current.startedAt,
        marks: [...current.marks.filter((row) => botReadKey(row) !== key), mark]
      })
      await writeSidecarSnapshot(this.file, next, 0o600)
    })
  }
}

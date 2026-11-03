import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  emptyProjectChannels,
  projectChannelsSnapshotSchema,
  type ProjectChannelsSnapshot
} from '../shared/project-channels'
import { withSidecarSnapshotQueue, writeSidecarSnapshot } from './sidecar-snapshot-file'

export class ProjectChannelsStore {
  private readonly file: string

  constructor(directory: string) {
    this.file = join(directory, 'project-channels.json')
  }

  async read(): Promise<ProjectChannelsSnapshot> {
    let contents: string
    try {
      contents = await readFile(this.file, 'utf8')
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return emptyProjectChannels()
      }
      throw error
    }
    return projectChannelsSnapshotSchema.parse(JSON.parse(contents))
  }

  async write(input: unknown): Promise<ProjectChannelsSnapshot> {
    const snapshot = projectChannelsSnapshotSchema.parse(input)
    return withSidecarSnapshotQueue(this.file, async () => {
      const current = await this.read()
      if (snapshot.revision !== current.revision) {
        throw new Error('Projects changed in another window. Reload projects before saving.')
      }
      const next = { ...snapshot, revision: current.revision + 1 }
      await writeSidecarSnapshot(this.file, next, 0o600)
      return next
    })
  }
}

// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { channelFixture } from '../../../../shared/project-channels.test-fixture'
import type { ProjectChannelsSnapshot } from '../../../../shared/project-channels'
import { checkpointProjectDrafts, recoverProjectDrafts } from './project-channel-draft-checkpoint'

describe('reload before the deferred draft save', () => {
  beforeEach(() => window.localStorage.clear())
  const snapshot = (): ProjectChannelsSnapshot => ({
    version: 1,
    revision: 1,
    channels: [channelFixture()]
  })

  it('recovers the last text even if the file save has not fired yet', () => {
    const file = snapshot()
    checkpointProjectDrafts(file, { project: 'Typed just before reload' })
    expect(recoverProjectDrafts(structuredClone(file)).project).toBe('Typed just before reload')
    expect(file.channels[0].draft).toBe('')
  })

  it('does not replace a newer draft saved by another window', () => {
    const file = snapshot()
    checkpointProjectDrafts(file, { project: 'Stale local draft' })
    file.channels[0].draft = 'Newer saved draft'
    file.revision += 1
    expect(recoverProjectDrafts(file).project).toBe('Newer saved draft')
  })

  it('does not resurrect text consumed by a sent message', () => {
    const file = snapshot()
    file.channels[0].draft = 'SEND ONCE'
    checkpointProjectDrafts(file, { project: '' })
    file.channels[0].draft = ''
    expect(recoverProjectDrafts(file).project).toBe('')
  })
})

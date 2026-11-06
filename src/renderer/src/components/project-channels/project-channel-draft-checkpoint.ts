import { z } from 'zod'
import type { ProjectChannelsSnapshot } from '../../../../shared/project-channels'

const KEY = 'orca.project-channel-drafts.v1'
const checkpointSchema = z.record(
  z.string(),
  z.object({ base: z.string(), text: z.string().max(100_000) })
)

export function checkpointProjectDrafts(
  snapshot: ProjectChannelsSnapshot,
  drafts: Record<string, string>
): void {
  const pending = Object.fromEntries(
    snapshot.channels.flatMap((channel) => {
      const text = drafts[channel.id]
      return text !== undefined && text !== channel.draft
        ? [[channel.id, { base: channel.draft, text }]]
        : []
    })
  )
  try {
    window.localStorage.setItem(KEY, JSON.stringify(pending))
  } catch {
    /* The durable draft remains in the profile sidecar. */
  }
}

export function recoverProjectDrafts(snapshot: ProjectChannelsSnapshot): Record<string, string> {
  let parsed: z.infer<typeof checkpointSchema> = {}
  try {
    const result = checkpointSchema.safeParse(JSON.parse(window.localStorage.getItem(KEY) ?? '{}'))
    if (result.success) {
      parsed = result.data
    }
  } catch {
    /* An invalid checkpoint cannot replace a durable draft. */
  }
  return Object.fromEntries(
    snapshot.channels.map((channel) => {
      const draft = parsed[channel.id]
      return [channel.id, draft?.base === channel.draft ? draft.text : channel.draft]
    })
  )
}

import { z } from 'zod'
import { parseRoutableExecutionHostId, type ExecutionHostId } from '../execution-host'

const text = z.string().min(1).max(4096)
export const nativeChatResourceReferenceSchema = z
  .object({
    kind: z.enum(['workspace', 'project', 'issue']),
    id: text,
    hostId: z.custom<ExecutionHostId>(
      (value) => typeof value === 'string' && Boolean(parseRoutableExecutionHostId(value))
    ),
    label: text,
    description: z.string().max(8192),
    path: text.optional(),
    url: z
      .url()
      .refine((value) => /^https?:\/\//.test(value))
      .optional(),
    projectKind: z.enum(['repo', 'group']).optional()
  })
  .superRefine((value, context) => {
    if (value.kind === 'issue' && !value.url) {
      context.addIssue({ code: 'custom', message: 'An issue reference needs its original URL.' })
    }
  })
export type NativeChatResourceReference = z.infer<typeof nativeChatResourceReferenceSchema>
const PREFIX = '#orca-shamu-reference/'
export const nativeChatResourceHref = (reference: NativeChatResourceReference): string =>
  `${PREFIX}${encodeURIComponent(JSON.stringify(reference))}`
export function readNativeChatResourceHref(
  href: string | undefined
): NativeChatResourceReference | null {
  if (!href?.startsWith(PREFIX) || href.length > 40_000) {
    return null
  }
  try {
    const result = nativeChatResourceReferenceSchema.safeParse(
      JSON.parse(decodeURIComponent(href.slice(PREFIX.length)))
    )
    return result.success ? result.data : null
  } catch {
    return null
  }
}
export function nativeChatResourceToken(reference: NativeChatResourceReference): string {
  const label = reference.label.replace(/[\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ')
  const title =
    `${reference.kind}; host: ${reference.hostId}; ${reference.url ? `URL: ${reference.url}` : `directory: ${reference.path ?? '(project group)'}`}`
      .replace(/[\\"]/g, '\\$&')
      .replace(/[\r\n]/g, ' ')
  return `[@${label}](${nativeChatResourceHref(reference)} "${title}")`
}

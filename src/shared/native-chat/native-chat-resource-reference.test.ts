import { describe, expect, it } from 'vitest'
import {
  nativeChatResourceHref,
  nativeChatResourceToken,
  readNativeChatResourceHref,
  type NativeChatResourceReference
} from './native-chat-resource-reference'

const reference: NativeChatResourceReference = {
  kind: 'workspace',
  id: 'folder:launch',
  hostId: 'runtime:primary',
  label: 'CEO [Launch]',
  description: 'Primary · launch',
  path: '/Projects/Launch Plan'
}
describe('native chat resource references', () => {
  it('retains identity and host in a shareable reference and a readable provider prompt', () => {
    expect(readNativeChatResourceHref(nativeChatResourceHref(reference))).toEqual(reference)
    expect(nativeChatResourceToken(reference)).toContain('@CEO \\[Launch\\]')
    expect(nativeChatResourceToken(reference)).toContain('directory: /Projects/Launch Plan')
    expect(nativeChatResourceToken(reference)).toContain('host: runtime:primary')
    const issue: NativeChatResourceReference = {
      ...reference,
      kind: 'issue',
      id: '42',
      label: '#42 Launch',
      url: 'https://github.com/example/launch/issues/42'
    }
    expect(nativeChatResourceToken(issue)).toContain(
      'URL: https://github.com/example/launch/issues/42'
    )
  })
  it('rejects malformed, oversized, unowned or executable issue references', () => {
    expect(readNativeChatResourceHref('#orca-shamu-reference/%not-json')).toBeNull()
    expect(readNativeChatResourceHref(`#orca-shamu-reference/${'a'.repeat(40_001)}`)).toBeNull()
    expect(
      readNativeChatResourceHref(
        nativeChatResourceHref({ ...reference, hostId: 'runtime:unresolved-owner' })
      )
    ).toBeNull()
    const href = (value: unknown) =>
      `#orca-shamu-reference/${encodeURIComponent(JSON.stringify(value))}`
    expect(readNativeChatResourceHref(href({ ...reference, kind: 'issue' }))).toBeNull()
    expect(
      readNativeChatResourceHref(href({ ...reference, kind: 'issue', url: 'javascript:alert(1)' }))
    ).toBeNull()
    expect(readNativeChatResourceHref('https://example.com/#orca-shamu-reference/test')).toBeNull()
  })
})

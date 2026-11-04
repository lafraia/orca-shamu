import { describe, expect, it } from 'vitest'
import { parseShamuLiveRenderer, shamuLiveProof, verifyShamuLiveProof } from './shamu-live-renderer'

const token = 'a'.repeat(64)
const challenge = 'b'.repeat(64)

describe('Shamu live renderer admission', () => {
  it('does not opt in ordinary Orca or an unconfigured Shamu', () => {
    expect(
      parseShamuLiveRenderer(false, { ORCA_SHAMU_RENDERER_URL: 'https://example.com' })
    ).toBeNull()
    expect(parseShamuLiveRenderer(true, {})).toBeNull()
  })

  it('admits only the literal loopback origin and a private launch token', () => {
    const env = { ORCA_SHAMU_RENDERER_URL: 'http://127.0.0.1:41234/', ORCA_SHAMU_LIVE_TOKEN: token }
    expect(parseShamuLiveRenderer(true, env)).toEqual({ url: env.ORCA_SHAMU_RENDERER_URL, token })
    expect(() => parseShamuLiveRenderer(true, { ...env, ORCA_SHAMU_LIVE_TOKEN: '' })).toThrow(
      'Invalid Shamu'
    )
  })

  it.each([
    'http://localhost:41234/',
    'http://127.1:41234/',
    'http://2130706433:41234/',
    'http://127.0.0.1.evil.test:41234/',
    'http://192.168.0.1:41234/',
    'https://127.0.0.1:41234/',
    'http://user@127.0.0.1:41234/',
    'http://127.0.0.1:65536/',
    'http://127.0.0.1:41234/page',
    'http://127.0.0.1:41234/?token=public',
    'http://127.0.0.1:41234/#fragment'
  ])('refuses %s', (url) => {
    expect(() =>
      parseShamuLiveRenderer(true, { ORCA_SHAMU_RENDERER_URL: url, ORCA_SHAMU_LIVE_TOKEN: token })
    ).toThrow('Invalid Shamu')
  })

  it('requires proof of the private launch token for each fresh challenge', () => {
    const proof = shamuLiveProof(token, challenge)
    expect(verifyShamuLiveProof(token, challenge, proof)).toBe(true)
    expect(verifyShamuLiveProof(token, 'c'.repeat(64), proof)).toBe(false)
    expect(verifyShamuLiveProof('d'.repeat(64), challenge, proof)).toBe(false)
    expect(verifyShamuLiveProof(token, challenge, undefined)).toBe(false)
    expect(verifyShamuLiveProof(token, challenge, 'short')).toBe(false)
  })
})

import { createHmac, timingSafeEqual } from 'node:crypto'

export const SHAMU_LIVE_HEALTH_PATH = '/.well-known/orca-shamu-live'
export const SHAMU_LIVE_CHALLENGE_HEADER = 'x-orca-shamu-live-challenge'
export const SHAMU_LIVE_PROOF_HEADER = 'x-orca-shamu-live-proof'
const HEX_256 = /^[a-f0-9]{64}$/

export type ShamuLiveRenderer = { url: string; token: string }

export function parseShamuLiveRenderer(
  enabled: boolean,
  env: Record<string, string | undefined>
): ShamuLiveRenderer | null {
  if (!enabled || (!env.ORCA_SHAMU_RENDERER_URL && !env.ORCA_SHAMU_LIVE_TOKEN)) {
    return null
  }
  const url = env.ORCA_SHAMU_RENDERER_URL ?? ''
  const token = env.ORCA_SHAMU_LIVE_TOKEN ?? ''
  const match = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/$/.exec(url)
  if (!match || Number(match[1]) > 65535 || !HEX_256.test(token)) {
    throw new Error('Invalid Shamu live renderer configuration.')
  }
  return { url, token }
}

export function shamuLiveProof(token: string, challenge: string): string {
  return createHmac('sha256', Buffer.from(token, 'hex')).update(challenge).digest('hex')
}

export function verifyShamuLiveProof(token: string, challenge: string, proof: unknown): boolean {
  return (
    typeof proof === 'string' &&
    HEX_256.test(proof) &&
    timingSafeEqual(Buffer.from(proof, 'hex'), Buffer.from(shamuLiveProof(token, challenge), 'hex'))
  )
}

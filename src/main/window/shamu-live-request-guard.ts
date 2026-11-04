import { randomBytes } from 'node:crypto'
import {
  SHAMU_LIVE_CHALLENGE_HEADER,
  SHAMU_LIVE_PROOF_HEADER,
  verifyShamuLiveProof,
  type ShamuLiveRenderer
} from '../../shared/shamu-live-renderer'

type RequestIdentity = {
  id: number
  url: string
  resourceType: string
  webContentsId?: number
}
type Guard = {
  windows: Map<number, ShamuLiveRenderer>
  requests: Map<number, { webContentsId: number; challenge: string }>
}
const guards = new WeakMap<object, Guard>()

export function registerShamuLiveWindow(
  session: object,
  webContentsId: number,
  live: ShamuLiveRenderer
): () => void {
  let guard = guards.get(session)
  if (!guard) {
    guard = { windows: new Map(), requests: new Map() }
    guards.set(session, guard)
  }
  guard.windows.set(webContentsId, live)
  const registered = guard
  return () => {
    if (registered.windows.get(webContentsId) !== live) {
      return
    }
    registered.windows.delete(webContentsId)
    for (const [id, request] of registered.requests) {
      if (request.webContentsId === webContentsId) {
        registered.requests.delete(id)
      }
    }
    if (registered.windows.size === 0) {
      guards.delete(session)
    }
  }
}

export function hasShamuLiveWindows(session: object): boolean {
  return Boolean(guards.get(session)?.windows.size)
}

function requestOwner(session: object, details: RequestIdentity) {
  const guard = guards.get(session)
  const live =
    details.webContentsId === undefined ? undefined : guard?.windows.get(details.webContentsId)
  return live && guard ? { guard, live } : null
}

function isLiveOrigin(details: RequestIdentity, live: ShamuLiveRenderer): boolean {
  try {
    return new URL(details.url).origin === new URL(live.url).origin
  } catch {
    return false
  }
}

export function shamuLiveRequestHeaders(
  session: object,
  details: RequestIdentity,
  headers: Record<string, string>
): Record<string, string> {
  const owner = requestOwner(session, details)
  if (!owner || details.resourceType === 'webSocket' || !isLiveOrigin(details, owner.live)) {
    return headers
  }
  const challenge = randomBytes(32).toString('hex')
  owner.guard.requests.set(details.id, { webContentsId: details.webContentsId!, challenge })
  const next = Object.fromEntries(
    Object.entries(headers).filter(([key]) => key.toLowerCase() !== SHAMU_LIVE_CHALLENGE_HEADER)
  )
  next[SHAMU_LIVE_CHALLENGE_HEADER] = challenge
  return next
}

export function shamuLiveResponseDecision(
  session: object,
  details: RequestIdentity & { responseHeaders?: Record<string, string[]> }
): Electron.HeadersReceivedResponse | null {
  const owner = requestOwner(session, details)
  if (!owner || details.resourceType === 'webSocket') {
    return null
  }
  if (!isLiveOrigin(details, owner.live)) {
    return ['mainFrame', 'script', 'stylesheet'].includes(details.resourceType)
      ? { cancel: true }
      : null
  }
  const pending = owner.guard.requests.get(details.id)
  owner.guard.requests.delete(details.id)
  const proof = Object.entries(details.responseHeaders ?? {}).find(
    ([key]) => key.toLowerCase() === SHAMU_LIVE_PROOF_HEADER
  )?.[1][0]
  const verified =
    pending &&
    pending.webContentsId === details.webContentsId &&
    verifyShamuLiveProof(owner.live.token, pending.challenge, proof)
  if (!verified) {
    console.warn('[shamu-live] Refused an unverified renderer response.', {
      resourceType: details.resourceType,
      pending: Boolean(pending),
      proof: typeof proof === 'string'
    })
  }
  return verified ? null : { cancel: true }
}

export function finishShamuLiveRequest(session: object, requestId: number): void {
  guards.get(session)?.requests.delete(requestId)
}

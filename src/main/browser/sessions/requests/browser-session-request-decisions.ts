import {
  finishShamuLiveRequest,
  hasShamuLiveWindows,
  registerShamuLiveWindow,
  shamuLiveResponseDecision
} from '../../../window/shamu-live-request-guard'
import type { ShamuLiveRenderer } from '../../../../shared/shamu-live-renderer'
import {
  reportBrowserSessionWebRequest,
  type ObservedWebRequestDetails
} from './browser-session-web-request-observer'

/**
 * Electron allows one session.webRequest listener per event, so request decisions owned by other
 * layers (extension content blocking) run inside Orca's own handlers: the certificate guard's
 * onBeforeRequest, the user agent policy's onBeforeSendHeaders and the onHeadersReceived installed
 * here. Each hook is called only after Orca's own policy for that event has run.
 */
export type BrowserSessionRequestDecider = {
  /** Null lets the request through; a promise holds it until the decision is known. */
  beforeRequest: (
    session: Electron.Session,
    details: Electron.OnBeforeRequestListenerDetails
  ) => Electron.CallbackResponse | Promise<Electron.CallbackResponse> | null
  /** Returns the headers to send: `headers` itself, or a modified copy. */
  beforeSendHeaders: (
    session: Electron.Session,
    details: Electron.OnBeforeSendHeadersListenerDetails,
    headers: Record<string, string>
  ) => Record<string, string>
  headersReceived: (
    session: Electron.Session,
    details: Electron.OnHeadersReceivedListenerDetails
  ) => Electron.HeadersReceivedResponse | null
  requestFinished?: (
    session: Electron.Session,
    event: 'onCompleted' | 'onErrorOccurred',
    details: ObservedWebRequestDetails
  ) => void
  requestLifecycleStopped?: (session: Electron.Session) => void
}

let decider: BrowserSessionRequestDecider | null = null

export function setBrowserSessionRequestDecider(next: BrowserSessionRequestDecider | null): void {
  decider = next
}

function warn(event: string, error: unknown): void {
  console.warn(`[browser] request decision for ${event} failed:`, error)
}

const blockedMainFrameWatchers = new Map<number, (url: string) => void>()

/**
 * Calls `onBlocked` when the decider (an extension) cancels this webContents' main-frame load.
 * A webview guest then fails without committing an error page or emitting any load failure.
 */
export function watchDecisionBlockedMainFrames(
  webContentsId: number,
  onBlocked: (url: string) => void
): () => void {
  blockedMainFrameWatchers.set(webContentsId, onBlocked)
  return () => {
    if (blockedMainFrameWatchers.get(webContentsId) === onBlocked) {
      blockedMainFrameWatchers.delete(webContentsId)
    }
  }
}

function noteBlockedMainFrame(
  details: Electron.OnBeforeRequestListenerDetails,
  response: Electron.CallbackResponse
): void {
  if (
    response.cancel &&
    details.resourceType === 'mainFrame' &&
    details.webContentsId !== undefined
  ) {
    blockedMainFrameWatchers.get(details.webContentsId)?.(details.url)
  }
}

/** Answers an onBeforeRequest that Orca's own policy let through. */
export function answerBrowserSessionBeforeRequest(
  session: Electron.Session,
  details: Electron.OnBeforeRequestListenerDetails,
  callback: (response: Electron.CallbackResponse) => void
): void {
  const answer = (response: Electron.CallbackResponse): void => {
    noteBlockedMainFrame(details, response)
    callback(response)
  }
  let decision: ReturnType<BrowserSessionRequestDecider['beforeRequest']> = null
  try {
    decision = decider?.beforeRequest(session, details) ?? null
  } catch (error) {
    warn('onBeforeRequest', error)
  }
  if (decision === null) {
    callback({})
  } else if ('then' in decision) {
    decision.then(answer, (error: unknown) => {
      warn('onBeforeRequest', error)
      callback({})
    })
  } else {
    answer(decision)
  }
}

export function decideBrowserSessionRequestHeaders(
  session: Electron.Session,
  details: Electron.OnBeforeSendHeadersListenerDetails,
  headers: Record<string, string>
): Record<string, string> {
  try {
    return decider?.beforeSendHeaders(session, details, headers) ?? headers
  } catch (error) {
    warn('onBeforeSendHeaders', error)
    return headers
  }
}

const headersReceivedSessions = new WeakSet<Electron.Session>()
const requestLifecycleSessions = new WeakSet<Electron.Session>()
const browserHeadersReceivedSessions = new WeakSet<Electron.Session>()
const browserRequestLifecycleSessions = new WeakSet<Electron.Session>()

/** Shared completion handlers also release enforcement state for cache hits and failed requests. */
export function installBrowserSessionRequestLifecycle(session: Electron.Session): void {
  browserRequestLifecycleSessions.add(session)
  ensureBrowserSessionRequestLifecycle(session)
}

function ensureBrowserSessionRequestLifecycle(session: Electron.Session): void {
  if (requestLifecycleSessions.has(session)) {
    return
  }
  requestLifecycleSessions.add(session)
  const finished = (
    event: 'onCompleted' | 'onErrorOccurred',
    details: ObservedWebRequestDetails
  ): void => {
    finishShamuLiveRequest(session, details.id)
    reportBrowserSessionWebRequest(session, event, details)
    try {
      decider?.requestFinished?.(session, event, details)
    } catch (error) {
      warn(event, error)
    }
  }
  const filter = { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }
  session.webRequest.onCompleted(filter, (details) => finished('onCompleted', details))
  session.webRequest.onErrorOccurred(filter, (details) => finished('onErrorOccurred', details))
}

export function removeBrowserSessionRequestLifecycle(session: Electron.Session): void {
  browserRequestLifecycleSessions.delete(session)
  removeUnusedBrowserSessionRequestLifecycle(session)
}

function removeUnusedBrowserSessionRequestLifecycle(session: Electron.Session): void {
  if (browserRequestLifecycleSessions.has(session) || hasShamuLiveWindows(session)) {
    return
  }
  if (requestLifecycleSessions.delete(session)) {
    session.webRequest.onCompleted(null)
    session.webRequest.onErrorOccurred(null)
    decider?.requestLifecycleStopped?.(session)
  }
}

/**
 * The session's one onHeadersReceived, installed on first need (an extension that observes
 * webRequest, or content blocking that acts on responses) and removed when extensions turn off.
 */
export function installBrowserSessionHeadersReceived(session: Electron.Session): void {
  browserHeadersReceivedSessions.add(session)
  ensureBrowserSessionHeadersReceived(session)
}

function ensureBrowserSessionHeadersReceived(session: Electron.Session): void {
  if (headersReceivedSessions.has(session)) {
    return
  }
  headersReceivedSessions.add(session)
  session.webRequest.onHeadersReceived(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, callback) => {
      const liveDecision = shamuLiveResponseDecision(session, details)
      if (liveDecision?.cancel) {
        callback(liveDecision)
        return
      }
      reportBrowserSessionWebRequest(session, 'onHeadersReceived', details)
      let response: Electron.HeadersReceivedResponse | null = null
      try {
        response = decider?.headersReceived(session, details) ?? null
      } catch (error) {
        warn('onHeadersReceived', error)
      }
      callback(response ?? {})
    }
  )
}

/** Every response otherwise waits on main, so drop the handler once nothing needs it. */
export function removeBrowserSessionHeadersReceived(session: Electron.Session): void {
  browserHeadersReceivedSessions.delete(session)
  removeUnusedBrowserSessionHeadersReceived(session)
}

function removeUnusedBrowserSessionHeadersReceived(session: Electron.Session): void {
  if (browserHeadersReceivedSessions.has(session) || hasShamuLiveWindows(session)) {
    return
  }
  if (headersReceivedSessions.delete(session)) {
    session.webRequest.onHeadersReceived(null)
  }
}

export function registerShamuLiveBrowserSession(
  session: Electron.Session,
  webContentsId: number,
  live: ShamuLiveRenderer
): () => void {
  const unregister = registerShamuLiveWindow(session, webContentsId, live)
  ensureBrowserSessionHeadersReceived(session)
  ensureBrowserSessionRequestLifecycle(session)
  return () => {
    unregister()
    removeUnusedBrowserSessionHeadersReceived(session)
    removeUnusedBrowserSessionRequestLifecycle(session)
  }
}

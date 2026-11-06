import { afterEach, expect, it } from 'vitest'
import {
  installBrowserSessionHeadersReceived,
  installBrowserSessionRequestLifecycle,
  registerShamuLiveBrowserSession,
  removeBrowserSessionHeadersReceived,
  removeBrowserSessionRequestLifecycle,
  setBrowserSessionRequestDecider
} from './browser-session-request-decisions'
import type { ObservedWebRequestDetails } from './browser-session-web-request-observer'
import { shamuLiveRequestHeaders } from '../../../window/shamu-live-request-guard'
import {
  SHAMU_LIVE_CHALLENGE_HEADER,
  SHAMU_LIVE_PROOF_HEADER,
  shamuLiveProof
} from '../../../../shared/shamu-live-renderer'

type HeadersListener = (
  details: Electron.OnHeadersReceivedListenerDetails,
  callback: (response: Electron.HeadersReceivedResponse) => void
) => void
type FinishedListener = (details: ObservedWebRequestDetails) => void

function nativeSessionFixture() {
  let headers: HeadersListener | null = null
  let completed: FinishedListener | null = null
  let failed: FinishedListener | null = null
  const nativeSession = {
    getUserAgent: () => 'Shamu live fixture',
    webRequest: {
      onHeadersReceived(_filter: Electron.WebRequestFilter | null, listener?: HeadersListener) {
        headers = listener ?? null
      },
      onCompleted(_filter: Electron.WebRequestFilter | null, listener?: FinishedListener) {
        completed = listener ?? null
      },
      onErrorOccurred(_filter: Electron.WebRequestFilter | null, listener?: FinishedListener) {
        failed = listener ?? null
      }
    }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: This native boundary uses only getUserAgent and the three modeled webRequest hooks.
  const session = nativeSession as unknown as Electron.Session
  return {
    session,
    respond(details: Electron.OnHeadersReceivedListenerDetails) {
      let response: Electron.HeadersReceivedResponse | undefined
      headers?.(details, (next) => {
        response = next
      })
      return response
    },
    complete(details: ObservedWebRequestDetails) {
      completed?.(details)
    },
    activeHooks() {
      return { headers: headers !== null, completed: completed !== null, failed: failed !== null }
    }
  }
}

const live = { url: 'http://127.0.0.1:41234/', token: 'a'.repeat(64) }
const request: Electron.OnHeadersReceivedListenerDetails = {
  id: 1,
  url: live.url,
  webContentsId: 10,
  resourceType: 'mainFrame',
  method: 'GET',
  referrer: '',
  timestamp: 0,
  statusCode: 200,
  statusLine: 'HTTP/1.1 200 OK',
  responseHeaders: {}
}

afterEach(() => setBrowserSessionRequestDecider(null))

it('keeps live proof cleanup after browser hooks are disabled and retires the last live owner', () => {
  const native = nativeSessionFixture()
  const closeFirst = registerShamuLiveBrowserSession(native.session, 10, live)
  const closeLast = registerShamuLiveBrowserSession(native.session, 11, live)
  removeBrowserSessionHeadersReceived(native.session)
  removeBrowserSessionRequestLifecycle(native.session)

  const sent = shamuLiveRequestHeaders(native.session, request, {})
  native.complete(request)
  expect(
    native.respond({
      ...request,
      responseHeaders: {
        [SHAMU_LIVE_PROOF_HEADER]: [shamuLiveProof(live.token, sent[SHAMU_LIVE_CHALLENGE_HEADER])]
      }
    })
  ).toEqual({ cancel: true })

  closeFirst()
  expect(native.respond({ ...request, id: 2, webContentsId: 11 })).toEqual({ cancel: true })
  closeLast()
  expect(native.activeHooks()).toEqual({ headers: false, completed: false, failed: false })
})

it('preserves active browser decisions and completion delivery after live reload ends', () => {
  const native = nativeSessionFixture()
  let finishedUrl = ''
  setBrowserSessionRequestDecider({
    beforeRequest: () => null,
    beforeSendHeaders: (_session, _details, headers) => headers,
    headersReceived: () => ({ responseHeaders: { 'X-Extension': ['active'] } }),
    requestFinished: (_session, _event, details) => {
      finishedUrl = details.url
    }
  })
  installBrowserSessionHeadersReceived(native.session)
  installBrowserSessionRequestLifecycle(native.session)
  const closeLive = registerShamuLiveBrowserSession(native.session, 10, live)
  closeLive()

  const ordinary = { ...request, webContentsId: 99, url: 'https://browser.example/page' }
  expect(native.respond(ordinary)).toEqual({ responseHeaders: { 'X-Extension': ['active'] } })
  native.complete(ordinary)
  expect(finishedUrl).toBe('https://browser.example/page')
  removeBrowserSessionHeadersReceived(native.session)
  removeBrowserSessionRequestLifecycle(native.session)
  expect(native.activeHooks()).toEqual({ headers: false, completed: false, failed: false })
})

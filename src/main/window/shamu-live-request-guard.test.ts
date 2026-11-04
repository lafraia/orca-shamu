import { expect, it } from 'vitest'
import {
  finishShamuLiveRequest,
  hasShamuLiveWindows,
  registerShamuLiveWindow,
  shamuLiveRequestHeaders,
  shamuLiveResponseDecision
} from './shamu-live-request-guard'
import {
  SHAMU_LIVE_CHALLENGE_HEADER,
  SHAMU_LIVE_PROOF_HEADER,
  shamuLiveProof
} from '../../shared/shamu-live-renderer'

const live = { url: 'http://127.0.0.1:41234/', token: 'a'.repeat(64) }
const documentRequest = { id: 1, url: live.url, webContentsId: 10, resourceType: 'mainFrame' }

it('authenticates each native reload response and refuses replay from a replacement server', () => {
  const session = {}
  registerShamuLiveWindow(session, 10, live)
  const initial = shamuLiveRequestHeaders(session, documentRequest, {})
  const proof = shamuLiveProof(live.token, initial[SHAMU_LIVE_CHALLENGE_HEADER])
  expect(
    shamuLiveResponseDecision(session, {
      ...documentRequest,
      responseHeaders: { [SHAMU_LIVE_PROOF_HEADER]: [proof] }
    })
  ).toBeNull()

  const reload = shamuLiveRequestHeaders(session, documentRequest, {})
  expect(reload[SHAMU_LIVE_CHALLENGE_HEADER]).not.toBe(initial[SHAMU_LIVE_CHALLENGE_HEADER])
  expect(
    shamuLiveResponseDecision(session, {
      ...documentRequest,
      responseHeaders: { [SHAMU_LIVE_PROOF_HEADER]: [proof] }
    })
  ).toEqual({ cancel: true })
  shamuLiveRequestHeaders(session, documentRequest, {})
  expect(shamuLiveResponseDecision(session, { ...documentRequest, responseHeaders: {} })).toEqual({
    cancel: true
  })
})

it('protects lazy modules and HMR scripts as well as the main document', () => {
  const session = {}
  registerShamuLiveWindow(session, 10, live)
  const request = { ...documentRequest, resourceType: 'script', url: `${live.url}src/main.tsx` }
  const headers = shamuLiveRequestHeaders(session, request, { existing: 'kept' })
  expect(headers.existing).toBe('kept')
  expect(Object.values(headers)).not.toContain(live.token)
  expect(shamuLiveResponseDecision(session, { ...request, responseHeaders: {} })).toEqual({
    cancel: true
  })
})

it('blocks cross-origin document redirects without changing ordinary guests or external images', () => {
  const session = {}
  registerShamuLiveWindow(session, 10, live)
  expect(
    shamuLiveResponseDecision(session, { ...documentRequest, url: 'https://example.com' })
  ).toEqual({ cancel: true })
  expect(
    shamuLiveResponseDecision(session, {
      ...documentRequest,
      url: 'http://127.0.0.1:42345/patch.js',
      resourceType: 'script'
    })
  ).toEqual({ cancel: true })
  expect(
    shamuLiveResponseDecision(session, {
      ...documentRequest,
      url: 'https://example.com',
      resourceType: 'image'
    })
  ).toBeNull()
  expect(shamuLiveRequestHeaders(session, { ...documentRequest, webContentsId: 11 }, {})).toEqual(
    {}
  )
  expect(shamuLiveResponseDecision(session, { ...documentRequest, webContentsId: 11 })).toBeNull()
})

it('releases failed-request and window state without trusting a reused window id', () => {
  const session = {}
  const unregister = registerShamuLiveWindow(session, 10, live)
  const headers = shamuLiveRequestHeaders(session, documentRequest, {})
  finishShamuLiveRequest(session, documentRequest.id)
  const responseHeaders = {
    [SHAMU_LIVE_PROOF_HEADER]: [shamuLiveProof(live.token, headers[SHAMU_LIVE_CHALLENGE_HEADER])]
  }
  expect(shamuLiveResponseDecision(session, { ...documentRequest, responseHeaders })).toEqual({
    cancel: true
  })
  unregister()
  expect(hasShamuLiveWindows(session)).toBe(false)
  expect(shamuLiveRequestHeaders(session, documentRequest, {})).toEqual({})
})

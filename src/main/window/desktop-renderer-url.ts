import { app, type BrowserWindow } from 'electron'
import { randomBytes } from 'node:crypto'
import { isShamuDistribution } from '../../shared/shamu-client'
import {
  parseShamuLiveRenderer,
  SHAMU_LIVE_HEALTH_PATH,
  verifyShamuLiveProof
} from '../../shared/shamu-live-renderer'
import { isShamuClientMode } from '../startup/shamu-client-mode'
import { registerShamuLiveWindow } from './shamu-live-request-guard'
import { ensureBrowserSessionUserAgentPolicy } from '../browser/browser-session-ua'
import {
  installBrowserSessionHeadersReceived,
  installBrowserSessionRequestLifecycle
} from '../browser/browser-session-request-decisions'

function liveRenderer() {
  if (!process.env.ORCA_SHAMU_RENDERER_URL && !process.env.ORCA_SHAMU_LIVE_TOKEN) {
    return null
  }
  return parseShamuLiveRenderer(
    isShamuDistribution(app.getVersion()) || (!app.isPackaged && isShamuClientMode()),
    process.env
  )
}

export function usesDesktopRendererDevServer(): boolean {
  return Boolean(liveRenderer() || (!app.isPackaged && process.env.ELECTRON_RENDERER_URL))
}

export function loadDesktopRenderer(
  window: Pick<BrowserWindow, 'loadURL' | 'loadFile' | 'webContents'>,
  entry: 'index.html' | 'popout.html' | 'space.html',
  bundledFile: string
): Promise<void> {
  const live = liveRenderer()
  if (live) {
    const contents = window.webContents
    const session = contents.session
    const unregister = registerShamuLiveWindow(session, contents.id, live)
    contents.once('destroyed', unregister)
    ensureBrowserSessionUserAgentPolicy(session)
    installBrowserSessionHeadersReceived(session)
    installBrowserSessionRequestLifecycle(session)
    return desktopRendererUrl(entry).then((url) => {
      if (!url) {
        throw new Error('The Shamu live renderer is unavailable.')
      }
      return window.loadURL(url)
    })
  }
  const legacy = !app.isPackaged && process.env.ELECTRON_RENDERER_URL
  return legacy
    ? window.loadURL(entry === 'index.html' ? legacy : `${legacy.replace(/\/$/, '')}/${entry}`)
    : window.loadFile(bundledFile)
}

export async function desktopRendererUrl(
  entry: 'index.html' | 'popout.html' | 'space.html' = 'index.html'
): Promise<string | null> {
  const live = liveRenderer()
  if (!live) {
    const legacy = !app.isPackaged && process.env.ELECTRON_RENDERER_URL
    return legacy
      ? entry === 'index.html'
        ? legacy
        : `${legacy.replace(/\/$/, '')}/${entry}`
      : null
  }
  const challenge = randomBytes(32).toString('hex')
  try {
    const health = new URL(SHAMU_LIVE_HEALTH_PATH, live.url)
    health.searchParams.set('challenge', challenge)
    const response = await fetch(health, { redirect: 'error', signal: AbortSignal.timeout(5_000) })
    const body: unknown = await response.json()
    if (
      !response.ok ||
      !body ||
      typeof body !== 'object' ||
      !('proof' in body) ||
      !verifyShamuLiveProof(live.token, challenge, body.proof)
    ) {
      throw new Error('Invalid live renderer proof')
    }
    return new URL(entry, live.url).href
  } catch {
    throw new Error('The Shamu live renderer is unavailable or could not be verified.')
  }
}

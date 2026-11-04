import { afterEach, expect, it, vi } from 'vitest'
import { shamuLiveProof } from '../../shared/shamu-live-renderer'

const { app } = vi.hoisted(() => ({
  app: { isPackaged: true, getVersion: vi.fn(() => '1.4.247-shamu.2') }
}))
vi.mock('electron', () => ({ app }))
vi.mock('../startup/shamu-client-mode', () => ({ isShamuClientMode: () => false }))
import { desktopRendererUrl, usesDesktopRendererDevServer } from './desktop-renderer-url'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  app.isPackaged = true
  app.getVersion.mockReturnValue('1.4.247-shamu.2')
})

it('preserves normal packaged loads and existing development URLs', async () => {
  expect(await desktopRendererUrl()).toBeNull()
  expect(usesDesktopRendererDevServer()).toBe(false)
  app.isPackaged = false
  vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')
  expect(await desktopRendererUrl()).toBe('http://localhost:5173')
  expect(await desktopRendererUrl('popout.html')).toBe('http://localhost:5173/popout.html')
})

it('never enables a live URL in the ordinary packaged Orca', async () => {
  app.getVersion.mockReturnValue('1.4.247')
  vi.stubEnv('ORCA_SHAMU_RENDERER_URL', 'http://127.0.0.1:41234/')
  vi.stubEnv('ORCA_SHAMU_LIVE_TOKEN', 'a'.repeat(64))
  expect(await desktopRendererUrl()).toBeNull()
})

it('loads only a server that proves its launch token, without sending that token', async () => {
  const token = 'a'.repeat(64)
  vi.stubEnv('ORCA_SHAMU_RENDERER_URL', 'http://127.0.0.1:41234/')
  vi.stubEnv('ORCA_SHAMU_LIVE_TOKEN', token)
  const probe = vi.fn(async (url: URL) => {
    expect(url.href).not.toContain(token)
    expect(url.pathname).toBe('/.well-known/orca-shamu-live')
    return new Response(
      JSON.stringify({ proof: shamuLiveProof(token, url.searchParams.get('challenge')!) })
    )
  })
  vi.stubGlobal('fetch', probe)
  expect(await desktopRendererUrl()).toBe('http://127.0.0.1:41234/index.html')
  expect(await desktopRendererUrl('space.html')).toBe('http://127.0.0.1:41234/space.html')
  expect(probe).toHaveBeenCalledTimes(2)
})

it('refuses an unrelated server without disclosing its address or token in errors', async () => {
  vi.stubEnv('ORCA_SHAMU_RENDERER_URL', 'http://127.0.0.1:41234/')
  vi.stubEnv('ORCA_SHAMU_LIVE_TOKEN', 'a'.repeat(64))
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ proof: 'b'.repeat(64) })))
  )
  await expect(desktopRendererUrl()).rejects.toThrow(
    'The Shamu live renderer is unavailable or could not be verified.'
  )
})

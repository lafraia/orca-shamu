import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { resolveConfig } from 'electron-vite'
import {
  SHAMU_LIVE_HEALTH_PATH,
  SHAMU_LIVE_CHALLENGE_HEADER,
  SHAMU_LIVE_PROOF_HEADER,
  shamuLiveProof
} from '../../src/shared/shamu-live-renderer.ts'

export async function createShamuLiveServer({
  repoRoot = process.cwd(),
  cacheDir,
  plugins = []
} = {}) {
  const token = randomBytes(32).toString('hex')
  const config = await resolveConfig(
    { root: repoRoot, configFile: resolve(repoRoot, 'electron.vite.config.ts') },
    'serve',
    'development'
  )
  const renderer = config.config?.renderer
  if (!renderer || typeof renderer === 'function') {
    throw new Error('Could not resolve the Shamu renderer configuration.')
  }
  const server = await createServer({
    ...renderer,
    experimental: { ...renderer.experimental, bundledDev: false },
    cacheDir: cacheDir ?? resolve(repoRoot, '.cache/vite/shamu-live'),
    configFile: false,
    plugins: [
      ...plugins,
      ...(renderer.plugins ?? []),
      {
        name: 'shamu-live-proof',
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            const requestChallenge = request.headers[SHAMU_LIVE_CHALLENGE_HEADER]
            if (typeof requestChallenge === 'string' && /^[a-f0-9]{64}$/.test(requestChallenge)) {
              response.setHeader(SHAMU_LIVE_PROOF_HEADER, shamuLiveProof(token, requestChallenge))
            }
            const url = new URL(request.url ?? '/', 'http://127.0.0.1')
            if (url.pathname !== SHAMU_LIVE_HEALTH_PATH) {
              next()
              return
            }
            const challenge = url.searchParams.get('challenge') ?? ''
            if (request.method !== 'GET' || !/^[a-f0-9]{64}$/.test(challenge)) {
              response.writeHead(400).end()
              return
            }
            response.writeHead(200, {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store'
            })
            response.end(JSON.stringify({ proof: shamuLiveProof(token, challenge) }))
          })
        }
      }
    ],
    server: {
      ...renderer.server,
      host: '127.0.0.1',
      port: 0,
      strictPort: true,
      open: false,
      cors: false,
      headers: { ...renderer.server?.headers, 'Cache-Control': 'no-store' },
      allowedHosts: ['127.0.0.1'],
      hmr: { host: '127.0.0.1' },
      fs: { strict: true, allow: [repoRoot] }
    }
  })
  try {
    await server.listen()
    const address = server.httpServer?.address()
    if (!address || typeof address === 'string') {
      throw new Error('Could not bind the Shamu live renderer.')
    }
    const url = `http://127.0.0.1:${address.port}/`
    return {
      server,
      url,
      env: { ORCA_SHAMU_RENDERER_URL: url, ORCA_SHAMU_LIVE_TOKEN: token }
    }
  } catch (error) {
    await server.close()
    throw error
  }
}

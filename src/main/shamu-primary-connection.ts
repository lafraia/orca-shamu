import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isIP } from 'node:net'
import { z } from 'zod'
import { parseHostAccessLink } from '../shared/remote-pairing-address'
import {
  addOrUpdateEnvironmentFromPairingCode,
  listEnvironments
} from '../shared/runtime-environment-store'
import { getPreferredPairingOffer, redactRuntimeEnvironment } from '../shared/runtime-environments'
import type { ProjectChannelsSnapshot } from '../shared/project-channels'
import { verifyRuntimeEnvironmentPairingCode } from './ipc/runtime-environments/runtime-environment-pairing-verification'
import { publishVerifiedPairing } from './ipc/runtime-environments/runtime-environment-verified-pairing-publish'
import { invalidateRuntimeEnvironmentTransport } from './ipc/runtime-environments/runtime-environments'
import { withSidecarSnapshotQueue, writeSidecarSnapshot } from './sidecar-snapshot-file'
import { callRuntimeEnvironment } from './ipc/runtime-environments/runtime-environment-transport-routing'

const primarySchema = z.object({
  version: z.literal(1),
  environmentId: z.string().min(1),
  hostPublicKey: z.string().min(1)
})

function isLiteralLoopbackEndpoint(endpoint: string): boolean {
  const hostname = new URL(endpoint).hostname.replace(/^\[|\]$/g, '')
  return hostname === '::1' || (isIP(hostname) === 4 && hostname.startsWith('127.'))
}

export class ShamuPrimaryConnection {
  private readonly file: string

  constructor(
    profileDirectory: string,
    private readonly registryDirectory: string
  ) {
    this.file = join(profileDirectory, 'shamu-primary.json')
  }

  private async readBinding(): Promise<z.infer<typeof primarySchema> | null> {
    try {
      return primarySchema.parse(JSON.parse(await readFile(this.file, 'utf8')))
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  async read(): Promise<{ environmentId: string | null }> {
    const binding = await this.readBinding()
    if (!binding) {
      return { environmentId: null }
    }
    const environment = listEnvironments(this.registryDirectory).find(
      (row) => row.id === binding.environmentId
    )
    if (
      !environment ||
      getPreferredPairingOffer(environment).publicKeyB64 !== binding.hostPublicKey ||
      !isLiteralLoopbackEndpoint(getPreferredPairingOffer(environment).endpoint)
    ) {
      return { environmentId: null }
    }
    return { environmentId: environment.id }
  }

  async connect(pairingCode: string): Promise<{ environmentId: string }> {
    return withSidecarSnapshotQueue(this.file, async () => {
      const parsed = parseHostAccessLink(pairingCode)
      if (!parsed.ok || !isLiteralLoopbackEndpoint(parsed.value.pairing.endpoint)) {
        throw new Error('Generate an access link for this computer in the primary Orca.')
      }
      const binding = await this.readBinding()
      if (binding && binding.hostPublicKey !== parsed.value.pairing.publicKeyB64) {
        throw new Error('This access link belongs to a different Orca server.')
      }
      const verified = await verifyRuntimeEnvironmentPairingCode(pairingCode, true)
      if (!verified.ok) {
        throw new Error('Could not connect to the primary Orca. Generate a new access link.')
      }
      const saved = addOrUpdateEnvironmentFromPairingCode(this.registryDirectory, {
        name: 'Orca principal',
        pairingCode,
        runtimeId: verified.runtimeStatus.runtimeId
      })
      await writeSidecarSnapshot(
        this.file,
        {
          version: 1,
          environmentId: saved.environment.id,
          hostPublicKey: parsed.value.pairing.publicKeyB64
        },
        0o600
      )
      await publishVerifiedPairing(
        this.registryDirectory,
        {
          ok: true,
          environment: redactRuntimeEnvironment(saved.environment),
          runtimeStatus: verified.runtimeStatus
        },
        saved.updatedExisting
          ? { invalidateTransport: invalidateRuntimeEnvironmentTransport }
          : null
      )
      return { environmentId: saved.environment.id }
    })
  }

  async assertChannelAuthority(snapshot: ProjectChannelsSnapshot): Promise<void> {
    const { environmentId } = await this.read()
    if (
      !environmentId ||
      snapshot.channels.some((channel) =>
        channel.members.some(
          (member) =>
            member.target.kind !== 'environment' || member.target.environmentId !== environmentId
        )
      )
    ) {
      throw new Error('Shamu project chats must use sessions from the primary Orca.')
    }
  }

  async call(method: string, params: unknown): Promise<unknown> {
    const { environmentId } = await this.read()
    if (!environmentId) {
      throw new Error('Connect Shamu to the primary Orca to open this bot conversation.')
    }
    const reply = await callRuntimeEnvironment(
      this.registryDirectory,
      environmentId,
      method,
      params,
      30_000
    )
    if (!reply.ok) {
      throw new Error(reply.error.message)
    }
    return reply.result
  }
}

import type { SecretStore } from '../../shared/secret-store'
import { requireVaultProtection } from './vault-crypto'

export function sealVaultDeviceKey(key: Buffer, binding: string, store: SecretStore): string {
  requireVaultProtection(store)
  const payload = JSON.stringify(['shamu-vault-device-key-v1', binding, key.toString('base64')])
  return store.encryptString(payload).toString('base64')
}

export function openVaultDeviceKey(sealed: string, binding: string, store: SecretStore): Buffer {
  requireVaultProtection(store)
  let key: Buffer | undefined
  try {
    const cipher = Buffer.from(sealed, 'base64')
    if (cipher.toString('base64') !== sealed) {
      throw new Error('invalid encoding')
    }
    const value: unknown = JSON.parse(store.decryptString(cipher))
    if (
      !Array.isArray(value) ||
      value.length !== 3 ||
      value[0] !== 'shamu-vault-device-key-v1' ||
      value[1] !== binding ||
      typeof value[2] !== 'string'
    ) {
      throw new Error('invalid binding')
    }
    key = Buffer.from(value[2], 'base64')
    if (key.length !== 32 || key.toString('base64') !== value[2]) {
      throw new Error('invalid key')
    }
    return key
  } catch {
    key?.fill(0)
    throw new Error(
      'Automatic Vault unlock is unavailable. Unlock with the master password to reconnect this device’s keychain.'
    )
  }
}

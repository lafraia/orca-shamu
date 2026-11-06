import { createHash } from 'node:crypto'
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync
} from 'node:fs'
import { join } from 'node:path'
import { isSafeOwnedDirectory } from '../../shared/owned-private-directory'
import { writeSecureFile } from '../../shared/secure-file'
import {
  isWindowsPathRestricted,
  restrictWindowsDirectory
} from '../../shared/secure-path-windows-acl'
import { vaultEnvelopeSchema, type VaultEnvelope } from './vault-crypto'

const MAX_VAULT_BYTES = 8 * 1024 * 1024

export class VaultFile {
  readonly file: string
  readonly binding: string
  private readonly directory: string

  constructor(profileDirectory: string) {
    const profile = realpathSync(profileDirectory)
    this.directory = join(profile, 'shamu-vault')
    this.file = join(this.directory, 'vault.json')
    this.binding = `orca-shamu-vault:1:${createHash('sha256').update(profile).digest('hex')}`
  }

  async prepare(): Promise<void> {
    if (process.platform !== 'win32') {
      return
    }
    try {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 })
      if (
        !isSafeOwnedDirectory(lstatSync(this.directory)) ||
        !(await restrictWindowsDirectory(this.directory))
      ) {
        throw new Error('unsafe directory permissions')
      }
    } catch {
      throw new Error('Vault directory could not be opened safely.')
    }
    this.validateDirectory()
  }

  private validateDirectory(create = false): boolean {
    if (create) {
      mkdirSync(this.directory, { mode: 0o700 })
    }
    try {
      if (!isSafeOwnedDirectory(lstatSync(this.directory))) {
        throw new Error('unsafe directory')
      }
      if (process.platform === 'win32' && !isWindowsPathRestricted(this.directory, true)) {
        throw new Error('unsafe directory permissions')
      }
      return true
    } catch (error) {
      if (!create && isMissing(error)) {
        return false
      }
      throw new Error('Vault directory could not be opened safely.')
    }
  }

  read(): { envelope: VaultEnvelope; fingerprint: string } | null {
    if (!this.validateDirectory()) {
      return null
    }
    if (process.platform === 'win32') {
      try {
        const stat = lstatSync(this.file)
        if (!stat.isFile() || stat.nlink !== 1) {
          throw new Error('unsafe file')
        }
        if (!isWindowsPathRestricted(this.file, false)) {
          throw new Error('unsafe file permissions')
        }
      } catch (error) {
        if (isMissing(error)) {
          return null
        }
        throw new Error('Vault file permissions could not be secured.')
      }
    }
    let fd: number
    try {
      fd = openSync(
        this.file,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | constants.O_NONBLOCK
      )
    } catch (error) {
      if (isMissing(error)) {
        return null
      }
      throw new Error('Vault file could not be opened safely.')
    }
    try {
      const stat = fstatSync(fd)
      const pathStat = lstatSync(this.file)
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        pathStat.isSymbolicLink() ||
        stat.ino !== pathStat.ino ||
        stat.dev !== pathStat.dev ||
        (typeof process.getuid === 'function' &&
          (stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600)) ||
        stat.size > MAX_VAULT_BYTES
      ) {
        throw new Error('unsafe file')
      }
      const bytes = readFileSync(fd)
      if (bytes.length > MAX_VAULT_BYTES) {
        throw new Error('oversized file')
      }
      return {
        envelope: vaultEnvelopeSchema.parse(JSON.parse(bytes.toString('utf8'))),
        fingerprint: digest(bytes)
      }
    } catch {
      throw new Error('Vault is unreadable or damaged. It has not been replaced.')
    } finally {
      closeSync(fd)
    }
  }

  write(envelope: VaultEnvelope, expectedFingerprint: string | null): string {
    if (!this.validateDirectory()) {
      this.validateDirectory(true)
    }
    const existing = this.read()
    if ((existing?.fingerprint ?? null) !== expectedFingerprint) {
      throw new Error('Vault changed on disk. Lock and unlock it before trying again.')
    }
    const serialized = JSON.stringify(vaultEnvelopeSchema.parse(envelope))
    if (Buffer.byteLength(serialized) > MAX_VAULT_BYTES) {
      throw new Error('Vault is full.')
    }
    if (!writeSecureFile(this.file, serialized, { durable: true })) {
      throw new Error('Vault file permissions could not be secured. Lock and check this device.')
    }
    return digest(Buffer.from(serialized))
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

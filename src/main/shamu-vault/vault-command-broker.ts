import { createHash } from 'node:crypto'
import { realpathSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { runProcess } from '@orca/process-host'
import type { ProjectChannel } from '../../shared/project-channels'
import type { VaultAccess, VaultEntry, VaultRun, VaultRunCommand } from '../../shared/shamu-vault'
import type { VaultStore } from './vault-store'

type Request = {
  view: VaultRun
  access: VaultAccess
  fingerprint: string
  programIdentity: string
  cwdIdentity: string
  abort?: AbortController
}

export class VaultCommandBroker {
  private readonly requests = new Map<string, Request>()
  private readonly detachLock: () => void

  constructor(
    private readonly vault: VaultStore,
    private readonly changed: () => void,
    private readonly confirm: (request: VaultRun, entry: VaultEntry) => Promise<boolean>,
    private readonly execute: typeof runProcess = runProcess,
    private readonly now: () => number = Date.now
  ) {
    this.detachLock = vault.onLock(() => {
      for (const request of this.requests.values()) {
        request.abort?.abort()
      }
      this.requests.clear()
    })
  }

  dispose(): void {
    this.detachLock()
    this.requests.clear()
  }

  list(botId: string): VaultRun[] {
    this.expire()
    return [...this.requests.values()]
      .filter((row) => row.view.botId === botId)
      .map((row) => structuredClone(row.view))
  }

  pendingBotIds(): string[] {
    return [...this.requests.values()]
      .filter((row) => row.view.state === 'pending' && row.view.expiresAt > this.now())
      .map((row) => row.view.botId)
  }

  request(command: VaultRunCommand, bot: ProjectChannel): VaultRun {
    this.expire()
    const fingerprint = createHash('sha256').update(JSON.stringify(command)).digest('hex')
    const existing = this.requests.get(command.requestId)
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error('This Vault request ID belongs to another operation.')
      }
      return structuredClone(existing.view)
    }
    if (this.requests.size >= 20) {
      throw new Error('Too many Vault requests. Review pending requests first.')
    }
    const snapshot = this.vault.status(bot.id)
    if (!snapshot.session) {
      throw new Error('Unlock Vault in Orca Shamu before requesting a credential.')
    }
    const access = { botId: bot.id, session: snapshot.session, revision: snapshot.revision }
    this.vault.entry(access, command.entryId, true)
    if (!bot.home?.ready || !isAbsolute(command.program) || /\.(cmd|bat)$/i.test(command.program)) {
      throw new Error(
        'Use an absolute executable path on this computer. Shell command files are disabled.'
      )
    }
    const program = realpathSync(command.program)
    if (!statSync(program).isFile()) {
      throw new Error('The requested executable is not a regular file.')
    }
    const cwd = realpathSync(bot.home.directory)
    if (!statSync(cwd).isDirectory()) {
      throw new Error('This bot workspace is unavailable on this computer.')
    }
    const view: VaultRun = {
      requestId: command.requestId,
      botId: bot.id,
      entryId: command.entryId,
      program,
      args: [...command.args],
      cwd,
      state: 'pending',
      expiresAt: this.now() + 120_000
    }
    this.requests.set(command.requestId, {
      view,
      access,
      fingerprint,
      programIdentity: identity(program),
      cwdIdentity: identity(cwd)
    })
    this.changed()
    return structuredClone(view)
  }

  result(botId: string, requestId: string): VaultRun {
    const result = this.list(botId).find((row) => row.requestId === requestId)
    if (!result) {
      throw new Error('Vault request expired or was cancelled. No automatic retry is allowed.')
    }
    return result
  }

  async decide(access: VaultAccess, requestId: string, approve: boolean): Promise<void> {
    this.expire()
    const request = this.requests.get(requestId)
    if (!request || request.view.botId !== access.botId || request.view.state !== 'pending') {
      throw new Error('This Vault request is no longer pending.')
    }
    if (!approve) {
      request.view.state = 'denied'
      this.changed()
      return
    }
    const entry = this.vault.entry(access, request.view.entryId, true)
    if (access.session !== request.access.session || access.revision !== request.access.revision) {
      throw new Error('Vault changed. Ask the bot to submit a new request.')
    }
    // Consume before awaiting a prompt so a second click cannot approve the same request.
    request.view.state = 'running'
    this.changed()
    try {
      if (!(await this.confirm(structuredClone(request.view), entry))) {
        request.view.state = 'denied'
        return
      }
      if (this.requests.get(requestId) !== request || this.now() >= request.view.expiresAt) {
        throw new Error('expired')
      }
      this.vault.entry(request.access, request.view.entryId, true)
      if (
        identity(request.view.program) !== request.programIdentity ||
        identity(request.view.cwd) !== request.cwdIdentity
      ) {
        throw new Error('changed')
      }
      request.abort = new AbortController()
      const env = commandEnvironment()
      const execution = this.vault.useSecret(
        request.access,
        entry.id,
        (bytes) => {
          env[entry.environmentVariable] = bytes.toString('utf8')
          try {
            return this.execute({
              program: request.view.program,
              args: [...request.view.args],
              cwd: request.view.cwd,
              env,
              stdio: 'ignore',
              maxOutputBytes: 0,
              timeoutMs: 30_000,
              signal: request.abort!.signal,
              detached: process.platform !== 'win32'
            })
          } finally {
            delete env[entry.environmentVariable]
          }
        },
        true
      )
      const result = await execution
      if (this.requests.get(requestId) === request) {
        request.view.state = 'completed'
        request.view.exitCode = result.code
        request.view.timedOut = result.timedOut
      }
    } catch {
      request.view.state = 'failed'
      throw new Error(
        'Vault execution was cancelled or failed. Inspect the program before submitting a new request.'
      )
    } finally {
      request.abort = undefined
      this.changed()
    }
  }

  private expire(): void {
    for (const [id, request] of this.requests) {
      if (request.view.state === 'pending' && this.now() >= request.view.expiresAt) {
        request.view.state = 'cancelled'
      }
      if (
        !['pending', 'running'].includes(request.view.state) &&
        this.now() - request.view.expiresAt >= 300_000
      ) {
        this.requests.delete(id)
      }
    }
  }
}

function identity(path: string): string {
  const stat = statSync(path)
  return JSON.stringify([
    realpathSync(path),
    stat.dev,
    stat.ino,
    stat.size,
    stat.mtimeMs,
    stat.ctimeMs
  ])
}

function commandEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of [
    'PATH',
    'HOME',
    'USERPROFILE',
    'SystemRoot',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'TMPDIR',
    'LANG'
  ]) {
    if (process.env[key]) {
      env[key] = process.env[key]
    }
  }
  return env
}

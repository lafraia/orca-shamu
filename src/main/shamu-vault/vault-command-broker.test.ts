import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ProjectChannel } from '../../shared/project-channels'
import type { VaultRunCommand } from '../../shared/shamu-vault'
import { channelFixture } from '../../shared/project-channels.test-fixture'
import { VaultCommandBroker } from './vault-command-broker'
import { vaultFixture, vaultAccess, TEST_ENTRY, TEST_PASSWORD } from './vault-fixture.test-support'

describe('Vault command approvals', () => {
  let fixture: ReturnType<typeof vaultFixture>
  let broker: VaultCommandBroker | undefined
  beforeEach(() => {
    fixture = vaultFixture()
  })
  afterEach(() => {
    fixture.dispose()
    broker?.dispose()
  })
  const prepare = async () => {
    const created = await fixture.store.create('alpha', TEST_PASSWORD)
    const saved = fixture.store.save(vaultAccess(created), TEST_ENTRY)
    const bot: ProjectChannel = {
      ...channelFixture(),
      id: 'alpha',
      home: {
        ready: true,
        directory: fixture.directory,
        memberId: 'coordinator',
        createOperationId: 'alpha',
        createFingerprint: 'alpha'
      }
    }
    const receipt = join(fixture.directory, 'approved-command-receipt')
    const command: VaultRunCommand = {
      action: 'vault.run',
      requestId: randomUUID(),
      actorId: 'alpha',
      sourceItemId: 'synthetic-user-request',
      entryId: saved.entries[0].id,
      program: process.execPath,
      args: [
        '-e',
        "if (require('node:crypto').createHash('sha256').update(process.env.TEST_API_TOKEN || '').digest('hex') !== 'ffe34d70b4d9af6b3ba1ad61afdf5cdf2b7c1a5c3d377995ce41c66642cd598a') process.exit(4); require('node:fs').writeFileSync(process.argv[1], 'used'); process.stdout.write(process.env.TEST_API_TOKEN); process.stderr.write(process.env.TEST_API_TOKEN)",
        receipt
      ]
    }
    return { bot, saved, receipt, command }
  }

  it('keeps denied requests from starting a process', async () => {
    const { bot, saved, receipt, command } = await prepare()
    broker = new VaultCommandBroker(
      fixture.store,
      () => {},
      async () => true
    )
    broker.request(command, bot)
    await broker.decide(vaultAccess(saved), command.requestId, false)
    expect(broker.result('alpha', command.requestId).state).toBe('denied')
    expect(existsSync(receipt)).toBe(false)
    await expect(broker.decide(vaultAccess(saved), command.requestId, true)).rejects.toThrow(
      'no longer pending'
    )
  })

  it('executes the approved process without exposing stdout, stderr or credentials in its result', async () => {
    const { bot, saved, receipt, command } = await prepare()
    broker = new VaultCommandBroker(
      fixture.store,
      () => {},
      async () => true
    )
    expect(broker.request(command, bot).state).toBe('pending')
    expect(existsSync(receipt)).toBe(false)
    await broker.decide(vaultAccess(saved), command.requestId, true)
    expect(readFileSync(receipt, 'utf8')).toBe('used')
    const result = broker.result('alpha', command.requestId)
    expect(result).toMatchObject({ state: 'completed', exitCode: 0, timedOut: false })
    expect('stdout' in result || 'stderr' in result).toBe(false)
    expect(JSON.stringify(result).includes(TEST_ENTRY.secret)).toBe(false)
    await expect(broker.decide(vaultAccess(saved), command.requestId, true)).rejects.toThrow(
      'no longer pending'
    )
  })

  it('cancels a native approval if the vault locks while the prompt is open', async () => {
    const { bot, saved, receipt, command } = await prepare()
    let respond!: (allowed: boolean) => void
    broker = new VaultCommandBroker(
      fixture.store,
      () => {},
      () =>
        new Promise((resolve) => {
          respond = resolve
        })
    )
    broker.request(command, bot)
    const approval = broker.decide(vaultAccess(saved), command.requestId, true)
    fixture.store.lock()
    respond(true)
    await expect(approval).rejects.toThrow('cancelled or failed')
    expect(existsSync(receipt)).toBe(false)
    expect(() => broker!.result('alpha', command.requestId)).toThrow('expired or was cancelled')
  })

  it('revalidates grants after native approval and refuses cross-bot access and changed retries', async () => {
    const { bot, saved, receipt, command } = await prepare()
    let respond!: (allowed: boolean) => void
    broker = new VaultCommandBroker(
      fixture.store,
      () => {},
      () =>
        new Promise((resolve) => {
          respond = resolve
        })
    )
    broker.request(command, bot)
    expect(() => broker!.request({ ...command, args: ['different'] }, bot)).toThrow(
      'another operation'
    )
    expect(() => broker!.result('beta', command.requestId)).toThrow('expired or was cancelled')
    const approval = broker.decide(vaultAccess(saved), command.requestId, true)
    fixture.store.save(vaultAccess(saved), {
      ...TEST_ENTRY,
      id: saved.entries[0].id,
      secret: undefined,
      allowAgent: false
    })
    respond(true)
    await expect(approval).rejects.toThrow('cancelled or failed')
    expect(existsSync(receipt)).toBe(false)
  })
})

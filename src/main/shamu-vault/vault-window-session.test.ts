import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VaultWindowSession } from './vault-window-session'
import { vaultFixture, vaultAccess, TEST_ENTRY, TEST_PASSWORD } from './vault-fixture.test-support'

describe('Vault window ownership', () => {
  let fixture: ReturnType<typeof vaultFixture>
  let lifetime: VaultWindowSession | undefined
  let visible: boolean
  let current: BrowserWindow | null
  let window: BrowserWindow
  beforeEach(() => {
    visible = true
    fixture = vaultFixture(() => lifetime?.isOpen() ?? false)
    const fixtureWindow = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      isVisible: () => visible,
      isMinimized: () => false,
      webContents: Object.assign(new EventEmitter(), {
        isLoadingMainFrame: () => false,
        isDestroyed: () => false
      })
    })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the Electron fixture implements every window and webContents operation used by VaultWindowSession.
    window = fixtureWindow as unknown as BrowserWindow
    current = window
    lifetime = new VaultWindowSession(fixture.store, {
      getWindow: () => current,
      isTrusted: () => true,
      onVisible: () => () => {}
    })
    lifetime.start()
  })
  afterEach(() => {
    lifetime?.dispose()
    lifetime = undefined
    fixture.dispose()
  })
  const create = async () => {
    await lifetime!.resume()
    const created = await fixture.store.create('alpha', TEST_PASSWORD)
    return fixture.store.save(vaultAccess(created), TEST_ENTRY)
  }

  it('opens through the device key when Shamu reopens and blocks the closed window', async () => {
    const saved = await create()
    visible = false
    window.emit('hide')
    expect(fixture.store.status('alpha')).toMatchObject({ state: 'locked', entries: [] })
    await expect(lifetime!.resume()).rejects.toThrow('Open Orca Shamu')
    expect(() =>
      fixture.store.useSecret(vaultAccess(saved), saved.entries[0].id, () => true)
    ).toThrow('Open Orca Shamu')
    visible = true
    window.emit('show')
    await lifetime!.resume()
    const opened = fixture.store.status('alpha')
    expect(opened).toMatchObject({ state: 'unlocked', entries: [{ name: 'Synthetic service' }] })
    expect(() =>
      fixture.store.useSecret(vaultAccess(saved), saved.entries[0].id, () => true)
    ).toThrow('Vault is locked')
    fixture.store.lock()
    expect(fixture.store.status('alpha').state).toBe('locked')
  })

  it('does not unlock if the window closes during automatic opening', async () => {
    await create()
    window.emit('close')
    visible = true
    window.emit('show')
    window.emit('close')
    await expect(fixture.store.unlockDevice()).rejects.toThrow('Open Orca Shamu')
    expect(fixture.store.status('alpha')).toMatchObject({ state: 'locked', entries: [] })
  })

  it('keeps a window hidden after sleep locked when the screen is unlocked', async () => {
    await create()
    lifetime!.setSleeping(true)
    lifetime!.setScreenLocked(true)
    expect(fixture.store.status('alpha').state).toBe('locked')
    lifetime!.setSleeping(false)
    await expect(lifetime!.resume()).rejects.toThrow('Open Orca Shamu')
    visible = false
    window.emit('hide')
    lifetime!.setScreenLocked(false)
    expect(fixture.store.status('alpha').state).toBe('locked')
    visible = true
    window.emit('show')
    await lifetime!.resume()
    expect(fixture.store.status('alpha').state).toBe('unlocked')
  })

  it('revokes the key when its renderer crashes or its trusted window is replaced', async () => {
    await create()
    window.webContents.emit('render-process-gone')
    expect(fixture.store.status('alpha')).toMatchObject({ state: 'locked', entries: [] })
    await expect(lifetime!.resume()).rejects.toThrow('Open Orca Shamu')
    window.webContents.emit('did-finish-load')
    window.emit('show')
    await lifetime!.resume()
    expect(fixture.store.status('alpha').state).toBe('unlocked')
    current = null
    expect(fixture.store.status('alpha')).toMatchObject({ state: 'locked', entries: [] })
  })

  it('reopens on renderer reload but an ordinary status request cannot unlock a manually locked Vault', async () => {
    await create()
    fixture.store.lock()
    expect(fixture.store.status('alpha').state).toBe('locked')
    window.webContents.emit('did-start-loading')
    expect(fixture.store.status('alpha').state).toBe('locked')
    window.webContents.emit('did-finish-load')
    await lifetime!.resume()
    expect(fixture.store.status('alpha').state).toBe('unlocked')
  })
})

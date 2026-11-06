import type { BrowserWindow, WebContents } from 'electron'
import type { VaultStore } from './vault-store'

type WindowSessionOptions = {
  getWindow: () => BrowserWindow | null
  isTrusted: (sender: WebContents) => boolean
  onVisible: (listener: () => void) => () => void
}

export class VaultWindowSession {
  private window: BrowserWindow | null = null
  private ready = false
  private active = false
  private blocked = false
  private sleeping = false
  private screenLocked = false
  private disposed = false
  private epoch = 0
  private opening: Promise<void> | null = null
  private detachWindow: (() => void) | null = null
  private detachVisible: (() => void) | null = null

  constructor(
    private readonly store: VaultStore,
    private readonly options: WindowSessionOptions
  ) {}

  start(): void {
    this.detachVisible = this.options.onVisible(() => this.connect())
    this.connect()
  }

  connect(): void {
    if (this.disposed) {
      return
    }
    const window = this.options.getWindow()
    if (this.window === window) {
      return
    }
    this.detachWindow?.()
    this.pause()
    this.window = window
    if (!window) {
      return
    }
    const sender = window.webContents
    this.blocked = false
    this.ready = !sender.isLoadingMainFrame()
    const opened = (): void => {
      this.blocked = false
      this.tryOpen()
    }
    const loading = (): void => {
      this.ready = false
      this.pause()
    }
    const loaded = (): void => {
      this.ready = true
      this.tryOpen()
    }
    const closed = (): void => {
      this.blocked = true
      this.pause()
    }
    const crashed = (): void => {
      this.ready = false
      closed()
    }
    window.on('show', opened)
    window.on('restore', opened)
    window.on('hide', closed)
    window.on('close', closed)
    window.on('closed', closed)
    sender.on('did-start-loading', loading)
    sender.on('did-finish-load', loaded)
    sender.on('render-process-gone', crashed)
    sender.on('destroyed', closed)
    this.detachWindow = () => {
      window.removeListener('show', opened)
      window.removeListener('restore', opened)
      window.removeListener('hide', closed)
      window.removeListener('close', closed)
      window.removeListener('closed', closed)
      sender.removeListener('did-start-loading', loading)
      sender.removeListener('did-finish-load', loaded)
      sender.removeListener('render-process-gone', crashed)
      sender.removeListener('destroyed', closed)
    }
    this.tryOpen()
  }

  isOpen(): boolean {
    return this.active && !this.blocked && this.canOpen()
  }

  private canOpen(): boolean {
    const window = this.window
    return (
      !this.disposed &&
      !this.sleeping &&
      !this.screenLocked &&
      this.ready &&
      window !== null &&
      this.options.getWindow() === window &&
      !window.isDestroyed() &&
      !window.webContents.isDestroyed() &&
      this.options.isTrusted(window.webContents) &&
      (window.isVisible() || window.isMinimized())
    )
  }

  async resume(): Promise<void> {
    this.connect()
    if (!this.canOpen()) {
      throw new Error('Open Orca Shamu to unlock Vault.')
    }
    this.blocked = false
    await this.openDevice()
  }

  suspend(): void {
    this.blocked = true
    this.pause()
  }
  setSleeping(value: boolean): void {
    this.sleeping = value
    if (value) {
      this.pause()
    } else {
      this.tryOpen()
    }
  }
  setScreenLocked(value: boolean): void {
    this.screenLocked = value
    if (value) {
      this.pause()
    } else {
      this.tryOpen()
    }
  }

  dispose(): void {
    this.disposed = true
    this.pause()
    this.detachWindow?.()
    this.detachVisible?.()
    this.window = null
  }

  private pause(): void {
    this.epoch++
    this.active = false
    this.store.lock()
  }

  private tryOpen(): void {
    if (!this.blocked && this.canOpen()) {
      void this.openDevice().catch(() => {})
    }
  }

  private openDevice(): Promise<void> {
    this.active = true
    const epoch = this.epoch
    const previous = this.opening ?? Promise.resolve()
    const operation = previous
      .catch(() => {})
      .then(async () => {
        if (epoch !== this.epoch || !this.isOpen()) {
          throw new Error('Vault opening was cancelled.')
        }
        await this.store.unlockDevice()
      })
    this.opening = operation
    const finished = (): void => {
      if (this.opening === operation) {
        this.opening = null
      }
    }
    void operation.then(finished, finished)
    return operation
  }
}

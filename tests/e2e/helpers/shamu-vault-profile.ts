import type { PairedElectronClient } from './paired-electron-client'

export async function installIsolatedVaultProtection(client: PairedElectronClient): Promise<void> {
  await client.app.evaluate(({ clipboard, dialog }) => {
    const { randomBytes, createCipheriv, createDecipheriv } = process.getBuiltinModule('crypto')
    const key = Buffer.alloc(32, 0x37)
    const slots = globalThis as unknown as Record<symbol, unknown>
    slots[Symbol.for('orca.host.secretStore')] = {
      isEncryptionAvailable: () => true,
      describeProtectionGap: () => null,
      encryptString: (text: string) => {
        const nonce = randomBytes(12)
        const cipher = createCipheriv('aes-256-gcm', key, nonce)
        const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
        return Buffer.concat([nonce, cipher.getAuthTag(), body])
      },
      decryptString: (bytes: Buffer) => {
        const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
        decipher.setAuthTag(bytes.subarray(12, 28))
        return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString(
          'utf8'
        )
      }
    }
    let copied = ''
    clipboard.writeText = (value: string) => {
      copied = value
    }
    clipboard.readText = () => copied
    clipboard.clear = () => {
      copied = ''
    }
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
  })
  await setIsolatedVaultWindowOpen(client, true)
}

export async function setIsolatedVaultWindowOpen(
  client: PairedElectronClient,
  open: boolean
): Promise<void> {
  const url = client.page.url()
  await client.app.evaluate(
    ({ BrowserWindow }, { url, open }) => {
      const window = BrowserWindow.getAllWindows().find((row) => row.webContents.getURL() === url)
      if (!window) {
        throw new Error('Missing isolated Shamu main window.')
      }
      // Simulate its lifecycle while keeping the native test window hidden.
      window.isVisible = () => open
      window.isMinimized = () => false
      window.emit(open ? 'show' : 'hide')
    },
    { url, open }
  )
}

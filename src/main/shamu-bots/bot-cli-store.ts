import { mkdir, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { botCliReceiptSchema, type BotCliReceipt } from '../../shared/bot-cli-prompts'
import { writeSidecarSnapshot } from '../filesystem/sidecar-snapshot-file'

export class BotCliStore {
  readonly directory: string
  constructor(directory: string) {
    this.directory = join(directory, 'bot-cli-requests')
  }
  file(requestId: string): string {
    return join(this.directory, `${z.uuid().parse(requestId)}.json`)
  }
  async read(requestId: string): Promise<BotCliReceipt | null> {
    try {
      return botCliReceiptSchema.parse(JSON.parse(await readFile(this.file(requestId), 'utf8')))
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null
      }
      throw error
    }
  }
  async write(receipt: BotCliReceipt): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    await writeSidecarSnapshot(
      this.file(receipt.request.requestId),
      botCliReceiptSchema.parse(receipt),
      0o600
    )
  }
  async list(): Promise<{ receipts: BotCliReceipt[]; incomplete: boolean }> {
    let names: string[]
    try {
      names = await readdir(this.directory)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return { receipts: [], incomplete: false }
      }
      throw error
    }
    const receipts: BotCliReceipt[] = []
    let incomplete = false
    for (const name of names.filter(
      (name) => name.endsWith('.json') && z.uuid().safeParse(name.slice(0, -5)).success
    )) {
      try {
        const receipt = await this.read(name.slice(0, -5))
        if (receipt) {
          receipts.push(receipt)
        }
      } catch {
        incomplete = true
      }
    }
    return { receipts, incomplete }
  }
}

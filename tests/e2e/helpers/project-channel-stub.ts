import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test as base } from './orca-app'

export const test = base.extend<{
  claudeStub: { command: string; launchLog: string }
  claudeModelSwitching: boolean
  claudeSidebarQuestions: boolean
}>({
  claudeModelSwitching: [false, { option: true }],
  claudeSidebarQuestions: [false, { option: true }],
  claudeStub: async (
    { registerPostElectronShutdownCleanup, claudeModelSwitching, claudeSidebarQuestions },
    provideFixture
  ) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'project-channel-protocol-'))
    registerPostElectronShutdownCleanup(async () =>
      rmSync(directory, { recursive: true, force: true })
    )
    const command = path.join(directory, 'claude')
    const launchLog = path.join(directory, 'launches.jsonl')
    const quote = (text: string): string => `'${text.replaceAll("'", "'\\''")}'`
    const script = path.join(process.cwd(), 'tests/e2e/fixtures/structured-claude-stub.cjs')
    writeFileSync(
      command,
      `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(script)} ${quote(launchLog)} ${claudeModelSwitching ? '--orca-test-model-switching ' : ''}${claudeSidebarQuestions ? '--orca-test-sidebar-questions ' : ''}"$@"\n`
    )
    chmodSync(command, 0o755)
    await provideFixture({ command, launchLog })
  }
})

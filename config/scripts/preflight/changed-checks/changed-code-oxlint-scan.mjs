import { spawnSync } from 'node:child_process'
import { resolveOxlintInvocation } from '../../tool-invocation/oxlint-cli-invocation.mjs'

function parseOxlintOutput(stdout, label) {
  const start = stdout.indexOf('{')
  const end = stdout.lastIndexOf('}')
  if (start === -1 || end === -1) {
    throw new Error(`${label} did not return Oxlint JSON output.`)
  }
  return JSON.parse(stdout.slice(start, end + 1))
}

export function runOxlintScan(root, scan, files) {
  // Windows caps command lines near 32K characters; keep every path in bounded batches.
  if (files.length > 1 && files.reduce((total, file) => total + file.length + 1, 0) > 24_000) {
    const middle = Math.ceil(files.length / 2)
    return [
      ...runOxlintScan(root, scan, files.slice(0, middle)),
      ...runOxlintScan(root, scan, files.slice(middle))
    ]
  }
  const { command, prefixArgs } = resolveOxlintInvocation(root)
  const result = spawnSync(command, [...prefixArgs, ...scan.args, '--format', 'json', ...files], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true
  })
  if (result.error) {
    throw result.error
  }
  if (!result.stdout.trim()) {
    process.stderr.write(result.stderr)
    throw new Error(`${scan.label} failed before producing diagnostics.`)
  }
  return parseOxlintOutput(result.stdout, scan.label).diagnostics ?? []
}

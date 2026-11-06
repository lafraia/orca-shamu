const metadata = require('./shamu-release.json')
const pkg = require('../package.json')

if (
  metadata.upstream.repository !== 'stablyai/orca' ||
  metadata.upstream.tag !== `v${pkg.version}` ||
  !/^\d+\.\d+\.\d+$/.test(pkg.version) ||
  !/^[0-9a-f]{40}$/.test(metadata.upstream.commit) ||
  !Number.isSafeInteger(metadata.revision) ||
  metadata.revision < 1
) {
  throw new Error(
    'Shamu release metadata does not match the upstream package. Run pnpm shamu:version sync after importing a release.'
  )
}

module.exports = {
  ...metadata,
  version: `${pkg.version}-shamu.${metadata.revision}`,
  tag: `shamu/v${pkg.version}-shamu.${metadata.revision}`
}

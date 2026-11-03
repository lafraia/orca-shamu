const base = require('./electron-builder.config.cjs')
const pkg = require('../package.json')
const version = `${pkg.version}${pkg.version.includes('-') ? '.' : '-'}projects.1`

// Preserve the official keychain identity and profile; this build replaces neither installed app.
module.exports = {
  ...base,
  directories: { ...base.directories, output: 'dist/project-channels' },
  extraMetadata: { ...base.extraMetadata, version },
  mac: { ...base.mac, identity: '-', hardenedRuntime: false, notarize: false },
  publish: null
}

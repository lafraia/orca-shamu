const base = require('./electron-builder.config.cjs')
const pkg = require('../package.json')
const version = `${pkg.version}${pkg.version.includes('-') ? '.' : '-'}shamu.1`

module.exports = {
  ...base,
  appId: 'com.lafraia.orca-shamu',
  productName: 'Orca Shamu',
  protocols: [],
  directories: { ...base.directories, output: 'dist/project-channels' },
  extraMetadata: { ...base.extraMetadata, name: 'orca-shamu', productName: 'Orca Shamu', version },
  mac: {
    ...base.mac,
    // Preserve the executable path used by the upstream CLI launcher.
    extendInfo: { ...base.mac.extendInfo, CFBundleExecutable: 'Orca' },
    identity: '-',
    hardenedRuntime: false,
    notarize: false
  },
  publish: null
}

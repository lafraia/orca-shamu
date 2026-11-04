const base = require('./electron-builder.config.cjs')
const release = require('./shamu-release.cjs')
const { version } = release

module.exports = {
  ...base,
  appId: 'com.lafraia.orca-shamu',
  productName: 'Orca Shamu',
  protocols: [],
  artifactName: 'Orca-Shamu-${version}-${arch}.${ext}',
  directories: { ...base.directories, output: 'dist/project-channels' },
  extraMetadata: {
    ...base.extraMetadata,
    name: 'orca-shamu',
    productName: 'Orca Shamu',
    version,
    orcaShamu: release
  },
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

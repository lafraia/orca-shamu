import { translateMain } from '../i18n/main-i18n'
export type GpuAccelerationAboutPanelOptions = {
  appName: string
  appVersion: string
  platform: NodeJS.Platform
  gpuFallbackActive: boolean
  gpuFeatureStatus: Pick<Electron.GPUFeatureStatus, 'gpu_compositing'> | null
}

export function describeGpuAcceleration(
  gpuFeatureStatus: Pick<Electron.GPUFeatureStatus, 'gpu_compositing'> | null,
  gpuFallbackActive: boolean
): string {
  if (gpuFallbackActive) {
    return translateMain('native.about.gpu.safeMode', 'Disabled (Safe Graphics Mode)')
  }

  const compositing = gpuFeatureStatus?.gpu_compositing.trim().toLowerCase()
  if (!compositing || compositing === 'undefined') {
    return translateMain('native.about.gpu.unknownStatus', 'Status unavailable')
  }
  if (compositing === 'enabled') {
    return translateMain('native.about.gpu.enabled', 'Enabled')
  }
  if (compositing.includes('software')) {
    return translateMain('native.about.gpu.software', 'Software rendering')
  }
  if (compositing.startsWith('disabled')) {
    return translateMain('native.about.gpu.disabled', 'Disabled')
  }
  if (compositing.startsWith('unavailable')) {
    return translateMain('native.about.gpu.unavailable', 'Unavailable')
  }
  return translateMain('native.about.gpu.unknown', 'Unknown ({{status}})', { status: compositing })
}

export function createGpuAccelerationAboutPanelOptions({
  appName,
  appVersion,
  platform,
  gpuFallbackActive,
  gpuFeatureStatus
}: GpuAccelerationAboutPanelOptions): Electron.AboutPanelOptionsOptions {
  const status = translateMain('native.about.gpu.summary', 'GPU acceleration: {{status}}', {
    status: describeGpuAcceleration(gpuFeatureStatus, gpuFallbackActive)
  })
  const shamu = appVersion.match(/^(\d+\.\d+\.\d+)-shamu\.([1-9]\d*)$/)
  const version: Pick<Electron.AboutPanelOptionsOptions, 'applicationVersion' | 'version'> =
    shamu === null
      ? { applicationVersion: appVersion }
      : platform === 'darwin'
        ? { applicationVersion: shamu[1], version: `Shamu ${shamu[2]}` }
        : { applicationVersion: `${shamu[1]} (Shamu ${shamu[2]})` }
  return {
    applicationName: appName,
    ...version,
    ...(platform === 'linux' ? { copyright: status } : { credits: status })
  }
}

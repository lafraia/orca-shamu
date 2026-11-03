export function isProjectChannelsDistribution(version: string): boolean {
  return /(?:-|\.)projects\.[0-9]/.test(version)
}

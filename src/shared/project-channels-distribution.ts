export function isProjectChannelsDistribution(version: string): boolean {
  return /(?:-|\.)(?:projects|shamu)\.[0-9]/.test(version)
}

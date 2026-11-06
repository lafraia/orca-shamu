import { afterEach, describe, expect, it } from 'vitest'
import { getDevInstanceIdentity } from '../main/startup/dev-instance-identity'
import { isShamuDistribution, SHAMU_APP_NAME, SHAMU_APP_ID } from './shamu-client'
import { isProjectChannelsDistribution } from './project-channels-distribution'
import {
  shamuAllowsSessionTarget,
  useShamuClient
} from '../renderer/src/components/shamu/shamu-client-state'

describe('Shamu frontend identity and session routing', () => {
  afterEach(() =>
    useShamuClient.setState({ enabled: false, environmentId: null, loaded: false, error: false })
  )

  it('uses its own packaged identity while preserving the official app identity', () => {
    expect(getDevInstanceIdentity(false, {}).appName).toBe('Orca')
    expect(getDevInstanceIdentity(false, {}, SHAMU_APP_NAME)).toMatchObject({
      name: SHAMU_APP_NAME,
      appName: SHAMU_APP_NAME,
      appUserModelId: SHAMU_APP_ID
    })
    expect(isShamuDistribution('1.4.247')).toBe(false)
    expect(isShamuDistribution('1.4.247-projects.1')).toBe(false)
    expect(isShamuDistribution('1.4.247-shamu.1')).toBe(true)
    expect(isProjectChannelsDistribution('1.4.247-shamu.1')).toBe(true)
  })

  it('keeps ordinary Orca routing and restricts Shamu to its paired primary', () => {
    expect(shamuAllowsSessionTarget({ kind: 'local' })).toBe(true)
    useShamuClient.setState({ enabled: true, loaded: true, environmentId: null })
    expect(shamuAllowsSessionTarget({ kind: 'local' })).toBe(false)
    useShamuClient.setState({ environmentId: 'primary' })
    expect(shamuAllowsSessionTarget({ kind: 'environment', environmentId: 'primary' })).toBe(true)
    expect(shamuAllowsSessionTarget({ kind: 'environment', environmentId: 'other' })).toBe(false)
  })
})

import { create } from 'zustand'
import type { ShamuClientState } from '../../../../shared/shamu-client'
import type { ProjectChannelMember } from '../../../../shared/project-channels'

export const useShamuClient = create<
  ShamuClientState & {
    loaded: boolean
    error: boolean
  }
>(() => ({ enabled: false, environmentId: null, loaded: false, error: false }))

export function shamuMirrorsFloatingWorkspace(environmentId?: string): boolean {
  const state = useShamuClient.getState()
  return Boolean(
    state.enabled &&
    state.environmentId &&
    (environmentId === undefined || environmentId === state.environmentId)
  )
}

export function shamuAllowsSessionTarget(target: ProjectChannelMember['target']): boolean {
  const state = useShamuClient.getState()
  return (
    !state.enabled ||
    (state.environmentId !== null &&
      target.kind === 'environment' &&
      target.environmentId === state.environmentId)
  )
}

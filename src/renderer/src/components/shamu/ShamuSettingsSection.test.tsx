// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { useAppStore } from '@/store'
import { ActiveSettingsSectionProvider } from '../settings/section-layout/SettingsSection'
import { TooltipProvider } from '../ui/tooltip'
import { ShamuSettingsSection } from './ShamuSettingsSection'
import { ShamuStatusSegment } from './ShamuStatusSegment'
import { useShamuClient } from './shamu-client-state'
import { buildSettingsNavigationMetadata } from '@/hooks/useSettingsNavigationMetadata'

const connection = vi.hoisted(() => ({ enabled: true, live: true, environmentId: 'primary' }))
vi.mock('./use-shamu-connection', () => ({ useShamuConnection: () => connection }))
const readPreferences = vi.fn()
const save = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  connection.enabled = true
  connection.live = true
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ settings: getDefaultSettings('/fixture'), updateSettingsOrThrow: save })
  useShamuClient.setState({ enabled: true, loaded: true, environmentId: 'primary', error: false })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { shamuClient: { readPrimaryPreferences: readPreferences } }
  })
})
afterEach(() => {
  cleanup()
  useShamuClient.setState(useShamuClient.getInitialState(), true)
})

function pane() {
  return render(
    <TooltipProvider>
      <ActiveSettingsSectionProvider value="orca-shamu">
        <ShamuSettingsSection />
      </ActiveSettingsSectionProvider>
    </TooltipProvider>
  )
}

describe('Shamu settings ownership', () => {
  it('imports interface preferences only on demand and reports success after saving locally', async () => {
    const preferences = { appFontFamily: 'Fixture Font', terminalFontSize: 17 }
    readPreferences.mockResolvedValue(preferences)
    save.mockResolvedValue(undefined)
    pane()
    expect(readPreferences).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Import interface settings' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith(preferences))
    await screen.findByText('Settings imported')
    expect(readPreferences).toHaveBeenCalledOnce()
  })

  it('keeps import disabled offline and does not save when reading the primary fails', async () => {
    connection.live = false
    const view = pane()
    const button = screen.getByRole('button', { name: 'Import interface settings' })
    expect(button).toHaveProperty('disabled', true)
    connection.live = true
    view.rerender(
      <TooltipProvider>
        <ActiveSettingsSectionProvider value="orca-shamu">
          <ShamuSettingsSection />
        </ActiveSettingsSectionProvider>
      </TooltipProvider>
    )
    readPreferences.mockRejectedValue(new Error('Primary unavailable'))
    fireEvent.click(button)
    await screen.findByRole('alert')
    expect(save).not.toHaveBeenCalled()
  })

  it('opens Shamu settings in the local scope from the statusbar', () => {
    const target = vi.fn()
    const open = vi.fn()
    useAppStore.setState({ openSettingsTarget: target, openSettingsPage: open })
    const view = render(<ShamuStatusSegment />)
    fireEvent.click(screen.getByRole('button', { name: 'Primary Orca Connected' }))
    expect(target).toHaveBeenCalledWith({
      pane: 'orca-shamu',
      repoId: null,
      hostScope: { kind: 'local' }
    })
    expect(open).toHaveBeenCalledOnce()
    connection.enabled = false
    act(() => view.rerender(<ShamuStatusSegment />))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers the custom section only in the Shamu desktop navigation', () => {
    const base = { isMac: true, isWindows: false, isWebClient: false, repos: [] }
    expect(
      buildSettingsNavigationMetadata({ ...base, isShamu: true }).map((row) => row.id)
    ).toContain('orca-shamu')
    expect(buildSettingsNavigationMetadata(base).map((row) => row.id)).not.toContain('orca-shamu')
    expect(
      buildSettingsNavigationMetadata({ ...base, isShamu: true, isWebClient: true }).map(
        (row) => row.id
      )
    ).not.toContain('orca-shamu')
  })
})

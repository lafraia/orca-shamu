// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { channelFixture } from '../../../../shared/project-channels.test-fixture'
import {
  persistFloatingTerminalPanelOpen,
  readPersistedFloatingTerminalPanelViewState
} from '../floating-terminal/floating-terminal-panel-view-state'
import { useProjectChannels } from '../project-channels/project-channel-store'
import { useShamuClient } from '../shamu/shamu-client-state'
import { NativeChatMarkdown } from './NativeChatMarkdown'
import {
  createNativeChatBotCatalogue,
  nativeChatBotCatalogue,
  nativeChatBotId
} from './native-chat-bot-catalogue'

describe('bot mentions in the native transcript', () => {
  const bot = (id: string, name: string) => ({
    ...channelFixture(),
    id,
    name,
    members: [],
    messages: [],
    mainMemberId: null
  })
  beforeEach(() => {
    useShamuClient.setState({ enabled: true, environmentId: 'primary' })
    useProjectChannels.setState({
      snapshot: {
        version: 1,
        revision: 0,
        channels: [
          bot('ceo', 'CEO'),
          bot('dev', 'Dev: Vagalume'),
          bot('short-dev', 'Dev'),
          bot('qa', 'QA (PT)'),
          bot('jose', 'José Ávila')
        ]
      },
      loaded: true,
      selectedId: 'ceo',
      mode: 'projects'
    })
    useAppStore.setState({ activeView: 'terminal', floatingWorkspacePanelOpen: false })
  })
  afterEach(() => {
    cleanup()
    useShamuClient.setState({ enabled: false, environmentId: null })
    vi.restoreAllMocks()
  })

  it('renders saved names with spaces, punctuation and accents as composer-style pills', () => {
    render(
      <NativeChatMarkdown
        content="Mandei um oi para @Dev: Vagalume. Depois, @QA (PT) e @José Ávila. @ceo pode acompanhar."
        variant="document"
      />
    )
    for (const name of ['Dev: Vagalume', 'QA (PT)', 'José Ávila', 'CEO']) {
      expect(screen.getByRole('button', { name: `Open bot chat: ${name}` })).toHaveAttribute(
        'data-variant',
        'promptPill'
      )
    }
    expect(screen.queryByRole('button', { name: 'Open bot chat: Dev' })).toBeNull()
  })
  it('opens the referenced bot and clears a floating overlay without sending another message', () => {
    useAppStore.setState({ floatingWorkspacePanelOpen: true })
    persistFloatingTerminalPanelOpen(true)
    render(<NativeChatMarkdown content="Fale com @Dev: Vagalume." variant="document" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open bot chat: Dev: Vagalume' }))
    expect(useProjectChannels.getState()).toMatchObject({ selectedId: 'dev', mode: 'projects' })
    expect(useAppStore.getState()).toMatchObject({
      activeView: 'project-chat',
      floatingWorkspacePanelOpen: false
    })
    expect(readPersistedFloatingTerminalPanelViewState()?.open).toBe(false)
  })
  it('leaves emails, identifiers, code and existing Markdown links intact', () => {
    const onLinkClick = vi.fn((event) => event.preventDefault())
    render(
      <NativeChatMarkdown
        content={
          '@CEO_extra a@CEO @Unknown `@CEO` [@CEO](https://example.com)\n\n```text\n@CEO\n```\n\nFale com @CEO.'
        }
        variant="compact"
        onLinkClick={onLinkClick}
      />
    )
    expect(screen.getAllByRole('button', { name: 'Open bot chat: CEO' })).toHaveLength(1)
    const link = screen.getByRole('link', { name: '@CEO' })
    expect(link).toHaveAttribute('href', 'https://example.com')
    fireEvent.click(link)
    expect(onLinkClick).toHaveBeenCalledWith(expect.anything(), 'https://example.com')
  })
  it('keeps the original renderer when Shamu is disabled or a name is ambiguous', () => {
    useShamuClient.setState({ enabled: false })
    const view = render(<NativeChatMarkdown content="@CEO" />)
    expect(screen.queryByRole('button')).toBeNull()
    act(() => {
      useShamuClient.setState({ enabled: true })
      useProjectChannels.setState({
        snapshot: { version: 1, revision: 1, channels: [bot('one', 'CEO'), bot('two', 'ceo')] }
      })
    })
    view.rerender(<NativeChatMarkdown content="@CEO" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(
      createNativeChatBotCatalogue([
        { id: 'one', name: 'CEO' },
        { id: 'two', name: 'ceo' }
      ]).byName.size
    ).toBe(0)
    expect(nativeChatBotId('#orca-shamu-bot/%E0%A4%A')).toBeNull()
  })
  it('reuses the catalogue when only the bot appearance or organization changes', () => {
    const channels = [bot('ceo', 'CEO')]
    const original = nativeChatBotCatalogue(channels)
    expect(nativeChatBotCatalogue([{ ...channels[0], pinned: true, section: 'Operations' }])).toBe(
      original
    )
  })
})

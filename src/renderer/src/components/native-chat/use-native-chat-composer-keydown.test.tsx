// @vitest-environment happy-dom

import type { BotMention } from '../../../../shared/bot-mentions'
import type { NativeChatResourceReference } from '../../../../shared/native-chat/native-chat-resource-reference'
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { useState, type KeyboardEventHandler } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useNativeChatRecallPosition } from './use-native-chat-composer-recall'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { ComposerAutocomplete } from '../../../../shared/native-chat/input/native-chat-composer-autocomplete'
import { useNativeChatComposerKeyDown } from './use-native-chat-composer-keydown'

const COMMAND = {
  kind: 'command' as const,
  id: 'command:clear',
  name: 'clear',
  token: '/clear',
  description: 'Clear history',
  skillCollision: false
}

function picker(items = [COMMAND]): Extract<ComposerAutocomplete, { mode: 'slash' }> {
  return {
    mode: 'slash',
    query: '',
    items,
    triggerKey: '/:0',
    prefix: '/',
    dispatchable: true,
    grouped: false,
    commandsEnabled: true,
    skillsEnabled: false,
    skillStatus: 'ready'
  }
}

function setup(
  autocomplete: ComposerAutocomplete = picker(),
  composing = false,
  draft = '/',
  {
    files = [],
    bots = [],
    resources = [],
    activeSuggestion = 0,
    loading = false
  }: {
    files?: readonly string[]
    bots?: readonly BotMention[]
    resources?: readonly NativeChatResourceReference[]
    activeSuggestion?: number
    loading?: boolean
  } = {}
) {
  const callbacks = {
    completeMention: vi.fn(),
    completeBotMention: vi.fn(),
    completePickerItem: vi.fn(),
    dispatchPickerCommand: vi.fn(),
    dismissPicker: vi.fn(),
    interrupt: vi.fn(),
    send: vi.fn(),
    setActiveSuggestion: vi.fn(),
    setDraft: vi.fn(),
    setCaret: vi.fn()
  }
  const hook = renderHook(() =>
    useNativeChatComposerKeyDown({
      autocomplete,
      mentionFiles: { files, bots, resources, loading, failed: false },
      activeSuggestion,
      draft,
      isComposing: () => composing,
      ...callbacks
    })
  )
  return { handler: hook.result.current, callbacks }
}

describe('useNativeChatComposerKeyDown', () => {
  const mention: ComposerAutocomplete = { mode: 'mention', query: 'app', triggerKey: '@:5' }

  const setupMention = (options?: Parameters<typeof setup>[3]) =>
    setup(mention, false, 'open @app', options)

  it('does not send a query with no selected result while the catalogue is empty', () => {
    const { handler, callbacks } = setupMention({ activeSuggestion: -1 })
    press(handler, 'Enter')
    expect(callbacks.send).not.toHaveBeenCalled()
    expect(callbacks.completeMention).not.toHaveBeenCalled()
  })

  it('requires an explicit reference selection before Enter can notify a bot', () => {
    const initial = setupMention({
      bots: [{ id: 'ceo', name: 'CEO' }],
      files: ['README.md'],
      activeSuggestion: -1
    })
    press(initial.handler, 'Enter')
    expect(initial.callbacks.completeBotMention).not.toHaveBeenCalled()
    expect(initial.callbacks.completeMention).not.toHaveBeenCalled()
    expect(initial.callbacks.send).not.toHaveBeenCalled()
    const tab = setupMention({ bots: [{ id: 'ceo', name: 'CEO' }], activeSuggestion: -1 })
    press(tab.handler, 'Tab')
    expect(tab.callbacks.dismissPicker).toHaveBeenCalledWith(mention.triggerKey)
    expect(tab.callbacks.completeBotMention).not.toHaveBeenCalled()
  })

  it('completes resources with the same global index as bots and files', () => {
    const reference: NativeChatResourceReference = {
      kind: 'workspace',
      id: 'folder:launch',
      hostId: 'runtime:primary',
      label: 'Launch',
      description: '/launch',
      path: '/launch'
    }
    const selected = setupMention({
      bots: [{ id: 'ceo', name: 'CEO' }],
      resources: [reference],
      files: ['README.md'],
      activeSuggestion: 1
    })
    press(selected.handler, 'Enter')
    expect(selected.callbacks.completeMention).toHaveBeenCalledWith(reference)
    expect(selected.callbacks.completeBotMention).not.toHaveBeenCalled()
    const last = setupMention({
      bots: [{ id: 'ceo', name: 'CEO' }],
      resources: [reference],
      files: ['README.md'],
      activeSuggestion: 2
    })
    press(last.handler, 'Tab')
    expect(last.callbacks.completeMention).toHaveBeenCalledWith('README.md')
  })

  it('picks a bot with Enter and a file after the bot rows with Tab', () => {
    const bot = { id: 'ceo', name: 'CEO' }
    const first = setupMention({ bots: [bot], files: ['README.md'] })
    press(first.handler, 'Enter')
    expect(first.callbacks.completeBotMention).toHaveBeenCalledWith(bot)
    expect(first.callbacks.send).not.toHaveBeenCalled()
    const second = setupMention({ bots: [bot], files: ['README.md'], activeSuggestion: 1 })
    press(second.handler, 'Tab')
    expect(second.callbacks.completeMention).toHaveBeenCalledWith('README.md')
    expect(second.callbacks.completeBotMention).not.toHaveBeenCalled()
    cleanup()
  })

  function press(handler: KeyboardEventHandler<HTMLElement>, key: string, shiftKey = false): void {
    render(<div data-testid="composer" onKeyDown={handler} />)
    fireEvent.keyDown(screen.getByTestId('composer'), { key, shiftKey })
    cleanup()
  }

  describe('prompt recall', () => {
    const userMessage = (id: string, text: string): NativeChatMessage => ({
      id,
      role: 'user',
      blocks: [{ type: 'text', text }],
      timestamp: null,
      source: 'transcript'
    })

    const onEveryEdge = (): boolean => true

    function Composer({
      prompts,
      initialDraft = '',
      hasAttachments,
      isCaretOnVisualEdge = onEveryEdge
    }: {
      prompts: string[]
      initialDraft?: string
      hasAttachments?: boolean
      isCaretOnVisualEdge?: (edge: 'start' | 'end') => boolean
    }): React.JSX.Element {
      const [draft, setDraft] = useState(initialDraft)
      const [recallPosition, setRecallPosition] = useNativeChatRecallPosition(draft)
      const onKeyDown = useNativeChatComposerKeyDown({
        autocomplete: { mode: 'none' },
        activeSuggestion: 0,
        draft,
        mentionFiles: { files: [], loading: false, failed: false },
        completeMention: vi.fn(),
        completeBotMention: vi.fn(),
        recall: {
          source: { messages: prompts.map((text, index) => userMessage(String(index), text)) },
          position: recallPosition,
          setPosition: setRecallPosition,
          isCaretOnVisualEdge,
          show: vi.fn()
        },
        isComposing: () => false,
        completePickerItem: vi.fn(),
        dispatchPickerCommand: vi.fn(),
        dismissPicker: vi.fn(),
        interrupt: vi.fn(),
        send: vi.fn(),
        setActiveSuggestion: vi.fn(),
        setDraft,
        setCaret: vi.fn(),
        ...(hasAttachments === undefined ? {} : { hasAttachments })
      })
      return (
        <textarea
          aria-label="composer"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
      )
    }

    function setup(props: Parameters<typeof Composer>[0]) {
      const field = render(<Composer {...props} />).container.querySelector('textarea')!
      return {
        field,
        press: (key: string, init: KeyboardEventInit = {}) => {
          const claimed = !fireEvent.keyDown(field, { key, ...init })
          return { draft: field.value, claimed }
        }
      }
    }

    it('treats an edited recall as a typed draft', () => {
      const { field, press } = setup({ prompts: ['one', 'two'] })
      press('ArrowUp')
      fireEvent.change(field, { target: { value: 'two, edited' } })
      expect(press('ArrowUp')).toEqual({ draft: 'two, edited', claimed: false })
      // Edited back to the recalled text, it is still a typed draft.
      fireEvent.change(field, { target: { value: 'two' } })
      expect(press('ArrowUp')).toEqual({ draft: 'two', claimed: false })
    })
  })

  describe('steer chord', () => {
    function Composer({
      initialDraft,
      alternateSteers,
      send,
      steerHead
    }: {
      initialDraft: string
      alternateSteers: boolean
      send: (intent?: { alternate?: boolean }) => void
      steerHead: () => boolean
    }): React.JSX.Element {
      const [draft, setDraft] = useState(initialDraft)
      const onKeyDown = useNativeChatComposerKeyDown({
        autocomplete: { mode: 'none' },
        activeSuggestion: 0,
        draft,
        mentionFiles: { files: [], loading: false, failed: false },
        completeMention: vi.fn(),
        isComposing: () => false,
        completePickerItem: vi.fn(),
        dispatchPickerCommand: vi.fn(),
        dismissPicker: vi.fn(),
        interrupt: vi.fn(),
        send,
        steerHead,
        alternateSteers,
        setActiveSuggestion: vi.fn(),
        setDraft,
        setCaret: vi.fn()
      })
      return (
        <textarea aria-label="composer" value={draft} onChange={() => {}} onKeyDown={onKeyDown} />
      )
    }

    function pressModEnter(
      initialDraft: string,
      { alternateSteers = true, ...init }: KeyboardEventInit & { alternateSteers?: boolean } = {}
    ) {
      const send = vi.fn()
      const steerHead = vi.fn(() => true)
      const field = render(
        <Composer
          initialDraft={initialDraft}
          alternateSteers={alternateSteers}
          send={send}
          steerHead={steerHead}
        />
      ).container.querySelector('textarea')!
      // Both modifiers: the platform picks which one is the chord's.
      fireEvent.keyDown(field, { key: 'Enter', metaKey: true, ctrlKey: true, ...init })
      return { send, steerHead }
    }

    it('steers the head card from an empty composer, once per press, only where the chord steers', () => {
      const { send, steerHead } = pressModEnter('')
      expect(steerHead).toHaveBeenCalledTimes(1)
      expect(send).not.toHaveBeenCalled()
      expect(pressModEnter('', { repeat: true }).steerHead).not.toHaveBeenCalled()
      // With follow-ups off the chord queues, so a second press never steers the card just queued.
      expect(pressModEnter('', { alternateSteers: false }).steerHead).not.toHaveBeenCalled()
      expect(pressModEnter('steer this').steerHead).not.toHaveBeenCalled()
    })
  })
})

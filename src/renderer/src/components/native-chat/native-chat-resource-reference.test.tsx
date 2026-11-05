// @vitest-environment happy-dom
import { createRef } from 'react'
import { act, cleanup, render, within, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NativeChatPromptEditor } from './NativeChatPromptEditor'
import type { NativeChatComposerInput } from './native-chat-composer-input'
import { completeNativeChatResourceMention } from './native-chat-mention-choices'
import { promptEditor } from './native-chat-prompt-editor.test-support'
import { nativeChatResourceToken } from '../../../../shared/native-chat/native-chat-resource-reference'
import { selectedNativeChatBots } from './native-chat-bot-mentions'
import { clearNativeChatComposerDraftsForTests } from './native-chat-composer-draft-store'

afterEach(() => {
  cleanup()
  clearNativeChatComposerDraftsForTests()
})
it('inserts one persistent reference atom at the caret, preserves the suffix and supports undo', async () => {
  const reference = {
    kind: 'workspace' as const,
    id: 'folder:launch',
    hostId: 'runtime:primary' as const,
    label: 'CEO',
    path: '/Projects/Launch Plan',
    description: 'Launch plan'
  }
  const input = createRef<NativeChatComposerInput>()
  const view = render(
    <NativeChatPromptEditor
      scopeKey="resource"
      inputRef={input}
      initialValue="Olá @CE suffix"
      disabled={false}
      placeholder="Message"
      onChange={vi.fn()}
      onSelect={vi.fn()}
    />
  )
  const editor = promptEditor(within(view.container).getByRole('textbox'))
  act(() => {
    input.current!.setSelectionRange(7, 7)
    expect(completeNativeChatResourceMention(input.current, reference)).toBe(true)
  })
  expect(input.current!.value).toBe(`Olá ${nativeChatResourceToken(reference)}  suffix`)
  await waitFor(() =>
    expect(view.container.querySelectorAll('[data-native-chat-resource-reference]')).toHaveLength(1)
  )
  expect(selectedNativeChatBots(input.current!.value, editor.getJSON())).toEqual([])
  act(() => {
    editor.commands.undo()
  })
  expect(input.current!.value).toBe('Olá @CE suffix')
  act(() => {
    editor.commands.redo()
  })
  await waitFor(() =>
    expect(view.container.querySelectorAll('[data-native-chat-resource-reference]')).toHaveLength(1)
  )
})

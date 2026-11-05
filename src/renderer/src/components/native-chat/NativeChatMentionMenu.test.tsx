// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NativeChatMentionMenu } from './NativeChatMentionMenu'
import type { NativeChatResourceReference } from '../../../../shared/native-chat/native-chat-resource-reference'

afterEach(cleanup)
const workspace: NativeChatResourceReference = {
  kind: 'workspace',
  id: 'launch',
  hostId: 'runtime:primary',
  label: 'Launch workspace',
  path: '/launch',
  description: '/launch'
}
const base = {
  files: ['README.md'],
  bots: [{ id: 'ceo', name: 'CEO' }],
  resources: [
    workspace,
    {
      ...workspace,
      kind: 'project' as const,
      id: 'project',
      label: 'Launch project',
      projectKind: 'repo' as const
    },
    {
      ...workspace,
      kind: 'issue' as const,
      id: 'issue',
      label: '#42 Launch issue',
      url: 'https://github.com/example/launch/issues/42'
    }
  ],
  loading: false,
  failed: false
}
it('opens with no selected bot or reference and groups every category', () => {
  const choose = vi.fn()
  const chooseBot = vi.fn()
  render(
    <NativeChatMentionMenu
      mention={base}
      activeIndex={-1}
      listboxId="mentions"
      onChoose={choose}
      onChooseBot={chooseBot}
    />
  )
  expect(screen.getAllByRole('option')).toHaveLength(5)
  expect(screen.queryAllByRole('option', { selected: true })).toHaveLength(0)
  expect(screen.getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual([
    'Bots',
    'Workspaces',
    'Projects',
    'Issues',
    'Files'
  ])
  fireEvent.pointerDown(screen.getByRole('option', { name: 'Launch workspace /launch' }))
  expect(choose).toHaveBeenCalledWith(workspace)
  expect(chooseBot).not.toHaveBeenCalled()
})
it('uses one selection for pointer and keyboard instead of leaving CEO highlighted', () => {
  const active = vi.fn()
  render(
    <NativeChatMentionMenu
      mention={base}
      activeIndex={4}
      listboxId="mentions"
      onChoose={vi.fn()}
      onActiveIndexChange={active}
    />
  )
  const options = screen.getAllByRole('option')
  expect(screen.getAllByRole('option', { selected: true })).toEqual([options[4]])
  expect(options[0].className).not.toContain('hover:bg-accent')
  fireEvent.pointerMove(options[0], { movementX: 1, movementY: 1 })
  expect(active).toHaveBeenCalledWith(0)
})
it('retains the selected file identity when asynchronous issue results are inserted ahead of it', () => {
  const active = vi.fn()
  const mention = { ...base, resources: [workspace] }
  const view = render(
    <NativeChatMentionMenu
      mention={mention}
      activeIndex={2}
      listboxId="mentions"
      onChoose={vi.fn()}
      onActiveIndexChange={active}
    />
  )
  view.rerender(
    <NativeChatMentionMenu
      mention={base}
      activeIndex={2}
      listboxId="mentions"
      onChoose={vi.fn()}
      onActiveIndexChange={active}
    />
  )
  expect(active).toHaveBeenLastCalledWith(4)
  expect(screen.getByRole('option', { selected: true }).textContent).toBe('README.md')
})

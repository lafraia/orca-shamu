// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createCmdJTaskSearchRequests } from '../cmd-j/task-search-requests'
import { makeCmdJTaskSearchResult } from '../cmd-j/task-search-results'
import { useNativeChatMentionIssues } from './use-native-chat-mention-issues'

vi.mock('../cmd-j/task-search-requests', () => ({ createCmdJTaskSearchRequests: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})
const result = (title: string) =>
  makeCmdJTaskSearchResult(
    {
      provider: 'github',
      issue: {
        id: title,
        type: 'issue',
        number: 42,
        title,
        state: 'open',
        url: `https://github.com/example/launch/issues/${title === 'new' ? 43 : 42}`,
        labels: [],
        updatedAt: '',
        author: null,
        repoId: 'repo',
        repoHostId: 'runtime:primary'
      }
    },
    {
      kind: 'task-source',
      provider: 'github',
      projectId: 'repo',
      repoId: 'repo',
      hostId: 'runtime:primary'
    },
    'repo',
    'Primary'
  )
it('debounces shared provider lookups and never starts requests for closed or short queries', async () => {
  vi.useFakeTimers()
  vi.mocked(createCmdJTaskSearchRequests).mockReturnValue([
    {
      id: 'github',
      provider: 'github',
      hostLabel: 'Primary',
      run: vi.fn(async () => [result('Launch')])
    }
  ])
  const hook = renderHook<ReturnType<typeof useNativeChatMentionIssues>, string | null>(
    (query: string | null) => useNativeChatMentionIssues(query, 'runtime:primary'),
    { initialProps: null }
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700)
  })
  expect(createCmdJTaskSearchRequests).not.toHaveBeenCalled()
  hook.rerender('L')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700)
  })
  expect(createCmdJTaskSearchRequests).not.toHaveBeenCalled()
  hook.rerender('Launch')
  expect(hook.result.current.loading).toBe(true)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600)
  })
  expect(hook.result.current.resources).toMatchObject([
    { label: '#42 Launch', hostId: 'runtime:primary' }
  ])
  expect(hook.result.current.loading).toBe(false)
  expect(createCmdJTaskSearchRequests).toHaveBeenCalledWith(
    expect.objectContaining({ filter: { hostIds: ['runtime:primary'], repoIds: [] } })
  )
})
it('ignores late results from an old query and keeps partial results when another source fails', async () => {
  vi.useFakeTimers()
  const old = Promise.withResolvers<ReturnType<typeof result>[]>()
  vi.mocked(createCmdJTaskSearchRequests)
    .mockReturnValueOnce([
      { id: 'old', provider: 'github', hostLabel: 'Primary', run: () => old.promise }
    ])
    .mockReturnValueOnce([
      { id: 'new', provider: 'github', hostLabel: 'Primary', run: async () => [result('new')] },
      {
        id: 'failure',
        provider: 'gitlab',
        hostLabel: 'Primary',
        run: async () => {
          throw new Error('unavailable')
        }
      }
    ])
  const hook = renderHook((query: string) => useNativeChatMentionIssues(query, 'runtime:primary'), {
    initialProps: 'old'
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600)
  })
  hook.rerender('new')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600)
  })
  expect(hook.result.current.resources).toMatchObject([{ label: '#42 new' }])
  expect(hook.result.current.failed).toBe(true)
  await act(async () => {
    old.resolve([result('old')])
    await old.promise
  })
  expect(hook.result.current.resources).toMatchObject([{ label: '#42 new' }])
  hook.unmount()
})

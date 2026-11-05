import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { forEachWithConcurrency } from '../../../../shared/map-with-concurrency'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { NativeChatResourceReference } from '../../../../shared/native-chat/native-chat-resource-reference'
import { createCmdJTaskSearchRequests } from '../cmd-j/task-search-requests'

type Snapshot = {
  key: string
  resources: NativeChatResourceReference[]
  loading: boolean
  failed: boolean
}
const EMPTY_RESOURCES: NativeChatResourceReference[] = []
export function useNativeChatMentionIssues(query: string | null, hostId: ExecutionHostId | null) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = JSON.stringify([query, hostId, attempt])
  const createRequests = useEffectEvent((signal: AbortSignal) => {
    const state = useAppStore.getState()
    return createCmdJTaskSearchRequests({
      query: query ?? '',
      repos: state.repos,
      settings: state.settings,
      accountBackedTaskSourceHostId: hostId ?? 'local',
      filter: { hostIds: hostId ? [hostId] : [], repoIds: [] },
      hostLabels: new Map(),
      signal
    })
  })
  useEffect(() => {
    if (!hostId || query === null || query.trim().length < 2) {
      return
    }
    const controller = new AbortController()
    const resources = new Map<string, NativeChatResourceReference>()
    let failed = false
    const publish = (loading: boolean): void => {
      if (!controller.signal.aborted) {
        setSnapshot({ key, resources: [...resources.values()].slice(0, 20), loading, failed })
      }
    }
    const timer = setTimeout(() => {
      const requests = createRequests(controller.signal)
      publish(requests.length > 0)
      void forEachWithConcurrency(requests, 4, async (request) => {
        if (controller.signal.aborted) {
          return
        }
        try {
          const rows = await request.run()
          for (const row of rows) {
            if (row.sourceContext.hostId === hostId) {
              resources.set(row.task.issue.url, {
                kind: 'issue',
                id: row.task.issue.url,
                url: row.task.issue.url,
                hostId,
                label: `${row.identifier} ${row.title}`,
                description: `${row.task.provider} · ${row.task.issue.url}`
              })
            }
          }
        } catch {
          failed = true
        }
        publish(true)
      }).then(() => publish(false))
    }, 600)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, hostId, key])
  const current = snapshot?.key === key ? snapshot : null
  const searchEnabled = Boolean(hostId && query !== null && query.trim().length >= 2)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  return useMemo(
    () => ({
      resources: current?.resources ?? EMPTY_RESOURCES,
      loading: current?.loading ?? searchEnabled,
      failed: current?.failed ?? false,
      searchEnabled,
      retry
    }),
    [current, searchEnabled, retry]
  )
}

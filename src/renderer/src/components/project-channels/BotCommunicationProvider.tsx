import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  botCommunicationPairKey,
  type BotCommunication,
  type BotCommunicationSnapshot
} from '../../../../shared/bot-communications'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { useShamuClient } from '../shamu/shamu-client-state'
import { BotCommunicationContext } from './bot-communication-context'
import { BotCommunicationThread } from '../native-chat/BotCommunicationThread'
import { openProjectChannel } from './project-channel-store'

export function BotCommunicationProvider({
  sessionId,
  target,
  isVisible,
  children
}: {
  sessionId: string
  target: RuntimeClientTarget
  isVisible: boolean
  children: ReactNode
}): React.JSX.Element {
  const environmentId = target.kind === 'environment' ? target.environmentId : null
  const enabled = useShamuClient(
    (state) => state.enabled && state.environmentId === environmentId && environmentId !== null
  )
  const [snapshot, setSnapshot] = useState<BotCommunicationSnapshot>({
    entries: [],
    incomplete: false
  })
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<BotCommunication | null>(null)
  const [attempt, setAttempt] = useState(0)
  const close = useCallback(() => setSelected(null), [])
  const open = useCallback((entry: BotCommunication) => {
    if (entry.cli && entry.recipient.botId) {
      openProjectChannel(entry.recipient.botId)
      return
    }
    setSelected(entry)
  }, [])
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  useEffect(() => {
    const api = window.api?.projectChannels?.communications
    if (!enabled || !isVisible || !api) {
      return
    }
    let current = true
    let reading = false
    let dirty = false
    const refresh = async (): Promise<void> => {
      if (reading) {
        dirty = true
        return
      }
      reading = true
      do {
        dirty = false
        try {
          const next = await api.read(sessionId)
          if (current) {
            setSnapshot(next)
            setLoaded(true)
            setError(null)
          }
        } catch {
          if (current) {
            setLoaded(true)
            setError('Could not load bot communication.')
          }
        }
      } while (current && dirty)
      reading = false
    }
    void refresh()
    const unsubscribe = api.onChanged(() => void refresh())
    return () => {
      current = false
      unsubscribe()
    }
  }, [enabled, isVisible, sessionId, environmentId, attempt])
  const value = useMemo(
    () => ({
      ...snapshot,
      sessionId,
      target,
      loaded,
      error,
      selectedPair: selected ? botCommunicationPairKey(selected) : null,
      open,
      close,
      retry
    }),
    [snapshot, sessionId, target, loaded, error, selected, open, close, retry]
  )
  if (!enabled) {
    return <>{children}</>
  }
  return (
    <BotCommunicationContext.Provider value={value}>
      {children}
      {selected && isVisible ? (
        <BotCommunicationThread
          key={botCommunicationPairKey(selected)}
          selected={snapshot.entries.find((entry) => entry.id === selected.id) ?? selected}
          entries={snapshot.entries}
          target={target}
          onClose={close}
        />
      ) : null}
    </BotCommunicationContext.Provider>
  )
}

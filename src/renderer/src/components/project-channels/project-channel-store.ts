import { create } from 'zustand'
import { useAppStore } from '@/store'
import { checkpointProjectDrafts, recoverProjectDrafts } from './project-channel-draft-checkpoint'
import {
  emptyProjectChannels,
  type ProjectChannel,
  type ProjectChannelsSnapshot
} from '../../../../shared/project-channels'

type ProjectChannelState = {
  snapshot: ProjectChannelsSnapshot
  selectedId: string | null
  mode: 'projects' | 'workspaces'
  editor: { channelId?: string; tabId?: string; section?: 'conversations' } | null
  loaded: boolean
  error: string | null
  drafts: Record<string, string>
  draftEpoch: number
}

export const useProjectChannels = create<ProjectChannelState>(() => ({
  snapshot: emptyProjectChannels(),
  selectedId: null,
  mode: 'projects',
  editor: null,
  loaded: false,
  error: null,
  drafts: {},
  draftEpoch: 0
}))

let loading: Promise<void> | null = null
let writes: Promise<unknown> = Promise.resolve()
const conversations = new Map<string, Promise<void>>()
const draftTimers = new Map<string, ReturnType<typeof setTimeout>>()
const draftVersions = new Map<string, number>()

export function loadProjectChannels(): Promise<void> {
  if (useProjectChannels.getState().loaded) {
    return Promise.resolve()
  }
  if (loading) {
    return loading
  }
  loading = (async () => {
    try {
      const api = window.api.projectChannels
      if (!api) {
        throw new Error('Bots are available in the desktop app.')
      }
      const snapshot = await api.read()
      const drafts = recoverProjectDrafts(snapshot)
      useProjectChannels.setState((state) => ({
        snapshot,
        loaded: true,
        error: null,
        drafts,
        selectedId: snapshot.channels.some((channel) => channel.id === state.selectedId)
          ? state.selectedId
          : (snapshot.channels[0]?.id ?? null)
      }))
      for (const channel of snapshot.channels) {
        if (drafts[channel.id] !== channel.draft) {
          setProjectChannelDraft(channel.id, drafts[channel.id])
        }
      }
    } catch {
      useProjectChannels.setState({
        error: 'Could not load bots. Your saved conversations have not been changed.'
      })
    } finally {
      loading = null
    }
  })()
  return loading
}

export function saveProjectChannels(
  update: (channels: ProjectChannel[]) => ProjectChannel[]
): Promise<void> {
  const run = writes.then(async () => {
    const { snapshot, loaded } = useProjectChannels.getState()
    if (!loaded || !window.api.projectChannels) {
      throw new Error('Bots are not ready.')
    }
    const channels = update(snapshot.channels)
    if (channels === snapshot.channels) {
      return
    }
    try {
      const next = await window.api.projectChannels.write({ ...snapshot, channels })
      useProjectChannels.setState({ snapshot: next, error: null })
      checkpointProjectDrafts(next, useProjectChannels.getState().drafts)
    } catch {
      useProjectChannels.setState({
        error: 'Could not save this change. Reload bots before trying again.'
      })
      throw new Error('Could not save the bot.')
    }
  })
  writes = run.catch(() => {})
  return run
}

export function changeProjectChannel(
  id: string,
  update: (channel: ProjectChannel) => ProjectChannel
): Promise<void> {
  return saveProjectChannels((channels) => {
    let changed = false
    const next = channels.map((channel) => {
      if (channel.id !== id) {
        return channel
      }
      const result = update(channel)
      changed ||= result !== channel
      return result
    })
    return changed ? next : channels
  })
}

export function ensureProjectChannelConversation(id: string): Promise<void> {
  const pending = conversations.get(id)
  if (pending) {
    return pending
  }
  const run = writes.then(async () => {
    if (!window.api.projectChannels) {
      throw new Error('Bots are available in the desktop app.')
    }
    try {
      const snapshot = await window.api.projectChannels.ensureConversation(id)
      useProjectChannels.setState({ snapshot, error: null })
      const channel = snapshot.channels.find((row) => row.id === id)
      const member = channel?.members.find((row) => row.id === channel.home?.memberId)
      if (member?.target.kind === 'environment') {
        const options = { runtimeEnvironmentId: member.target.environmentId, throwOnError: true }
        await useAppStore.getState().fetchProjectGroups(options)
        await useAppStore.getState().fetchFolderWorkspaces(options)
      }
    } catch (error) {
      // Provisioning may have committed its durable session identity before the host reply was lost.
      const snapshot = await window.api.projectChannels.read()
      useProjectChannels.setState({ snapshot })
      throw error
    }
  })
  writes = run.catch(() => {})
  conversations.set(id, run)
  void run.finally(() => conversations.delete(id)).catch(() => {})
  return run
}

export function openProjectChannel(id: string): void {
  useProjectChannels.setState({ selectedId: id, mode: 'projects' })
  useAppStore.setState({ activeView: 'project-chat' })
}

export function openProjectChannelEditor(editor: NonNullable<ProjectChannelState['editor']>): void {
  void loadProjectChannels().then(() => {
    const current = useProjectChannels.getState()
    if (!current.loaded) {
      return
    }
    const linked = editor.tabId
      ? current.snapshot.channels.find((channel) =>
          channel.members.some((member) => member.tabId === editor.tabId)
        )
      : null
    useProjectChannels.setState({
      editor: linked ? { channelId: linked.id, section: 'conversations' } : editor
    })
  })
}

export async function reloadProjectChannels(): Promise<void> {
  useProjectChannels.setState((state) => ({ draftEpoch: state.draftEpoch + 1 }))
  for (const timer of draftTimers.values()) {
    clearTimeout(timer)
  }
  draftTimers.clear()
  await writes
  useProjectChannels.setState({ loaded: false })
  await loadProjectChannels()
}

export function checkpointProjectChannelDrafts(): void {
  const state = useProjectChannels.getState()
  checkpointProjectDrafts(state.snapshot, state.drafts)
}

export function setProjectChannelDraft(id: string, text: string): void {
  const epoch = useProjectChannels.getState().draftEpoch
  useProjectChannels.setState((state) => ({ drafts: { ...state.drafts, [id]: text } }))
  draftVersions.set(id, (draftVersions.get(id) ?? 0) + 1)
  clearTimeout(draftTimers.get(id))
  draftTimers.set(
    id,
    setTimeout(() => {
      draftTimers.delete(id)
      void changeProjectChannel(id, (channel) => {
        const state = useProjectChannels.getState()
        const draft = state.drafts[id] ?? channel.draft
        return state.draftEpoch !== epoch || channel.draft === draft
          ? channel
          : { ...channel, draft }
      }).catch(() => {})
    }, 300)
  )
}

export function consumeProjectChannelDraft(
  id: string,
  text: string
): { version: number; epoch: number } | null {
  const state = useProjectChannels.getState()
  const saved = state.snapshot.channels.find((channel) => channel.id === id)?.draft ?? ''
  if ((state.drafts[id] ?? saved) !== text) {
    return null
  }
  clearTimeout(draftTimers.get(id))
  draftTimers.delete(id)
  const version = (draftVersions.get(id) ?? 0) + 1
  draftVersions.set(id, version)
  useProjectChannels.setState({ drafts: { ...state.drafts, [id]: '' } })
  return { version, epoch: state.draftEpoch }
}

export function restoreProjectChannelDraft(
  id: string,
  text: string,
  lease: { version: number; epoch: number } | null
): void {
  const state = useProjectChannels.getState()
  if (
    lease &&
    state.draftEpoch === lease.epoch &&
    draftVersions.get(id) === lease.version &&
    !state.drafts[id]
  ) {
    setProjectChannelDraft(id, text)
  }
}

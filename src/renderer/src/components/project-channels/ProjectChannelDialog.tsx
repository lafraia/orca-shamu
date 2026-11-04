import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { createBrowserUuid } from '@/lib/browser-uuid'
import {
  projectChannelSchema,
  projectChannelSessionKey,
  type ProjectChannelMember
} from '../../../../shared/project-channels'
import { projectChannelCandidates, uniqueProjectChannelHandle } from './project-channel-candidates'
import {
  loadProjectChannels,
  checkpointProjectChannelDrafts,
  openProjectChannel,
  saveProjectChannels,
  useProjectChannels
} from './project-channel-store'

export function ProjectChannelsHost(): React.JSX.Element | null {
  const editor = useProjectChannels((state) => state.editor)
  useEffect(() => {
    if (window.api.projectChannels) {
      void loadProjectChannels()
    }
    window.addEventListener('beforeunload', checkpointProjectChannelDrafts)
    return () => window.removeEventListener('beforeunload', checkpointProjectChannelDrafts)
  }, [])
  return editor ? (
    <ProjectChannelDialog key={editor.channelId ?? editor.tabId ?? 'new'} editor={editor} />
  ) : null
}

function ProjectChannelDialog({
  editor
}: {
  editor: { channelId?: string; tabId?: string }
}): React.JSX.Element {
  const channels = useProjectChannels((state) => state.snapshot.channels)
  const loaded = useProjectChannels((state) => state.loaded)
  const tabs = useAppStore((state) => state.unifiedTabsByWorktree)
  const existing = channels.find((channel) => channel.id === editor.channelId)
  const candidates = useMemo(() => projectChannelCandidates(useAppStore.getState(), tabs), [tabs])
  const source = candidates.find((candidate) => candidate.tabId === editor.tabId)
  const [name, setName] = useState(existing?.name ?? source?.name ?? '')
  const [members, setMembers] = useState<ProjectChannelMember[]>(
    existing?.members ?? (source ? [{ ...source, importHistory: true }] : [])
  )
  const [mainId, setMainId] = useState(existing?.mainMemberId ?? source?.id ?? '')
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = (): void => useProjectChannels.setState({ editor: null })
  const available = candidates.filter(
    (candidate) =>
      !channels.some(
        (channel) =>
          channel.id !== existing?.id &&
          channel.members.some(
            (member) => projectChannelSessionKey(member) === projectChannelSessionKey(candidate)
          )
      ) &&
      !members.some(
        (member) =>
          member.sessionId === candidate.sessionId &&
          JSON.stringify(member.target) === JSON.stringify(candidate.target)
      )
  )
  const add = (): void => {
    const candidate = candidates.find((row) => row.id === pick)
    if (!candidate) {
      return
    }
    setMembers((current) => [
      ...current,
      {
        ...candidate,
        importHistory: current.length === 0,
        handle: uniqueProjectChannelHandle(
          candidate.handle,
          current.map((member) => member.handle)
        )
      }
    ])
    if (!mainId) {
      setMainId(candidate.id)
    }
    setPick('')
  }
  const save = async (): Promise<void> => {
    const id = existing?.id ?? createBrowserUuid()
    const validation = projectChannelSchema.safeParse({
      id,
      name,
      mainMemberId: mainId,
      members,
      messages: existing?.messages ?? [],
      draft: existing?.draft ?? '',
      createdAt: existing?.createdAt ?? Date.now()
    })
    if (!validation.success) {
      setError(
        translate(
          'projectChannels.invalid',
          'Choose a team name, a main agent and unique @handles (letters, numbers, underscores or hyphens).'
        )
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveProjectChannels((current) => {
        const latest = current.find((row) => row.id === id)
        const saved = {
          ...validation.data,
          messages: latest?.messages ?? validation.data.messages,
          draft: latest?.draft ?? validation.data.draft,
          members: validation.data.members.map((member) => {
            const live = latest?.members.find((row) => row.id === member.id)
            return live
              ? {
                  ...member,
                  baseline: live.baseline,
                  historyImported: live.historyImported,
                  historyBoundary: live.historyBoundary,
                  historyEpoch: live.historyEpoch
                }
              : member
          })
        }
        return latest ? current.map((row) => (row.id === id ? saved : row)) : [...current, saved]
      })
      close()
      openProjectChannel(id)
    } catch {
      setError(
        translate(
          'projectChannels.saveError',
          'Could not save the team. Your conversations are unchanged.'
        )
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          close()
        }
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {existing
              ? translate('projectChannels.edit', 'Edit team')
              : translate('projectChannels.new', 'New team')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {translate(
              'projectChannels.projectDescription',
              'Choose existing chat tabs to participate in one shared team conversation.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto p-1 scrollbar-sleek">
          <div className="space-y-2">
            <Label htmlFor="project-channel-name">
              {translate('projectChannels.name', 'Team name')}
            </Label>
            <Input
              id="project-channel-name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              {translate('projectChannels.agents', 'Agents')}
            </legend>
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <input
                  type="radio"
                  name="project-main-agent"
                  aria-label={translate('projectChannels.makeMain', 'Main agent: {{name}}', {
                    name: member.name
                  })}
                  checked={member.id === mainId}
                  onChange={() => setMainId(member.id)}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <Input
                    aria-label={translate('projectChannels.agentName', 'Agent name')}
                    value={member.name}
                    maxLength={80}
                    density="compact"
                    onChange={(event) =>
                      setMembers((rows) =>
                        rows.map((row) =>
                          row.id === member.id ? { ...row, name: event.target.value } : row
                        )
                      )
                    }
                  />
                  <div className="flex items-center text-xs text-muted-foreground">
                    <span>@</span>
                    <Input
                      aria-label={translate('projectChannels.handle', 'Agent handle')}
                      value={member.handle}
                      maxLength={32}
                      density="compact"
                      onChange={(event) =>
                        setMembers((rows) =>
                          rows.map((row) =>
                            row.id === member.id
                              ? { ...row, handle: event.target.value.toLowerCase() }
                              : row
                          )
                        )
                      }
                    />
                    <span className="shrink-0">{member.agent}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={translate('projectChannels.removeAgent', 'Remove agent: {{name}}', {
                    name: member.name
                  })}
                  disabled={member.id === mainId}
                  onClick={() => setMembers((rows) => rows.filter((row) => row.id !== member.id))}
                >
                  <X />
                </Button>
              </div>
            ))}
            {available.length ? (
              <div className="flex gap-2">
                <Select value={pick} onValueChange={setPick}>
                  <SelectTrigger
                    aria-label={translate('projectChannels.chooseChat', 'Choose chat tab')}
                  >
                    <SelectValue
                      placeholder={translate('projectChannels.chooseChat', 'Choose chat tab')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.name} · {candidate.agent}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pick || members.length >= 20}
                  onClick={add}
                >
                  <Plus />
                  {translate('projectChannels.add', 'Add')}
                </Button>
              </div>
            ) : null}
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {translate(
                  'projectChannels.noChats',
                  'Open a Chat agent in a folder workspace or worktree first, then choose it here.'
                )}
              </p>
            ) : null}
          </fieldset>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={close}>
            {translate('projectChannels.cancel', 'Cancel')}
          </Button>
          <Button disabled={busy || !loaded} onClick={() => void save()}>
            {busy
              ? translate('projectChannels.saving', 'Saving…')
              : translate('projectChannels.save', 'Save team')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

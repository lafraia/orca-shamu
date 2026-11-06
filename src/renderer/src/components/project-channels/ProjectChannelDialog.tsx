import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  type ProjectChannelMember
} from '../../../../shared/project-channels'
import { projectChannelCandidates } from './project-channel-candidates'
import { BotIdentityFields } from './BotIdentityFields'
import { BotProjectFields } from './BotProjectFields'
import { defaultBotIdentity } from '../../../../shared/bot-identity'
import { BotUnreadHost } from './BotUnreadHost'
import {
  loadProjectChannels,
  refreshProjectChannelRoster,
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
    const unsubscribe = window.api.projectChannels?.onChanged?.(() => {
      void refreshProjectChannelRoster().catch(() => {})
    })
    window.addEventListener('beforeunload', checkpointProjectChannelDrafts)
    return () => {
      unsubscribe?.()
      window.removeEventListener('beforeunload', checkpointProjectChannelDrafts)
    }
  }, [])
  return (
    <>
      <BotUnreadHost />
      {editor ? (
        <ProjectChannelDialog key={editor.channelId ?? editor.tabId ?? 'new'} editor={editor} />
      ) : null}
    </>
  )
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
  const [instructions, setInstructions] = useState(existing?.instructions ?? '')
  const [projects, setProjects] = useState(existing?.projects ?? [])
  const [botId] = useState(existing?.id ?? createBrowserUuid())
  const [identity, setIdentity] = useState(existing?.identity ?? defaultBotIdentity(botId))
  const [members] = useState<ProjectChannelMember[]>(
    existing?.members ?? (source ? [{ ...source, importHistory: true }] : [])
  )
  const mainId = existing?.mainMemberId ?? source?.id ?? null
  const [busy, setBusy] = useState(false)
  const [identityBusy, setIdentityBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = (): void => useProjectChannels.setState({ editor: null })
  const save = async (): Promise<void> => {
    const id = botId
    const validation = projectChannelSchema.safeParse({
      ...existing,
      id,
      name,
      instructions,
      projects,
      identity,
      home: existing?.home,
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
          'Choose a bot name. Linked conversations need a default and unique @handles (letters, numbers, underscores or hyphens).'
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
          home: latest?.home ?? validation.data.home,
          creation: latest?.creation,
          pinned: latest?.pinned,
          section: latest?.section,
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
          'Could not save the bot. Your conversations are unchanged.'
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
              ? translate('projectChannels.edit', 'Bot settings')
              : translate('projectChannels.new', 'New bot')}
          </DialogTitle>
          <DialogDescription>
            {existing
              ? translate(
                  'projectChannels.projectDescription',
                  'Give your bot an identity and instructions. Its permanent conversation stays with it.'
                )
              : translate(
                  'projectChannels.createDescription',
                  'Give your bot a name and instructions. Its own permanent chat opens when you create it.'
                )}
          </DialogDescription>
        </DialogHeader>
        <form
          id="project-channel-form"
          className="min-h-0 space-y-5 overflow-y-auto p-1 scrollbar-sleek"
          onSubmit={(event) => {
            event.preventDefault()
            if (!busy && !identityBusy && loaded) {
              void save()
            }
          }}
        >
          <BotIdentityFields
            id={botId}
            value={identity}
            onChange={setIdentity}
            onBusyChange={setIdentityBusy}
          />
          <div className="space-y-2">
            <Label htmlFor="project-channel-name">
              {translate('projectChannels.name', 'Bot name')}
            </Label>
            <Input
              id="project-channel-name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-channel-instructions">
              {translate('projectChannels.instructions', 'Instructions (optional)')}
            </Label>
            <Textarea
              id="project-channel-instructions"
              value={instructions}
              maxLength={20_000}
              rows={4}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder={translate(
                'projectChannels.instructionsPlaceholder',
                'Describe what this bot is responsible for and how it should work.'
              )}
            />
          </div>
          {existing?.home ? (
            <div className="space-y-2">
              <Label htmlFor="project-channel-folder">
                {translate('projectChannels.folder', 'Bot folder')}
              </Label>
              <Input
                id="project-channel-folder"
                value={existing.home.directory}
                readOnly
                variant="code"
                aria-describedby="project-channel-folder-description"
              />
              <p id="project-channel-folder-description" className="text-xs text-muted-foreground">
                {translate(
                  'projectChannels.folderDescription',
                  'The bot’s instructions and working files are stored here.'
                )}
              </p>
            </div>
          ) : null}
          <BotProjectFields value={projects} onChange={setProjects} disabled={busy} />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={close}>
            {translate('projectChannels.cancel', 'Cancel')}
          </Button>
          <Button
            type="submit"
            form="project-channel-form"
            disabled={busy || identityBusy || !loaded || !name.trim()}
          >
            {busy
              ? translate('projectChannels.saving', 'Saving…')
              : existing
                ? translate('projectChannels.save', 'Save bot')
                : translate('projectChannels.create', 'Create bot')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

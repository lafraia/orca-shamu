import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import type { ProjectChannelMember } from '../../../../shared/project-channels'
import { uniqueProjectChannelHandle } from './project-channel-candidates'

export function ProjectChannelConversations({
  members,
  mainId,
  permanentMemberId,
  available,
  onChange
}: {
  members: ProjectChannelMember[]
  mainId: string | null
  permanentMemberId?: string
  available: ProjectChannelMember[]
  onChange: (members: ProjectChannelMember[], mainId: string | null) => void
}): React.JSX.Element {
  const [pick, setPick] = useState('')
  const add = (): void => {
    const candidate = available.find((row) => row.id === pick)
    if (!candidate || members.length >= 20) {
      return
    }
    onChange(
      [
        ...members,
        {
          ...candidate,
          importHistory: members.length === 0,
          handle: uniqueProjectChannelHandle(
            candidate.handle,
            members.map((member) => member.handle)
          )
        }
      ],
      mainId ?? candidate.id
    )
    setPick('')
  }
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">
        {translate('projectChannels.linkedConversations', 'Linked conversations')}
      </legend>
      <p className="text-sm text-muted-foreground">
        {translate(
          'projectChannels.conversationsOptional',
          'Conversations are optional. Linking a chat keeps its existing agent, history and permissions.'
        )}
      </p>
      {permanentMemberId ? (
        <p className="text-sm text-muted-foreground">
          {translate(
            'projectChannels.ownConversation',
            'The bot has its own permanent chat. Add other conversations here when you need them.'
          )}
        </p>
      ) : null}
      {members
        .filter((member) => member.id !== permanentMemberId)
        .map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
          >
            {!permanentMemberId ? (
              <input
                type="radio"
                name="project-main-agent"
                aria-label={translate(
                  'projectChannels.makeMain',
                  'Default conversation: {{name}}',
                  {
                    name: member.name
                  }
                )}
                checked={member.id === mainId}
                onChange={() => onChange(members, member.id)}
              />
            ) : null}
            <div className="min-w-0 flex-1 space-y-1">
              <Input
                aria-label={translate('projectChannels.agentName', 'Conversation name')}
                value={member.name}
                maxLength={80}
                density="compact"
                onChange={(event) =>
                  onChange(
                    members.map((row) =>
                      row.id === member.id ? { ...row, name: event.target.value } : row
                    ),
                    mainId
                  )
                }
              />
              <div className="flex items-center text-xs text-muted-foreground">
                <span>@</span>
                <Input
                  aria-label={translate('projectChannels.handle', 'Conversation handle')}
                  value={member.handle}
                  maxLength={32}
                  density="compact"
                  onChange={(event) =>
                    onChange(
                      members.map((row) =>
                        row.id === member.id
                          ? { ...row, handle: event.target.value.toLowerCase() }
                          : row
                      ),
                      mainId
                    )
                  }
                />
                <span className="shrink-0">{member.agent}</span>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={translate(
                'projectChannels.removeAgent',
                'Unlink conversation: {{name}}',
                {
                  name: member.name
                }
              )}
              onClick={() => {
                const remaining = members.filter((row) => row.id !== member.id)
                onChange(remaining, member.id === mainId ? (remaining[0]?.id ?? null) : mainId)
              }}
            >
              <X />
            </Button>
          </div>
        ))}
      {available.length > 0 ? (
        <div className="flex gap-2">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger aria-label={translate('projectChannels.chooseChat', 'Choose chat tab')}>
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
            type="button"
            variant="outline"
            size="sm"
            disabled={!pick || members.length >= 20}
            onClick={add}
          >
            <Plus />
            {translate('projectChannels.add', 'Link')}
          </Button>
        </div>
      ) : null}
      {members.length === 0 && available.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate(
            'projectChannels.noChats',
            'No chats available to link. You can return here after opening an agent conversation.'
          )}
        </p>
      ) : null}
    </fieldset>
  )
}

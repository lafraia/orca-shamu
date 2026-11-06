import { useState } from 'react'
import { defineFixture } from '../../component-fixtures/component-fixture'
import type { BotProjectCatalog, BotProjectLink } from '../../../../shared/bot-projects'
import { BotProjectPicker } from './BotProjectPicker'
import { ProjectChannelSidebar } from './ProjectChannelSidebar'
import { useProjectChannels } from './project-channel-store'
import { useShamuClient } from '../shamu/shamu-client-state'
import SidebarNav from '../sidebar/SidebarNav'
import SidebarHeader from '../sidebar/SidebarHeader'

const catalog: BotProjectCatalog = {
  entries: [
    {
      ref: { environmentId: 'primary', executionHostId: 'local', kind: 'repo', id: 'app' },
      name: 'Application',
      path: '/Projects/mobile/app',
      projectGroupId: 'team'
    },
    {
      ref: {
        environmentId: 'primary',
        executionHostId: 'ssh:Build server',
        kind: 'repo',
        id: 'billing'
      },
      name: 'Billing',
      path: '/Services/accounts/billing',
      projectGroupId: 'team'
    },
    {
      ref: { environmentId: 'primary', executionHostId: 'local', kind: 'group', id: 'team' },
      name: 'Product team',
      path: null,
      projectGroupId: null
    },
    {
      ref: { environmentId: 'primary', executionHostId: 'local', kind: 'folder', id: 'planning' },
      name: 'Planning',
      path: '/Documents/planning',
      projectGroupId: null
    }
  ]
}

function Picker(): React.JSX.Element {
  const [value, setValue] = useState<BotProjectLink[]>(
    catalog.entries.slice(0, 2).map((entry) => ({ ...entry.ref, name: entry.name }))
  )
  return (
    <div className="space-y-3 bg-background p-5">
      <p className="text-sm font-medium">Linked projects</p>
      <BotProjectPicker catalog={catalog} value={value} onChange={setValue} />
    </div>
  )
}

export const linked = defineFixture({ width: 520, render: () => <Picker /> })
export const searching = defineFixture({
  ...linked,
  interact: (frame) => {
    frame.querySelector<HTMLButtonElement>('[role="combobox"]')?.click()
  }
})

export const navigation = defineFixture({
  width: 320,
  store: { activeView: 'project-chat' },
  setup: () => {
    useShamuClient.setState({ enabled: true, environmentId: 'primary' })
    useProjectChannels.setState({
      loaded: true,
      sidebarExpanded: true,
      selectedId: 'ceo',
      snapshot: {
        version: 1,
        revision: 0,
        channels: [
          {
            id: 'ceo',
            name: 'CEO',
            pinned: true,
            mainMemberId: null,
            members: [],
            messages: [],
            draft: '',
            createdAt: 1,
            identity: { color: 'teal', animated: false }
          },
          {
            id: 'dev',
            name: 'Development',
            section: 'Product team',
            mainMemberId: null,
            members: [],
            messages: [],
            draft: '',
            createdAt: 2,
            identity: { color: 'pink', animated: false }
          }
        ]
      }
    })
  },
  render: () => (
    <div className="flex h-[720px] flex-col bg-worktree-sidebar">
      <SidebarNav />
      <ProjectChannelSidebar />
      <SidebarHeader onWorkspaceBoardMenuOpenChange={() => {}} />
      <div className="flex-1" />
    </div>
  )
})

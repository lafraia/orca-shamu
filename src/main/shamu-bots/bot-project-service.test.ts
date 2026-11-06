import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectChannelsStore } from '../project-channels-store'
import { channelFixture, channelMember } from '../../shared/project-channels.test-fixture'
import { BotProjectService } from './bot-project-service'
import type { BotProjectLink } from '../../shared/bot-projects'

describe('bot linked project scope', () => {
  let directory: string
  let channels: ProjectChannelsStore
  let service: BotProjectService
  let catalog: Record<string, unknown>
  const link = (kind: BotProjectLink['kind'], id: string, name: string): BotProjectLink => ({
    environmentId: 'primary',
    executionHostId: 'local',
    kind,
    id,
    name
  })
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'shamu-projects-'))
    channels = new ProjectChannelsStore(directory)
    const member = {
      ...channelMember(),
      worktreeId: 'folder:ceo-home',
      target: { kind: 'environment' as const, environmentId: 'primary' }
    }
    await channels.write({
      version: 1,
      revision: 0,
      channels: [
        {
          ...channelFixture(),
          members: [member],
          mainMemberId: member.id
        }
      ]
    })
    await channels.update('project', (bot) => ({
      ...bot,
      home: {
        directory: '/bots/ceo',
        memberId: member.id,
        createOperationId: 'op',
        createFingerprint: 'fingerprint',
        ready: true
      }
    }))
    catalog = {
      'repo.list': {
        repos: [
          { id: 'app', displayName: 'Application', path: '/clients/app', projectGroupId: 'team' },
          {
            id: 'billing',
            displayName: 'Billing',
            path: '/finance/billing',
            projectGroupId: 'team-child'
          },
          { id: 'nearby', displayName: 'Nearby', path: '/teams/nearby' },
          {
            id: 'nearby',
            displayName: 'Remote nearby',
            projectGroupId: 'team',
            path: '/teams/nearby',
            executionHostId: 'ssh:server'
          }
        ]
      },
      'projectGroup.list': {
        groups: [
          { id: 'team', name: 'Team', parentPath: '/teams', parentGroupId: null },
          { id: 'team-child', name: 'Accounts', parentPath: null, parentGroupId: 'team' },
          { id: 'bots', name: 'Bots', parentPath: '/bots', parentGroupId: null }
        ]
      },
      'folderWorkspace.list': {
        folderWorkspaces: [
          {
            id: 'ceo-home',
            name: 'CEO',
            folderPath: '/bots/ceo',
            projectGroupId: 'bots',
            executionHostId: 'local'
          },
          {
            id: 'planning',
            name: 'Planning',
            folderPath: '/notes/planning',
            projectGroupId: 'team-child',
            executionHostId: 'local'
          }
        ]
      }
    }
    service = new BotProjectService(channels, {
      read: async () => ({ environmentId: 'primary' }),
      call: async (method) => {
        if (!(method in catalog)) {
          throw new Error('Catalog offline')
        }
        return catalog[method]
      }
    })
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('combines logical group membership with physical descendants on the owning host', async () => {
    const context = await service.context([
      link('group', 'team', 'Team'),
      link('repo', 'app', 'Application')
    ])
    expect(context?.entries.map((entry) => [entry.id, entry.path, entry.executionHostId])).toEqual([
      ['team', '/teams', 'local'],
      ['app', '/clients/app', 'local'],
      ['billing', '/finance/billing', 'local'],
      ['nearby', '/teams/nearby', 'local'],
      ['planning', '/notes/planning', 'local'],
      ['team-child', null, 'local']
    ])
    expect((await channels.read()).channels[0].members[0].sessionId).toBe('session-coordinator')
  })

  it('resolves a saved link against the current catalog after its folder changes', async () => {
    const bot = (await channels.read()).channels[0]
    const snapshot = await channels.read()
    const updated = {
      ...snapshot,
      channels: [{ ...bot, projects: [link('repo', 'app', 'Application')] }]
    }
    await service.assertLinks(updated)
    await channels.write(updated)
    catalog['repo.list'] = {
      repos: [{ id: 'app', displayName: 'Renamed app', path: '/new/client/app' }]
    }
    const saved = (await channels.read()).channels[0]
    expect((await service.context(saved.projects ?? []))?.entries).toEqual([
      {
        id: 'app',
        name: 'Renamed app',
        kind: 'repo',
        path: '/new/client/app',
        executionHostId: 'local'
      }
    ])
  })

  it('includes registered descendants of a linked folder without adding its group siblings', async () => {
    catalog['folderWorkspace.list'] = {
      folderWorkspaces: [
        {
          id: 'planning',
          name: 'Client folder',
          folderPath: '/clients',
          projectGroupId: 'team-child',
          executionHostId: 'local'
        }
      ]
    }
    expect((await service.context([link('folder', 'planning', 'Client folder')]))?.entries).toEqual(
      [
        {
          id: 'planning',
          name: 'Client folder',
          kind: 'folder',
          path: '/clients',
          executionHostId: 'local'
        },
        {
          id: 'app',
          name: 'Application',
          kind: 'repo',
          path: '/clients/app',
          executionHostId: 'local'
        }
      ]
    )
  })

  it('rejects bot-owned folders and foreign hosts as newly linked projects', async () => {
    const snapshot = await channels.read()
    const bot = snapshot.channels[0]
    await expect(
      service.assertLinks({
        ...snapshot,
        channels: [{ ...bot, projects: [link('folder', 'ceo-home', 'CEO')] }]
      })
    ).rejects.toThrow('linked project changed')
    await expect(
      service.assertLinks({
        ...snapshot,
        channels: [
          {
            ...bot,
            projects: [{ ...link('repo', 'app', 'Application'), environmentId: 'another-server' }]
          }
        ]
      })
    ).rejects.toThrow('linked project changed')
    await expect(
      service.assertLinks({
        ...snapshot,
        channels: [
          {
            ...bot,
            projects: [{ ...link('repo', 'app', 'Application'), executionHostId: 'ssh:server' }]
          }
        ]
      })
    ).rejects.toThrow('linked project changed')
  })

  it('reports missing or foreign links without substituting a matching name or path', async () => {
    expect(
      await service.context([
        link('repo', 'deleted', 'Application'),
        { ...link('repo', 'app', 'Other application'), environmentId: 'another-server' }
      ])
    ).toEqual({
      environmentId: 'primary',
      entries: [],
      unavailable: [
        { name: 'Application', reason: 'missing' },
        { name: 'Other application', reason: 'other-server' }
      ],
      omitted: 0
    })
  })
})

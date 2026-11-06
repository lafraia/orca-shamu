import { createHash } from 'node:crypto'
import { defaultBotIdentity } from '../../shared/bot-identity'
import { botReferenceMarkdown } from '../../shared/bot-reference'
import { botCommandSchema, type BotCreateCommand } from '../../shared/bot-commands'
import type { ProjectChannel } from '../../shared/project-channels'
import type { ProjectChannelsStore } from '../project-channels-store'
import type { BotConversationService } from '../bot-conversation-service'
import type { BotMentionDelivery } from '../bot-mention-delivery'
import type { BotRoutineService } from './bot-routine-service'
import type { VaultService } from '../shamu-vault/vault-service'
import type { BotCliService } from './bot-cli-service'
import {
  readBotReferenceContext,
  requireBotUserRequest,
  type BotPrimary
} from './bot-journal-reader'

export class BotCommandService {
  constructor(
    private readonly channels: ProjectChannelsStore,
    private readonly bots: Pick<BotConversationService, 'ensure'>,
    private readonly mentions: Pick<BotMentionDelivery, 'deliver' | 'context'>,
    readonly routines: BotRoutineService,
    private readonly primary: BotPrimary,
    private readonly changed: () => void,
    private readonly vault?: VaultService | null,
    private readonly cli?: BotCliService | null
  ) {}
  async invoke(input: unknown, caller: 'desktop' | 'agent' = 'desktop'): Promise<unknown> {
    const command = botCommandSchema.parse(input)
    if (command.action === 'send' || command.action === 'result') {
      if (!this.cli) {
        throw new Error('CLI prompts are unavailable in this Orca profile.')
      }
      return command.action === 'send' ? this.cli.send(command) : this.cli.result(command.requestId)
    }
    if (
      command.action === 'vault.list' ||
      command.action === 'vault.run' ||
      command.action === 'vault.result'
    ) {
      if (!this.vault) {
        throw new Error('Vault is unavailable in this Orca profile.')
      }
      const bot = await this.requireBot(command.actorId)
      if (command.action === 'vault.run') {
        await this.requireActorRequest(command.actorId, command.sourceItemId)
      }
      return this.vault.invoke(command, bot)
    }
    if (
      caller === 'agent' &&
      [
        'routine.save',
        'routine.control',
        'mention',
        'organize',
        'reorder',
        'section.rename',
        'section.move'
      ].includes(command.action)
    ) {
      if (
        !('actorId' in command) ||
        !command.actorId ||
        !('sourceItemId' in command) ||
        !command.sourceItemId
      ) {
        throw new Error('Include actorId and the user sourceItemId that requested this action.')
      }
      await this.requireActorRequest(command.actorId, command.sourceItemId)
    }
    switch (command.action) {
      case 'list': {
        const { environmentId } = await this.primary.read()
        return {
          environmentId,
          bots: (await this.channels.read()).channels.map((row) => ({
            id: row.id,
            name: row.name,
            reference: botReferenceMarkdown(row),
            pinned: row.pinned ?? false,
            section: row.section ?? '',
            identity: { ...(row.identity ?? defaultBotIdentity(row.id)), image: undefined },
            sessionId:
              row.members.find((member) => member.id === row.home?.memberId)?.sessionId ?? null
          }))
        }
      }
      case 'create':
        return this.create(command)
      case 'organize': {
        const result = await this.channels.update(command.botId, (row) => ({
          ...row,
          ...(command.pinned !== undefined ? { pinned: command.pinned } : {}),
          ...(command.section !== undefined ? { section: command.section } : {})
        }))
        this.changed()
        const bot = result.channels.find((row) => row.id === command.botId)!
        return {
          bot: {
            id: bot.id,
            name: bot.name,
            pinned: bot.pinned ?? false,
            section: bot.section ?? ''
          }
        }
      }
      case 'context': {
        const bot = await this.requireBot(command.actorId)
        const member = bot.members.find((row) => row.id === bot.home?.memberId)!
        return command.referenceId === 'self'
          ? readBotReferenceContext(this.primary, member.sessionId, command.cursor)
          : this.mentions.context(command.actorId, command.referenceId, command.cursor)
      }
      case 'section.rename': {
        const result = await this.channels.renameSection(command.name, command.newName)
        this.changed()
        return { sections: result.sectionOrder ?? [] }
      }
      case 'section.move': {
        const result = await this.channels.moveSection(command.name, command.direction)
        this.changed()
        return { sections: result.sectionOrder ?? [] }
      }
      case 'reorder': {
        await this.channels.move(command.move)
        this.changed()
        return { moved: true }
      }
      case 'mention': {
        if (caller === 'agent' && command.actorId) {
          const actor = await this.requireBot(command.actorId)
          if (
            !actor.members.some(
              (row) =>
                row.id === actor.home?.memberId &&
                row.sessionId === command.request.source.sessionId
            )
          ) {
            throw new Error('A bot handoff must reference its own source conversation.')
          }
        }
        return this.mentions.deliver(
          command.request,
          caller === 'agent' && command.actorId && command.sourceItemId
            ? { actorId: command.actorId, sourceItemId: command.sourceItemId }
            : undefined
        )
      }
      case 'routine.list':
        return this.routines.view(command.botId)
      case 'routine.save': {
        if (caller === 'agent' && command.actorId !== command.routine.botId) {
          throw new Error(
            'A bot can schedule only its own routines. Ask the owner bot to create its routine.'
          )
        }
        return this.routines.save(command.routine, command.revision)
      }
      case 'routine.control': {
        if (
          caller === 'agent' &&
          !(await this.routines.view(command.actorId)).routines.some((row) => row.id === command.id)
        ) {
          throw new Error('This routine belongs to a different bot.')
        }
        return this.routines.control(command.id, command.control, command.requestId)
      }
      case 'routine.trigger':
        return (await this.routines.trigger(command.key, command.eventId, command.text)).map(
          ({ prompt: _prompt, requestFingerprint: _fingerprint, ...summary }) => summary
        )
    }
  }
  private async requireBot(id: string): Promise<ProjectChannel> {
    const bot = (await this.channels.read()).channels.find((row) => row.id === id)
    const { environmentId } = await this.primary.read()
    const member = bot?.members.find((row) => row.id === bot.home?.memberId)
    if (
      !bot?.home?.ready ||
      !member ||
      member.target.kind !== 'environment' ||
      member.target.environmentId !== environmentId
    ) {
      throw new Error('This bot does not have a conversation on the connected primary Orca.')
    }
    return bot
  }
  private async requireActorRequest(id: string, sourceItemId: string): Promise<void> {
    const bot = await this.requireBot(id)
    await requireBotUserRequest(
      this.primary,
      bot.members.find((row) => row.id === bot.home?.memberId)!.sessionId,
      sourceItemId
    )
  }
  private async create(command: BotCreateCommand) {
    const fingerprint = createHash('sha256').update(JSON.stringify(command)).digest('hex')
    const existing = (await this.channels.read()).channels.find(
      (row) => row.id === command.requestId
    )
    if (!existing) {
      await this.requireActorRequest(command.actorId, command.sourceItemId)
      await this.channels.create({
        id: command.requestId,
        name: command.name,
        instructions: command.instructions,
        identity: defaultBotIdentity(command.requestId),
        ...(command.section ? { section: command.section } : {}),
        creation: {
          requestId: command.requestId,
          fingerprint,
          actorId: command.actorId,
          sourceItemId: command.sourceItemId
        },
        mainMemberId: null,
        members: [],
        messages: [],
        draft: '',
        createdAt: Date.now()
      })
    } else if (existing.creation?.fingerprint !== fingerprint) {
      throw new Error('This creation request already belongs to a different bot.')
    }
    this.changed()
    const snapshot = await this.bots.ensure(command.requestId)
    this.changed()
    const bot = snapshot.channels.find((row) => row.id === command.requestId)!
    return {
      id: bot.id,
      name: bot.name,
      sessionId: bot.members.find((row) => row.id === bot.home?.memberId)?.sessionId,
      directory: bot.home?.directory
    }
  }
}

let current: BotCommandService | null = null
export function installBotCommandService(service: BotCommandService | null): void {
  current?.routines.stop()
  current = service
  current?.routines.start()
}
export function requireBotCommandService(): BotCommandService {
  if (!current) {
    throw new Error('Bot controls are available only in Orca Shamu.')
  }
  return current
}

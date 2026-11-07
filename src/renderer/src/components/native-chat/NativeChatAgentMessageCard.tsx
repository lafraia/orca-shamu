import { AgentStateDot } from '@/components/AgentStateDot'
import { AgentTypeIcon } from '@/lib/agent-type-icon'
import { translate } from '@/i18n/i18n'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { AgentMessageSource } from '../../../../shared/agent-session/agent-session-message-source'
import {
  agentMessageHeading,
  agentMessagePrimarySender,
  agentMessageCanCopy
} from '../../../../shared/agent-session/agent-message-presentation'
import { agentMessageTranscriptText } from '../../../../shared/agent-session/agent-message-display-text'
import { NativeChatAgentMessageSenders } from './NativeChatAgentMessageSenders'
import { useAgentMessageSenderView } from './native-chat-agent-message-sender-view'
import { useNativeChatVisualOwner } from './native-chat-visual-owner'
import { NativeChatMessageDisclosureCard } from './NativeChatMessageDisclosureCard'
import { NativeChatMarkdown } from './NativeChatMarkdown'
import { NativeChatTextAttachments } from './NativeChatTextAttachments'
import { NativeChatCodeBlock } from './NativeChatCodeBlock'
import { NativeChatCopyButton } from './NativeChatCopyButton'
import { NativeChatImageAttachments } from './NativeChatTranscriptChrome'

function heading(from: AgentMessageSource, message: NativeChatMessage): string {
  switch (agentMessageHeading(from, message)) {
    case 'started':
      return translate('components.native-chat.agentMessage.startedWorker', 'Started worker')
    case 'handed-off':
      return translate(
        'components.native-chat.agentMessage.handedOffToAgent',
        'Handed off to agent'
      )
    case 'started-agent':
      return translate('components.native-chat.agentMessage.startedAgent', 'Started agent')
    case 'task':
      return translate(
        'components.native-chat.agentMessage.taskFromCoordinator',
        'Task from coordinator'
      )
    case 'coordinator':
      return translate(
        'components.native-chat.agentMessage.messageFromCoordinator',
        'Message from coordinator'
      )
    case 'worker':
      return translate('components.native-chat.agentMessage.updateFromWorker', 'Update from worker')
    case 'generic':
      return translate('components.native-chat.agentMessage.messageFrom', 'Message from')
  }
}

type AgentMessageCardProps = {
  message: NativeChatMessage
  from: AgentMessageSource
  runtimeContext?: RuntimeFileOperationArgs | null
  textAttachmentContent?: string
  onRefolded: () => void
}

export function NativeChatAgentMessageCard({
  message,
  from,
  runtimeContext,
  textAttachmentContent,
  onRefolded
}: AgentMessageCardProps): React.JSX.Element {
  const owner = useNativeChatVisualOwner()
  const worktreeId = owner?.worktreeId ?? runtimeContext?.worktreeId ?? null
  const target = owner?.target ?? runtimeContext?.target
  const text = agentMessageTranscriptText(message.blocks, from, message.shortened)
  const expandable =
    agentMessageCanCopy(text) || message.blocks.some((block) => block.type === 'image-ref')
  return (
    <NativeChatMessageDisclosureCard
      disclosureKey={`agent-message:${message.id}`}
      heading={heading(from, message)}
      avatar={
        <AgentMessageAvatar
          sender={agentMessagePrimarySender(from)}
          dispatchId={message.agentStartDispatchId}
          worktreeId={worktreeId}
          target={target}
        />
      }
      sender={
        <NativeChatAgentMessageSenders
          compact
          dispatchId={message.agentStartDispatchId}
          from={from}
          chatWorktreeId={worktreeId}
          target={target}
        />
      }
      actions={
        agentMessageCanCopy(text) ? (
          <NativeChatCopyButton
            text={text}
            className="relative transition-opacity can-hover:pointer-events-none can-hover:opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 [.group:has(:focus-visible)_&]:pointer-events-auto [.group:has(:focus-visible)_&]:opacity-100"
          />
        ) : null
      }
      timestamp={message.timestamp}
      expandable={expandable}
      onRefolded={onRefolded}
    >
      <NativeChatImageAttachments
        blocks={message.blocks}
        runtimeContext={runtimeContext}
        enablePreview={runtimeContext !== undefined}
      />
      <NativeChatTextAttachments
        content={textAttachmentContent ?? text}
        structured={textAttachmentContent !== undefined}
        runtimeContext={runtimeContext}
        renderText={() => (
          <NativeChatMarkdown
            rowKey={message.id}
            content={text}
            variant="document"
            className="text-sm"
            renderCodeBlock={NativeChatCodeBlock}
          />
        )}
      />
    </NativeChatMessageDisclosureCard>
  )
}

function AgentMessageAvatar({
  dispatchId,
  sender,
  worktreeId,
  target
}: {
  dispatchId?: string
  sender: AgentMessageSource['senders'][number] | undefined
  worktreeId: string | null
  target?: RuntimeClientTarget
}): React.JSX.Element {
  const view = useAgentMessageSenderView(sender, worktreeId, target, dispatchId)
  return (
    <div className="relative flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
      <AgentTypeIcon agentType={view.agentType} size={16} />
      {view.dot ? (
        // Flex square: the chat line box would stretch a shrink-wrapped badge into a pill.
        <span className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full border border-border bg-card">
          <AgentStateDot state={view.dot} size="md" progress={view.progress} />
        </span>
      ) : null}
    </div>
  )
}

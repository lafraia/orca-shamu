import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { BotCommunication, BotCommunicationText } from '../../../../shared/bot-communications'
import { CommunicationMessageBody, CommunicationSkeleton } from './BotCommunicationThreadPosts'

export function BotCommunicationMessagePreview({
  entry
}: {
  entry: BotCommunication
}): React.JSX.Element {
  return entry.native ? (
    <CommunicationMessageBody author={entry.source} blocks={entry.native.blocks} />
  ) : (
    <StoredMessagePreview entry={entry} />
  )
}

function StoredMessagePreview({ entry }: { entry: BotCommunication }): React.JSX.Element {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{
    referenceId: string
    attempt: number
    text: BotCommunicationText | null
  } | null>(null)
  const referenceId = entry.referenceId
  useEffect(() => {
    let current = true
    const read =
      window.api?.projectChannels?.communications?.texts([referenceId]) ?? Promise.resolve([])
    void read
      .then((rows) => {
        if (current) {
          setResult({
            referenceId,
            attempt,
            text: rows.find((row) => row.referenceId === referenceId) ?? null
          })
        }
      })
      .catch(() => {
        if (current) {
          setResult({ referenceId, attempt, text: null })
        }
      })
    return () => {
      current = false
    }
  }, [referenceId, attempt])
  if (!result || result.referenceId !== referenceId || result.attempt !== attempt) {
    return <CommunicationSkeleton />
  }
  if (!result.text) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 text-sm text-muted-foreground"
      >
        <span>
          {translate('shamu.communication.previewFailed', 'Could not load this message.')}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setAttempt((value) => value + 1)}>
          {translate('shamu.communication.retry', 'Retry')}
        </Button>
      </div>
    )
  }
  return (
    <CommunicationMessageBody
      author={entry.source}
      blocks={[{ type: 'text', text: result.text.text }, ...(result.text.attachments ?? [])]}
    />
  )
}

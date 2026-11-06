import { Terminal } from 'lucide-react'
import { translate } from '@/i18n/i18n'

export function BotCliPromptCard({
  requestId,
  text,
  sender,
  status
}: {
  requestId: string
  text: string
  sender: string
  status: string
}): React.JSX.Element {
  const label = translate('shamu.cli.received', 'Received from CLI')
  return (
    <article
      aria-label={label}
      data-bot-cli-request={requestId}
      className="rounded-lg border border-border bg-card px-3 py-2.5 text-card-foreground"
    >
      <div className="mb-2 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <Terminal className="size-3.5 shrink-0" aria-hidden />
        <span className="font-medium">{label}</span>
        {sender !== 'CLI' ? <span className="min-w-0 truncate">{sender}</span> : null}
        <span className="ml-auto shrink-0">{status}</span>
      </div>
      <div className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed scrollbar-sleek">
        {text}
      </div>
    </article>
  )
}

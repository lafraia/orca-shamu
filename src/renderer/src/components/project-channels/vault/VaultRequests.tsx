import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  describeVaultArgument,
  type VaultEntry,
  type VaultRun
} from '../../../../../shared/shamu-vault'

export function VaultRequests({
  requests,
  entries,
  busy,
  onDecide
}: {
  requests: VaultRun[]
  entries: VaultEntry[]
  busy: boolean
  onDecide: (id: string, approve: boolean) => void
}): React.JSX.Element | null {
  if (!requests.length) {
    return null
  }
  return (
    <section
      className="space-y-3 border-b border-border pb-5"
      aria-label={translate('shamu.vault.requests', 'Credential requests')}
    >
      <h3 className="text-sm font-medium">
        {translate('shamu.vault.requests', 'Credential requests')}
      </h3>
      {requests.map((request) => (
        <article key={request.requestId} className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex justify-between gap-3 text-sm">
            <span className="font-medium">
              {entries.find((entry) => entry.id === request.entryId)?.name ??
                translate('shamu.vault.credential', 'Credential')}
            </span>
            <span className="text-muted-foreground">
              {request.state}
              {request.exitCode !== undefined
                ? translate('shamu.vault.exitCode', ' · exit {{code}}', {
                    code: request.exitCode ?? translate('shamu.vault.unknownExitCode', 'unknown')
                  })
                : ''}
            </span>
          </div>
          <dl className="space-y-2 break-all text-xs">
            <div>
              <dt className="text-muted-foreground">
                {translate('shamu.vault.executable', 'Executable')}
              </dt>
              <dd className="font-mono">{describeVaultArgument(request.program)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {translate('shamu.vault.arguments', 'Arguments')}
              </dt>
              <dd className="font-mono">{describeVaultArgument(request.args)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{translate('shamu.vault.folder', 'Folder')}</dt>
              <dd className="font-mono">{describeVaultArgument(request.cwd)}</dd>
            </div>
          </dl>
          {request.state === 'pending' ? (
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onDecide(request.requestId, false)}
              >
                {translate('shamu.vault.deny', 'Deny')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onDecide(request.requestId, true)}
              >
                {translate('shamu.vault.allowOnce', 'Review and allow once')}
              </Button>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  )
}

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { BotProjectCatalog, BotProjectLink } from '../../../../shared/bot-projects'
import { BotProjectPicker } from './BotProjectPicker'

export function BotProjectFields({
  value,
  onChange,
  disabled
}: {
  value: BotProjectLink[]
  onChange: (value: BotProjectLink[]) => void
  disabled: boolean
}): React.JSX.Element {
  const [catalog, setCatalog] = useState<BotProjectCatalog | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let disposed = false
    setError(false)
    const api = window.api.projectChannels
    if (!api) {
      setError(true)
      return
    }
    void api
      .projectCatalog()
      .then((next) => {
        if (!disposed) {
          setCatalog(next)
        }
      })
      .catch(() => {
        if (!disposed) {
          setError(true)
        }
      })
    return () => {
      disposed = true
    }
  }, [attempt])
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="mb-2 text-sm font-medium">
        {translate('shamu.projects.title', 'Linked projects')}
      </legend>
      <p className="text-xs text-muted-foreground">
        {translate(
          'shamu.projects.description',
          'Choose projects for this bot to follow, wherever their folders are. Linked groups include their current projects.'
        )}
      </p>
      {catalog ? (
        <BotProjectPicker catalog={catalog} value={value} onChange={onChange} disabled={disabled} />
      ) : !error ? (
        <div
          aria-busy="true"
          aria-label={translate('shamu.projects.loading', 'Loading projects')}
          className="h-9 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
        />
      ) : null}
      {error ? (
        <div role="alert" className="space-y-2 text-xs text-destructive">
          <p>
            {translate(
              'shamu.projects.loadError',
              'Could not load projects from the primary Orca. Saved links are kept.'
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => setAttempt((current) => current + 1)}
          >
            {translate('shamu.projects.retry', 'Retry')}
          </Button>
        </div>
      ) : null}
    </fieldset>
  )
}

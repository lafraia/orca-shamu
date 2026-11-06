import { ExternalLink } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { openAppHttpLinkFromAnchor } from '@/lib/app-http-link-open'
import {
  SHAMU_LICENSE_URL,
  SHAMU_REPOSITORY_URL,
  SHAMU_UPSTREAM_URL
} from '../../../../shared/shamu-client'

export function ShamuProjectNotice(): React.JSX.Element {
  const title = translate('shamu.project.title', 'About this fork')
  const links = [
    {
      href: SHAMU_REPOSITORY_URL,
      label: translate('shamu.project.repository', 'lafraia/orca-shamu')
    },
    { href: 'https://github.com/lafraia', label: translate('shamu.project.maintainer', 'lafraia') },
    {
      href: SHAMU_UPSTREAM_URL,
      label: translate('shamu.project.upstream', 'Original Orca project')
    },
    { href: SHAMU_LICENSE_URL, label: translate('shamu.project.licenseLink', 'MIT license') }
  ]
  return (
    <section aria-label={title} className="space-y-4 border-t border-border/60 pt-6">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">
          {translate(
            'shamu.project.independence',
            'Orca Shamu is independently maintained by Daniel Lafraia (lafraia). It is not an official Orca release and is not affiliated with, endorsed by or supported by stablyai or the upstream Orca maintainers.'
          )}
        </p>
        <nav
          aria-label={translate('shamu.project.resources', 'Project resources')}
          className="flex flex-wrap gap-x-5 gap-y-2"
        >
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={openAppHttpLinkFromAnchor}
              className="inline-flex items-center gap-1.5 rounded-sm text-sm text-foreground underline underline-offset-4 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.label}
              <ExternalLink aria-hidden className="size-3.5 shrink-0" />
            </a>
          ))}
        </nav>
      </div>
      <div className="space-y-2 text-sm leading-6 text-muted-foreground">
        <h4 className="font-medium text-foreground">
          {translate('shamu.project.termsTitle', 'License and disclaimer')}
        </h4>
        <p>
          {translate(
            'shamu.project.license',
            'This is open source software distributed under the MIT license. Original copyright notices are retained. Included third-party components remain subject to their respective licenses.'
          )}
        </p>
        <p>
          {translate(
            'shamu.project.warranty',
            'To the fullest extent permitted by applicable law, the software is supplied as is and as available. No express or implied warranties are provided, including merchantability, fitness for a particular purpose or noninfringement. Operation, availability, accuracy, compatibility and freedom from errors are not guaranteed.'
          )}
        </p>
        <p>
          {translate(
            'shamu.project.liability',
            'To the fullest extent permitted by applicable law, maintainers, contributors and copyright holders disclaim liability for claims, losses or damages arising from the software or its use, including loss of data, lost profits or business interruption.'
          )}
        </p>
        <p>
          {translate(
            'shamu.project.mandatoryRights',
            'This notice does not exclude or limit mandatory legal rights or any liability that cannot lawfully be excluded or limited.'
          )}
        </p>
      </div>
    </section>
  )
}

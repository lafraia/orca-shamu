function sections(text) {
  return [...text.matchAll(/^## (.+)$/gm)].map((match) => ({
    title: match[1].trim(),
    start: match.index,
    body: match.index + match[0].length
  }))
}

function unreleased(text) {
  const headings = sections(text)
  const matches = headings.filter((section) => section.title === 'Unreleased')
  if (matches.length !== 1) {
    throw new Error('Keep exactly one Unreleased section in SHAMU_CHANGELOG.md.')
  }
  const section = matches[0]
  const end = headings.find((heading) => heading.start > section.start)?.start ?? text.length
  return { ...section, end, notes: text.slice(section.body, end).trim() }
}

function assertBase(notes, upstream) {
  const lines = notes.split(/\r?\n/)
  if (
    !lines.includes(`Upstream: \`${upstream.tag.slice(1)}\``) ||
    !lines.includes(`Upstream commit: \`${upstream.commit}\``)
  ) {
    throw new Error('The Shamu changelog must match the exact pinned upstream version and commit.')
  }
}

function baseNotes(upstream) {
  return `Upstream: \`${upstream.tag.slice(1)}\`\nUpstream commit: \`${upstream.commit}\``
}

export function shamuUnreleasedTemplate(upstream) {
  return `## Unreleased\n\n${baseNotes(upstream)}\n\n### Upstream integrations\n\n### Shamu changes\n\n### Pull requests\n\n`
}

export function validateShamuChangelog(text, upstream) {
  assertBase(unreleased(text).notes, upstream)
}

export function syncShamuChangelog(text, previous, next) {
  const section = unreleased(text)
  assertBase(section.notes, previous)
  let notes = section.notes
    .replace(`Upstream: \`${previous.tag.slice(1)}\``, `Upstream: \`${next.tag.slice(1)}\``)
    .replace(`Upstream commit: \`${previous.commit}\``, `Upstream commit: \`${next.commit}\``)
  if (previous.commit !== next.commit) {
    const heading = '### Upstream integrations'
    if (!notes.includes(heading)) {
      throw new Error('Add an Upstream integrations heading to the Unreleased changelog.')
    }
    const entry = `- Merged upstream [${next.tag}](https://github.com/stablyai/orca/releases/tag/${next.tag}) at \`${next.commit}\`. Review [the upstream comparison](https://github.com/stablyai/orca/compare/${previous.tag}...${next.tag}) and UPSTREAM_PATCHES.md; add the integration PR link.`
    notes = notes.replace(heading, `${heading}\n\n${entry}`)
  }
  return `${text.slice(0, section.start)}## Unreleased\n\n${notes}\n\n${text.slice(section.end)}`
}

export function closeShamuChangelog(text, upstream, version, date) {
  const section = unreleased(text)
  assertBase(section.notes, upstream)
  if (!/^- \S/m.test(section.notes)) {
    throw new Error('Add the included changes and PR links to Unreleased before closing a release.')
  }
  if (sections(text).some((heading) => heading.title.startsWith(`${version} (`))) {
    throw new Error('This Shamu version already has a closed changelog entry.')
  }
  return `${text.slice(0, section.start)}${shamuUnreleasedTemplate(upstream)}## ${version} (${date})\n\n${section.notes}\n\n${text.slice(section.end)}`
}

export function shamuReleaseNotes(text, upstream, version) {
  const headings = sections(text)
  const section = headings.find((heading) => heading.title.startsWith(`${version} (`))
  if (!section) {
    throw new Error(
      'This version has no closed Shamu changelog entry. Close a release only when explicitly requested.'
    )
  }
  const end = headings.find((heading) => heading.start > section.start)?.start ?? text.length
  const notes = text.slice(section.body, end).trim()
  assertBase(notes, upstream)
  return notes
}

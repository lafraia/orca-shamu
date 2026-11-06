const PREFIX = '#orca-shamu-bot/'

export function botReferenceHref(id: string): string {
  return `${PREFIX}${encodeURIComponent(id).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`
}

export function botReferenceId(href: string | undefined): string | null {
  if (!href?.startsWith(PREFIX)) {
    return null
  }
  try {
    return decodeURIComponent(href.slice(PREFIX.length)) || null
  } catch {
    return null
  }
}

export function botReferenceMarkdown(bot: { id: string; name: string }): string {
  const label = `@${bot.name}`.replace(/[\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ')
  return `[${label}](${botReferenceHref(bot.id)})`
}

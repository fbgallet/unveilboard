import 'server-only'

// Mentions légales de l'instance : l'éditeur et l'hébergeur viennent de l'environnement, pour qu'une
// instance auto-hébergée n'affiche pas ceux d'une autre. Sans LEGAL_PUBLISHER, pas de page /legal.

export interface LegalInfo {
  publisher: string
  /** Liens de l'éditeur (profil, site personnel). */
  links: string[]
  host: string | null
}

export function legalInfo(): LegalInfo | null {
  const publisher = process.env.LEGAL_PUBLISHER?.trim()
  if (!publisher) return null
  const links = (process.env.LEGAL_LINKS ?? '')
    .split(',')
    .map((l) => l.trim())
    .filter((l) => /^https:\/\//.test(l))
  return { publisher, links, host: process.env.LEGAL_HOST?.trim() || null }
}

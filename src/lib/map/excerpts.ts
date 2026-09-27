// Fidélité à la source : chaque extrait cité par l'IA (`excerpt`) doit se trouver dans le texte, et
// chaque citation (type « quote ») aussi. Vérifié par le programme, pas confié au modèle.
//
// La comparaison tolère ce qu'une copie change sans trahir le texte : apostrophes et guillemets
// typographiques, tirets, espaces et sauts de ligne, césures de fin de ligne (PDF), casse, et les
// coupures marquées « … » ou « […] » (chaque morceau doit s'y trouver, dans l'ordre).

import type { MapIssue } from './check'
import type { UnveilMap } from './format'
import { stripInlineMarkdown } from './markdown'

export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/­/g, '') // trait d'union conditionnel
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2') // césure de fin de ligne
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟«»″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*(["'])\s*/g, '$1') // espaces autour des guillemets (« … » en français)
    .trim()
}

/** Morceaux d'un extrait, séparés par les coupures « … », « ... », « […] », « (…) ». */
function pieces(excerpt: string): string[] {
  return excerpt
    .split(/\s*(?:\[\s*(?:…|\.\.\.)\s*\]|\(\s*(?:…|\.\.\.)\s*\)|…|\.\.\.)\s*/)
    .map((p) => normalizeForMatch(p).replace(/^["'\s.,;:!?]+|["'\s.,;:!?]+$/g, ''))
    .filter((p) => p.length > 0)
}

/** L'extrait se trouve-t-il dans le texte normalisé (ses morceaux, dans l'ordre) ? */
export function excerptFound(normalizedSource: string, excerpt: string): boolean {
  const parts = pieces(excerpt)
  if (!parts.length) return false
  let from = 0
  for (const part of parts) {
    const at = normalizedSource.indexOf(part, from)
    if (at < 0) return false
    from = at + part.length
  }
  return true
}

/** Texte d'une citation, sans ses guillemets. */
const quoteText = (text: string) => stripInlineMarkdown(text).trim().replace(/^["«“„'‘\s]+|["»”'’\s]+$/g, '')

export interface ExcerptCheck {
  /** Éléments dont l'extrait (ou la citation) est introuvable dans la source. */
  unverified: string[]
  /** Éléments dont l'extrait a été retrouvé. */
  verified: string[]
  issues: MapIssue[]
}

/**
 * Contrôle un schéma tiré d'une source. `strict` : les extraits introuvables sont des erreurs (pour
 * demander une correction au modèle) ; sinon des avertissements (le schéma reste utilisable).
 */
export function checkExcerpts(map: UnveilMap, source: string, strict: boolean): ExcerptCheck {
  const text = normalizeForMatch(source)
  const level = strict ? 'error' : 'warning'
  const out: ExcerptCheck = { unverified: [], verified: [], issues: [] }
  map.elements.forEach((e, i) => {
    let bad = false
    if (e.excerpt) {
      if (excerptFound(text, e.excerpt)) out.verified.push(e.id)
      else {
        bad = true
        out.issues.push({ level, code: 'excerpt_not_found', path: `elements[${i}].excerpt`, detail: e.id })
      }
    }
    if (e.type === 'quote' && !excerptFound(text, quoteText(e.text))) {
      bad = true
      out.issues.push({ level, code: 'quote_not_found', path: `elements[${i}].text`, detail: e.id })
    }
    if (bad) out.unverified.push(e.id)
  })
  return out
}

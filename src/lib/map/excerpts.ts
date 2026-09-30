// Fidélité à la source : chaque extrait cité par l'IA (`excerpt`) doit se trouver dans le texte, et
// chaque citation (type « quote ») aussi. Vérifié par le programme, pas confié au modèle.
//
// La comparaison tolère ce qu'une copie change sans trahir le texte : apostrophes et guillemets
// typographiques, tirets, espaces et sauts de ligne, césures de fin de ligne (PDF), casse, et les
// coupures marquées « … » ou « […] » (chaque morceau doit s'y trouver, dans l'ordre).

import type { MapIssue } from './check'
import type { UnveilMap } from './format'
import { stripInlineMarkdown } from './markdown'

const SINGLE_QUOTES = /[‘’‚‛′`´]/
const DOUBLE_QUOTES = /[“”„‟«»″]/
const DASHES = /[‐-―−]/
const WORD = /\w/ // ASCII, comme dans la version par expressions régulières
/** Marques Markdown, ignorées pour situer un extrait dans un texte mis en forme. */
const MARKUP = /[*_#>`]/

interface Normalized {
  text: string
  /** Pour chaque caractère normalisé : sa position dans le texte d'origine, début et fin. */
  from: number[]
  to: number[]
}

/**
 * Normalise un texte pour la comparaison, en gardant la position d'origine de chaque caractère :
 * NFKC, sans trait d'union conditionnel ni césure de fin de ligne, apostrophes, guillemets et tirets
 * unifiés, minuscules, espaces réduits (et supprimés autour des guillemets). `ignoreMarkup` : sans
 * les marques Markdown (pour surligner un extrait dans un texte mis en forme).
 */
function normalizeWithMap(text: string, opts: { ignoreMarkup?: boolean } = {}): Normalized {
  // Caractères de base avec leurs marques combinantes : NFKC les compose ensemble.
  let chars: { c: string; from: number; to: number }[] = []
  for (const m of text.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const from = m.index!
    const to = from + m[0].length
    for (const c of m[0].normalize('NFKC')) chars.push({ c, from, to })
  }
  chars = chars.filter((x) => x.c !== '\u00ad' && !(opts.ignoreMarkup && MARKUP.test(x.c)))
  // Césure de fin de ligne : « réac-\ntions » → « réactions ».
  const joined: typeof chars = []
  for (let i = 0; i < chars.length; i++) {
    if (chars[i].c === '-' && WORD.test(joined.at(-1)?.c ?? '')) {
      let j = i + 1
      let newline = false
      for (; j < chars.length && /\s/.test(chars[j].c); j++) if (chars[j].c === '\n') newline = true
      if (newline && WORD.test(chars[j]?.c ?? '')) {
        i = j - 1
        continue
      }
    }
    joined.push(chars[i])
  }
  // Guillemets, tirets, casse, espaces.
  const out: typeof chars = []
  for (const x of joined) {
    const c = SINGLE_QUOTES.test(x.c) ? "'" : DOUBLE_QUOTES.test(x.c) ? '"' : DASHES.test(x.c) ? '-' : x.c
    for (const l of c.toLowerCase()) {
      if (/\s/.test(l)) {
        if (out.at(-1)?.c !== ' ') out.push({ ...x, c: ' ' })
      } else out.push({ ...x, c: l })
    }
  }
  // Pas d'espace autour des guillemets (« … » en français), ni aux extrémités.
  const kept = out.filter((x, i) => x.c !== ' ' || !(/["']/.test(out[i - 1]?.c ?? '') || /["']/.test(out[i + 1]?.c ?? '')))
  while (kept[0]?.c === ' ') kept.shift()
  while (kept.at(-1)?.c === ' ') kept.pop()
  return { text: kept.map((x) => x.c).join(''), from: kept.map((x) => x.from), to: kept.map((x) => x.to) }
}

export function normalizeForMatch(text: string): string {
  return normalizeWithMap(text).text
}

/** Coupures d'un extrait : « … », « ... », « […] », « (…) ». */
const CUTS = /\s*(?:\[\s*(?:…|\.\.\.)\s*\]|\(\s*(?:…|\.\.\.)\s*\)|…|\.\.\.)\s*/

/** Morceaux d'un extrait, normalisés pour la comparaison. */
function pieces(excerpt: string): string[] {
  return excerpt
    .split(CUTS)
    .map((p) => normalizeForMatch(p).replace(/^["'\s.,;:!?]+|["'\s.,;:!?]+$/g, ''))
    .filter((p) => p.length > 0)
}

/** Les passages d'un extrait, tels qu'écrits (un élément peut citer plusieurs passages du texte). */
export function splitExcerpt(excerpt: string): string[] {
  return excerpt
    .split(CUTS)
    .map((p) => p.trim())
    .filter(Boolean)
}

/** Un extrait fait de plusieurs passages, dans l'ordre donné. */
export const joinExcerpt = (passages: string[]) => passages.join(' […] ')

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

/**
 * Où se trouve un extrait dans un texte (éventuellement mis en forme en Markdown) : les plages
 * [début, fin[ du texte d'origine, une par morceau (entre les coupures « […] »). null : introuvable.
 */
export function locateExcerpt(source: Normalized | string, excerpt: string): [number, number][] | null {
  const normalized = typeof source === 'string' ? normalizeForSearch(source) : source
  const parts = pieces(excerpt).map((p) => p.replace(new RegExp(MARKUP.source, 'g'), ''))
  if (!parts.length) return null
  const ranges: [number, number][] = []
  let at = 0
  for (const part of parts) {
    const found = part ? normalized.text.indexOf(part, at) : -1
    if (found < 0) return null
    ranges.push([normalized.from[found], normalized.to[found + part.length - 1]])
    at = found + part.length
  }
  return ranges
}

/** Texte préparé pour y situer des extraits (à garder pour plusieurs recherches dans le même texte). */
export function normalizeForSearch(source: string): Normalized {
  return normalizeWithMap(source, { ignoreMarkup: true })
}

/** Texte d'une citation, sans ses guillemets. */
export const quoteText = (text: string) => stripInlineMarkdown(text).trim().replace(/^["«“„'‘\s]+|["»”'’\s]+$/g, '')

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

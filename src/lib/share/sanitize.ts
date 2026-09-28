// Contrôle d'un document avant publication publique (instance sans base de données) :
// structure d'un vrai document Unveilboard, rien de cliquable, pas d'image intégrée, images du web
// en https seulement et filtrées, texte filtré sur une liste courte de mots-clés.
// Code pur (sans tldraw ni serveur) : testé à part, utilisé par la route de publication.

import { BLOCKED_HOSTS, BLOCKED_TERMS } from './blocklist'

const RECORD_TYPES = new Set(['document', 'page', 'shape', 'asset', 'binding'])
/** Données personnelles de l'auteur (nom, couleur) : jamais publiées. */
const PERSONAL_TYPES = new Set(['user'])
/** Formes qui ne sont que des liens (carte de site, contenu intégré) : retirées. */
const LINK_SHAPES = new Set(['bookmark', 'embed'])
const MAX_RECORDS = 5000

type Rec = { id: string; typeName: string; type?: string; props?: Record<string, unknown>; meta?: Record<string, unknown> } & Record<string, unknown>

export interface PublicSnapshot {
  store: Record<string, Rec>
  schema: Record<string, unknown>
}

export type SanitizeResult =
  | { ok: true; snapshot: PublicSnapshot; title: string }
  | { ok: false; reason: 'invalid' | 'blocked' }

export function sanitizeForPublicShare(input: unknown, extraTerms: string[] = []): SanitizeResult {
  if (!isObject(input) || !isObject(input.store) || !isObject(input.schema)) return { ok: false, reason: 'invalid' }
  const entries = Object.entries(input.store).filter(([, r]) => !(isObject(r) && PERSONAL_TYPES.has(String(r.typeName))))
  if (entries.length > MAX_RECORDS) return { ok: false, reason: 'invalid' }
  for (const [key, r] of entries) {
    if (!isObject(r) || r.id !== key || typeof r.typeName !== 'string' || !RECORD_TYPES.has(r.typeName)) {
      return { ok: false, reason: 'invalid' }
    }
  }
  const records = entries.map(([, r]) => r as Rec)
  const sequence = records.find((r) => r.typeName === 'document')?.meta?.sequence
  // Étapes communes (anciens documents) ou par page (`pages`, voir canvas/adapter.ts).
  if (!isObject(sequence) || !Array.isArray(sequence.steps) || (sequence.pages !== undefined && !isObject(sequence.pages))) {
    return { ok: false, reason: 'invalid' }
  }

  const terms = [...BLOCKED_TERMS, ...extraTerms].map(normalize).filter(Boolean)
  const dropped = new Set(
    records.filter((r) => (r.typeName === 'shape' && LINK_SHAPES.has(String(r.type))) || (r.typeName === 'asset' && r.type === 'bookmark')).map((r) => r.id)
  )

  const store: Record<string, Rec> = {}
  for (const record of records) {
    if (dropped.has(record.id)) continue
    // Liaisons (flèches) vers une forme retirée.
    if (record.typeName === 'binding' && (dropped.has(String(record.fromId)) || dropped.has(String(record.toId)))) continue
    const r = structuredClone(record)

    if (r.typeName === 'shape' && r.props) {
      if (typeof r.props.url === 'string') r.props.url = ''
      if (r.props.richText) r.props.richText = withoutLinks(r.props.richText)
    }
    if (r.typeName === 'asset' && r.props && 'src' in r.props) {
      const src = r.props.src
      if (typeof src === 'string' && src) {
        if (!src.startsWith('https://')) r.props.src = null
        else if (isBlockedUrl(src, terms)) return { ok: false, reason: 'blocked' }
      }
    }
    store[r.id] = r
  }

  // Texte : toutes les chaînes du document (textes, narration, notes, titres), sauf les adresses d'images.
  const text: string[] = []
  for (const r of Object.values(store)) collectStrings(r.typeName === 'asset' ? { ...r, props: { ...r.props, src: null } } : r, text)
  const haystack = ` ${normalize(text.join(' '))} `
  if (terms.some((term) => haystack.includes(` ${term} `))) return { ok: false, reason: 'blocked' }

  const title = typeof sequence.title === 'string' ? sequence.title.trim().slice(0, 200) : ''
  return { ok: true, snapshot: { store, schema: input.schema as Record<string, unknown> }, title }
}

export function isBlockedUrl(url: string, terms: string[]) {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return true
  }
  const host = parsed.hostname.toLowerCase()
  if (BLOCKED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true
  const flat = normalize(`${host} ${decodeSafe(parsed.pathname)} ${decodeSafe(parsed.search)}`)
  const words = ` ${flat} `
  // Dans une adresse, un terme d'un seul mot compte aussi collé à d'autres (« freepornsite.com »).
  return terms.some((t) => words.includes(` ${t} `) || (!t.includes(' ') && t.length >= 4 && flat.replace(/ /g, '').includes(t)))
}

/** Minuscules, sans accents, mots séparés par une espace. */
export function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function withoutLinks(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutLinks)
  if (!isObject(node)) return node
  const out: Record<string, unknown> = { ...node }
  if (Array.isArray(out.marks)) {
    out.marks = out.marks.filter((m) => !(isObject(m) && m.type === 'link'))
    if (!(out.marks as unknown[]).length) delete out.marks
  }
  if (Array.isArray(out.content)) out.content = out.content.map(withoutLinks)
  return out
}

function collectStrings(value: unknown, into: string[]) {
  if (typeof value === 'string') into.push(value)
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, into))
  else if (isObject(value)) Object.values(value).forEach((v) => collectStrings(v, into))
}

function decodeSafe(s: string) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

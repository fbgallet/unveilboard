// Étiquettes des schémas (« Terminale », « Liberté »…), pour les classer à l'accueil.
// Elles vivent dans le document (document.meta.tags) : un fichier .tldr les emporte ;
// le stockage en garde une copie à côté du titre, pour la liste de l'accueil.

export const MAX_TAGS = 20
export const MAX_TAG_LENGTH = 40
/** Identifiant de l'enregistrement « document » dans un instantané tldraw. */
export const DOCUMENT_RECORD_ID = 'document:document'

/** Étiquette propre (espaces réduits, longueur bornée) ; vide si rien à garder. */
export function cleanTag(tag: string) {
  return tag.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim()
}

/** Étiquettes valides et sans doublon (sans tenir compte de la casse), dans l'ordre donné. */
export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const tag = cleanTag(value)
    const key = tag.toLocaleLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length === MAX_TAGS) break
  }
  return out
}

/** Étiquettes d'un instantané tldraw ({ store, schema }), lues dans document.meta. */
export function snapshotTags(snapshot: unknown): string[] {
  const store = (snapshot as { store?: Record<string, { meta?: { tags?: unknown } }> } | null)?.store
  return normalizeTags(store?.[DOCUMENT_RECORD_ID]?.meta?.tags)
}

/** Instantané dont les étiquettes sont remplacées (sans toucher au reste du document). */
export function withSnapshotTags<T>(snapshot: T, tags: string[]): T {
  const s = snapshot as { store?: Record<string, { meta?: Record<string, unknown> }> }
  const doc = s?.store?.[DOCUMENT_RECORD_ID]
  if (!doc) return snapshot
  return { ...s, store: { ...s.store, [DOCUMENT_RECORD_ID]: { ...doc, meta: { ...doc.meta, tags } } } } as T
}

/** Instantané sans étiquettes (classement privé), pour une publication. */
export function withoutSnapshotTags<T>(snapshot: T): T {
  const s = snapshot as { store?: Record<string, { meta?: Record<string, unknown> }> }
  const doc = s?.store?.[DOCUMENT_RECORD_ID]
  if (!doc?.meta || !('tags' in doc.meta)) return snapshot
  const meta = { ...doc.meta }
  delete meta.tags
  return { ...s, store: { ...s.store, [DOCUMENT_RECORD_ID]: { ...doc, meta } } } as T
}

/** Même étiquette, sans tenir compte de la casse. */
export const sameTag = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase()

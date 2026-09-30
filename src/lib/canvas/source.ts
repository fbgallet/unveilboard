// Texte source d'une page, gardé dans le document : affiché à gauche du schéma (barre « Texte
// source »), mis en forme en Markdown et modifiable, avec les passages cités par les éléments
// surlignés (src/lib/map/excerpts.ts, locateExcerpt). Un schéma tiré d'un texte le reçoit à sa
// création ; on peut aussi associer un texte à n'importe quelle page, pour construire à partir de lui.

import type { Editor, JsonObject, TLPageId } from 'tldraw'

/** Textes par page ; `source` : l'ancien emplacement (un seul texte, celui de la première page). */
const META_KEY = 'sources'
const LEGACY_KEY = 'source'

export interface DocumentSource {
  /** Le texte, en Markdown (un texte brut en est un). */
  text: string
  /** Sa référence (auteur, œuvre, date). */
  label?: string
}

type Sources = Record<string, DocumentSource>

function stored(editor: Editor): Sources {
  const meta = editor.getDocumentSettings().meta
  const sources = { ...((meta[META_KEY] as unknown as Sources | undefined) ?? {}) }
  const legacy = meta[LEGACY_KEY] as unknown as DocumentSource | undefined
  const first = editor.getPages()[0]?.id
  if (legacy && typeof legacy.text === 'string' && first && !sources[first]) sources[first] = legacy
  return sources
}

/** Le texte d'une page (par défaut, la page courante), ou null. */
export function readPageSource(editor: Editor, pageId: TLPageId = editor.getCurrentPageId()): DocumentSource | null {
  const source = stored(editor)[pageId]
  return source && typeof source.text === 'string' ? source : null
}

/** Garde le texte d'une page (null : le retire). */
export function writePageSource(editor: Editor, source: DocumentSource | null, pageId: TLPageId = editor.getCurrentPageId()) {
  const sources = stored(editor)
  if (source) sources[pageId] = { text: source.text, ...(source.label && { label: source.label }) }
  else delete sources[pageId]
  const meta = { ...editor.getDocumentSettings().meta }
  delete meta[LEGACY_KEY]
  if (Object.keys(sources).length) meta[META_KEY] = sources as unknown as JsonObject
  else delete meta[META_KEY]
  editor.updateDocumentSettings({ meta })
}

/** Longueur totale des textes du document (pour le partage). */
export function sourcesLength(editor: Editor): number {
  return Object.values(stored(editor)).reduce((n, s) => n + (s.text?.length ?? 0), 0)
}

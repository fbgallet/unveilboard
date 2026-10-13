// Méthode d'une page : le prompt de la bibliothèque avec lequel son schéma a été créé, ou celui
// choisi ensuite pour le développer. Gardée dans le document, elle est proposée d'abord pour
// développer et enrichir le schéma de cette page (avec ses visées), sur tous les appareils.

import type { Editor, JsonObject, TLPageId } from 'tldraw'

const META_KEY = 'methods'

function stored(editor: Editor): Record<string, string> {
  const methods = editor.getDocumentSettings().meta[META_KEY]
  return methods && typeof methods === 'object' && !Array.isArray(methods) ? { ...(methods as Record<string, string>) } : {}
}

/**
 * Méthode d'une page (par défaut, la page courante) : un identifiant de prompt, « » si l'utilisateur
 * a choisi de n'en suivre aucune, undefined si la page n'en a pas.
 */
export function readPageMethod(editor: Editor, pageId: TLPageId = editor.getCurrentPageId()): string | undefined {
  const id = stored(editor)[pageId]
  return typeof id === 'string' ? id : undefined
}

/** Garde la méthode d'une page (undefined : l'oublie). */
export function writePageMethod(editor: Editor, id: string | undefined, pageId: TLPageId = editor.getCurrentPageId()) {
  const methods = stored(editor)
  if (methods[pageId] === id) return
  if (id === undefined) delete methods[pageId]
  else methods[pageId] = id
  const meta = { ...editor.getDocumentSettings().meta }
  if (Object.keys(methods).length) meta[META_KEY] = methods as JsonObject
  else delete meta[META_KEY]
  // Un réglage, pas une modification du schéma : hors historique (Ctrl+Z ne le défait pas).
  editor.run(() => editor.updateDocumentSettings({ meta }), { history: 'ignore' })
}

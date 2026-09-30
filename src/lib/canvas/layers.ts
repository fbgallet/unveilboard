// Calques libres du texte source : l'auteur les crée et les nomme (« arguments », « concepts »,
// « lecture 2 »…), et y range des éléments. Un calque regroupe des passages pour les afficher ou les
// masquer ensemble ; chaque passage garde la couleur de son élément. Un élément sans calque libre
// garde son calque automatique (sa fonction, sinon son type).
//
// Les calques sont gardés dans le document (communs à ses pages) ; l'appartenance d'un élément,
// dans ses métadonnées (meta.layer).

import { atom, type Editor, type JsonObject, type TLShapeId, type TLShapePartial } from 'tldraw'

const META_KEY = 'sourceLayers'

export interface SourceLayer {
  id: string
  name: string
}

/** Calque actif : les éléments créés depuis un passage y sont rangés. */
export const activeLayerAtom = atom<string | null>('activeSourceLayer', null)

export function readLayers(editor: Editor): SourceLayer[] {
  const raw = editor.getDocumentSettings().meta[META_KEY]
  return Array.isArray(raw) ? (raw as unknown as SourceLayer[]).filter((l) => l && typeof l.id === 'string' && typeof l.name === 'string') : []
}

function writeLayers(editor: Editor, layers: SourceLayer[]) {
  const meta = { ...editor.getDocumentSettings().meta }
  if (layers.length) meta[META_KEY] = layers as unknown as JsonObject[]
  else delete meta[META_KEY]
  editor.updateDocumentSettings({ meta })
}

/** Nouveau calque ; renvoie son identifiant. */
export function addLayer(editor: Editor, name: string): string {
  const layers = readLayers(editor)
  let n = layers.length + 1
  while (layers.some((l) => l.id === `layer${n}`)) n++
  const id = `layer${n}`
  writeLayers(editor, [...layers, { id, name }])
  return id
}

export function updateLayer(editor: Editor, id: string, change: Partial<Omit<SourceLayer, 'id'>>) {
  writeLayers(
    editor,
    readLayers(editor).map((l) => (l.id === id ? { ...l, ...change } : l))
  )
}

/** Supprime un calque : ses éléments retrouvent leur calque automatique. */
export function removeLayer(editor: Editor, id: string) {
  editor.markHistoryStoppingPoint('supprimer un calque')
  const updates = editor
    .getCurrentPageShapes()
    .filter((s) => s.meta.layer === id)
    .map((s) => ({ id: s.id, type: s.type, meta: { ...s.meta, layer: null } }) as TLShapePartial)
  if (updates.length) editor.updateShapes(updates)
  // Les éléments des autres pages aussi.
  for (const page of editor.getPages()) {
    if (page.id === editor.getCurrentPageId()) continue
    const others = [...editor.getPageShapeIds(page.id)]
      .map((sid) => editor.getShape(sid))
      .filter((s) => s?.meta.layer === id)
      .map((s) => ({ id: s!.id, type: s!.type, meta: { ...s!.meta, layer: null } }) as TLShapePartial)
    if (others.length) editor.updateShapes(others)
  }
  writeLayers(
    editor,
    readLayers(editor).filter((l) => l.id !== id)
  )
  if (activeLayerAtom.get() === id) activeLayerAtom.set(null)
}

/** Range un élément dans un calque libre (null : son calque automatique). */
export function setElementLayer(editor: Editor, id: TLShapeId, layer: string | null) {
  const shape = editor.getShape(id)
  if (!shape || (shape.meta.layer ?? null) === layer) return
  editor.markHistoryStoppingPoint('ranger dans un calque')
  editor.updateShape({ id, type: shape.type, meta: { ...shape.meta, layer } } as TLShapePartial)
}

/** Le calque libre d'un élément, s'il en a un (et qu'il existe encore). */
export function layerOfElement(editor: Editor, id: TLShapeId, layers = readLayers(editor)): SourceLayer | undefined {
  const key = editor.getShape(id)?.meta.layer
  return typeof key === 'string' ? layers.find((l) => l.id === key) : undefined
}

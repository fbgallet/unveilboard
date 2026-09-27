// Suggestions de l'IA en attente : des formes ordinaires (boîtes, branches, liens) marquées
// meta.suggestion = { rationale? }, visibles mais distinctes (estompées, étiquette « suggestion »),
// que l'utilisateur accepte ou écarte une à une. Tant qu'elles ne sont pas acceptées, elles restent
// hors de la présentation, de l'export JSON, du dévoilement de la carte et des partages.

import type { Editor, TLArrowBinding, TLShape, TLShapeId, TLShapePartial } from 'tldraw'
import { getTreeIndex, relayout, rootOf, withBranchesToDelete } from './tree'

export interface SuggestionMeta {
  /** Pourquoi l'IA propose cet élément (une phrase). */
  rationale?: string
}

export const isSuggestion = (shape: TLShape | undefined) => !!shape?.meta.suggestion

export function suggestionOf(shape: TLShape | undefined): SuggestionMeta | null {
  const s = shape?.meta.suggestion
  return s && typeof s === 'object' ? (s as SuggestionMeta) : s ? {} : null
}

/** Suggestions à trancher : les boîtes, et les liens transversaux (les branches suivent leur boîte). */
export function pendingSuggestions(editor: Editor): TLShape[] {
  const edges = new Set(getTreeIndex(editor).edge.values())
  return editor.getCurrentPageShapes().filter((s) => isSuggestion(s) && !edges.has(s.id))
}

const unmark = (editor: Editor, ids: TLShapeId[]) => {
  const updates = ids
    .map((id) => editor.getShape(id))
    .filter((s): s is TLShape => isSuggestion(s))
    // meta est fusionné par updateShapes : null efface la marque.
    .map((s) => ({ id: s.id, type: s.type, meta: { ...s.meta, suggestion: null } }) as TLShapePartial)
  if (updates.length) editor.updateShapes(updates)
}

/** Boîte suggérée, avec sa branche et ses ancêtres suggérés (on n'accepte pas un enfant sans son parent). */
function withAncestors(editor: Editor, id: TLShapeId): TLShapeId[] {
  const { parent, edge } = getTreeIndex(editor)
  const out: TLShapeId[] = []
  for (let n: TLShapeId | undefined = id; n && isSuggestion(editor.getShape(n)); n = parent.get(n)) {
    out.push(n)
    const e = edge.get(n)
    if (e) out.push(e)
  }
  return out
}

function endpoints(editor: Editor, arrow: TLShapeId): TLShapeId[] {
  const shape = editor.getShape(arrow)
  return shape ? editor.getBindingsFromShape<TLArrowBinding>(shape, 'arrow').map((b) => b.toId) : []
}

/** Accepte une suggestion (boîte ou lien) : elle devient une forme ordinaire. */
export function acceptSuggestion(editor: Editor, id: TLShapeId) {
  editor.markHistoryStoppingPoint('accepter une suggestion')
  const shape = editor.getShape(id)
  const ids = shape?.type === 'arrow' ? [id, ...endpoints(editor, id).flatMap((n) => withAncestors(editor, n))] : withAncestors(editor, id)
  unmark(editor, ids)
}

/** Écarte une suggestion : une boîte part avec sa branche et les liens qui la touchent. */
export function rejectSuggestion(editor: Editor, id: TLShapeId) {
  editor.markHistoryStoppingPoint('écarter une suggestion')
  remove(editor, [id])
}

export function acceptAllSuggestions(editor: Editor) {
  editor.markHistoryStoppingPoint('accepter les suggestions')
  unmark(editor, editor.getCurrentPageShapes().filter(isSuggestion).map((s) => s.id))
}

export function rejectAllSuggestions(editor: Editor) {
  editor.markHistoryStoppingPoint('écarter les suggestions')
  remove(editor, pendingSuggestions(editor).map((s) => s.id))
}

function remove(editor: Editor, ids: TLShapeId[]) {
  const { parent } = getTreeIndex(editor)
  const parents = ids.map((id) => parent.get(id)).filter((p): p is TLShapeId => !!p)
  const gone = new Set(withBranchesToDelete(editor, ids.filter((id) => editor.getShape(id)?.type !== 'arrow')))
  for (const id of ids) if (editor.getShape(id)?.type === 'arrow') gone.add(id)
  // Les liens transversaux qui touchent une boîte écartée partent avec elle.
  for (const s of editor.getCurrentPageShapes()) {
    if (s.type === 'arrow' && !gone.has(s.id) && endpoints(editor, s.id).some((n) => gone.has(n))) gone.add(s.id)
  }
  editor.run(() => {
    editor.deleteShapes([...gone])
    const roots = new Set(parents.filter((p) => editor.getShape(p)).map((p) => rootOf(editor, p)))
    for (const root of roots) relayout(editor, root)
  })
}

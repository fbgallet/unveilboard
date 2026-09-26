// Détails dépliables : une forme texte ordinaire rattachée sous une boîte (meta.detailOf).
// Elle suit la boîte (position, largeur), disparaît avec elle, et ne s'affiche que si le
// détail est déplié (meta.detailOpen de la boîte) ; en présentation, la séquence décide.

import {
  Box,
  computed,
  createShapeId,
  startEditingShapeWithRichText,
  toRichText,
  type Computed,
  type Editor,
  type TLShape,
  type TLShapeId,
  type TLShapePartial,
} from 'tldraw'

export const DETAIL_GAP = 8

export interface DetailIndex {
  /** Boîte de chaque détail. */
  owner: Map<TLShapeId, TLShapeId>
  /** Détails de chaque boîte. */
  details: Map<TLShapeId, TLShapeId[]>
}

const indexes = new WeakMap<Editor, Computed<DetailIndex>>()

export function getDetailIndex(editor: Editor): DetailIndex {
  let index = indexes.get(editor)
  if (!index) {
    index = computed('detail index', () => {
      const owner = new Map<TLShapeId, TLShapeId>()
      const details = new Map<TLShapeId, TLShapeId[]>()
      for (const shape of editor.getCurrentPageShapes()) {
        const box = shape.meta.detailOf as TLShapeId | undefined
        if (!box || box === shape.id || !editor.getShape(box)) continue
        owner.set(shape.id, box)
        details.set(box, [...(details.get(box) ?? []), shape.id])
      }
      return { owner, details }
    })
    indexes.set(editor, index)
  }
  return index.get()
}

export const isDetailOpen = (editor: Editor, boxId: TLShapeId) => !!editor.getShape(boxId)?.meta.detailOpen

/** Détail masqué en édition : son détail est replié. */
export function isHiddenDetail(editor: Editor, shape: TLShape) {
  const box = getDetailIndex(editor).owner.get(shape.id)
  return !!box && !isDetailOpen(editor, box)
}

export function boxOfDetail(editor: Editor, id: TLShapeId) {
  return getDetailIndex(editor).owner.get(id)
}

/** Boîte et détails réunis : la place réservée dans un arbre, que le détail soit déplié ou non. */
export function boundsWithDetails(editor: Editor, id: TLShapeId): Box | undefined {
  const b = editor.getShapePageBounds(id)
  if (!b) return undefined
  const extra = (getDetailIndex(editor).details.get(id) ?? []).map((d) => editor.getShapePageBounds(d)).filter((x): x is Box => !!x)
  return extra.length ? Box.Common([b, ...extra]) : b
}

// ---------- Commandes ----------

/** Ajoute un détail sous la boîte, déplié, et passe en saisie. */
export function addDetail(editor: Editor, boxId: TLShapeId) {
  const box = editor.getShape(boxId)
  const b = editor.getShapePageBounds(boxId)
  if (!box || !b) return
  editor.markHistoryStoppingPoint('ajouter un détail')
  const id = createShapeId()
  const color = 'color' in box.props ? box.props.color : 'black'
  editor.run(() => {
    editor.createShape({
      id,
      type: 'text',
      x: b.x,
      y: b.maxY + DETAIL_GAP,
      props: { richText: toRichText(''), autoSize: false, w: b.w, size: 's', color, font: 'sans', textAlign: 'start' },
      meta: { detailOf: boxId },
    })
    editor.updateShape({ id: boxId, type: box.type, meta: { ...box.meta, detailOpen: true } })
  })
  editor.select(id)
  startEditingShapeWithRichText(editor, id)
}

export function toggleDetail(editor: Editor, boxId: TLShapeId) {
  const box = editor.getShape(boxId)
  if (!box) return
  editor.markHistoryStoppingPoint('déplier le détail')
  const open = !box.meta.detailOpen
  editor.updateShape({ id: boxId, type: box.type, meta: { ...box.meta, detailOpen: open } })
  if (!open) {
    const hidden = new Set(getDetailIndex(editor).details.get(boxId))
    editor.setSelectedShapes(editor.getSelectedShapeIds().filter((s) => !hidden.has(s)))
  }
}

// ---------- Effets de bord ----------

let placing = false

/** Replace les détails d'une boîte juste sous elle, à sa largeur. */
function placeDetails(editor: Editor, boxId: TLShapeId) {
  const b = editor.getShapePageBounds(boxId)
  const ids = getDetailIndex(editor).details.get(boxId)
  if (!b || !ids) return
  let y = b.maxY + DETAIL_GAP
  const updates: TLShapePartial[] = []
  for (const id of ids) {
    const shape = editor.getShape(id)
    const db = editor.getShapePageBounds(id)
    if (!shape || !db) continue
    const props = shape.type === 'text' && Math.abs((shape.props as { w: number }).w - b.w) > 0.5 ? { w: b.w } : undefined
    if (Math.abs(db.x - b.x) > 0.5 || Math.abs(db.y - y) > 0.5 || props) {
      updates.push({ id, type: shape.type, x: shape.x + (b.x - db.x), y: shape.y + (y - db.y), ...(props && { props }) } as TLShapePartial)
    }
    y += db.h + DETAIL_GAP
  }
  if (!updates.length) return
  placing = true
  try {
    editor.updateShapes(updates)
  } finally {
    placing = false
  }
}

/** Les détails suivent leur boîte : déplacement, redimensionnement, mise en page d'un arbre. */
export function registerDetailSideEffects(editor: Editor) {
  return editor.sideEffects.registerAfterChangeHandler('shape', (prev, next) => {
    if (placing) return
    if (getDetailIndex(editor).details.has(next.id)) {
      if (prev.x !== next.x || prev.y !== next.y || prev.props !== next.props) placeDetails(editor, next.id)
      return
    }
    // Un détail qui grandit repousse les détails suivants de la même boîte.
    const box = getDetailIndex(editor).owner.get(next.id)
    if (box && prev.props !== next.props && !editor.isIn('select.translating')) placeDetails(editor, box)
  })
}

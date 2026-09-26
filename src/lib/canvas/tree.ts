// Arbres (cartes mentales) sur des formes tldraw ordinaires.
//
// Un arbre n'est qu'un ensemble de formes reliées par des flèches natives marquées
// `meta.branch` (début = parent, fin = enfant). Tout reste dans le format tldraw :
// sans ce module, le document s'affiche comme un schéma normal.
//
// meta d'une forme-nœud : folded (branche repliée), treeOffset (décalage manuel),
// treeDir (sur la racine : 'right' | 'down').

import {
  computed,
  createShapeId,
  startEditingShapeWithRichText,
  toRichText,
  type Computed,
  type Editor,
  type TLArrowBinding,
  type TLShape,
  type TLShapeId,
  type TLShapePartial,
} from 'tldraw'
import { descendantsOf, hasAncestor, layoutTree, type TreeDirection, type TreeNode, type Vec } from '../tree/layout'
import { boundsWithDetails, getDetailIndex } from './details'

export interface TreeIndex {
  /** Parent de chaque nœud. */
  parent: Map<TLShapeId, TLShapeId>
  /** Enfants de chaque nœud (ordre quelconque). */
  children: Map<TLShapeId, TLShapeId[]>
  /** Flèche qui relie chaque nœud à son parent. */
  edge: Map<TLShapeId, TLShapeId>
}

const indexes = new WeakMap<Editor, Computed<TreeIndex>>()

/** Structure des arbres de la page courante (calcul réactif, mis en cache). */
export function getTreeIndex(editor: Editor): TreeIndex {
  let index = indexes.get(editor)
  if (!index) {
    index = computed('tree index', () => buildIndex(editor))
    indexes.set(editor, index)
  }
  return index.get()
}

function buildIndex(editor: Editor): TreeIndex {
  const parent = new Map<TLShapeId, TLShapeId>()
  const children = new Map<TLShapeId, TLShapeId[]>()
  const edge = new Map<TLShapeId, TLShapeId>()
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== 'arrow' || !shape.meta.branch) continue
    const bindings = editor.getBindingsFromShape<TLArrowBinding>(shape, 'arrow')
    const from = bindings.find((b) => b.props.terminal === 'start')?.toId
    const to = bindings.find((b) => b.props.terminal === 'end')?.toId
    // Un seul parent par nœud ; une flèche de branche détachée ne compte plus.
    if (!from || !to || from === to || parent.has(to)) continue
    parent.set(to, from)
    edge.set(to, shape.id)
    children.set(from, [...(children.get(from) ?? []), to])
  }
  return { parent, children, edge }
}

export function isTreeNode(editor: Editor, id: TLShapeId) {
  const { parent, children } = getTreeIndex(editor)
  return parent.has(id) || children.has(id)
}

export function rootOf(editor: Editor, id: TLShapeId): TLShapeId {
  const { parent } = getTreeIndex(editor)
  const seen = new Set<TLShapeId>()
  let root = id
  while (parent.has(root) && !seen.has(root)) {
    seen.add(root)
    root = parent.get(root)!
  }
  return root
}

export function branchOf(editor: Editor, id: TLShapeId): TLShapeId[] {
  return descendantsOf(getTreeIndex(editor).children, id) as TLShapeId[]
}

export const isFolded = (editor: Editor, id: TLShapeId) => !!editor.getShape(id)?.meta.folded

/**
 * Forme masquée par une branche repliée : un nœud dont un ancêtre est replié,
 * ou une flèche liée à un tel nœud.
 */
export function isHiddenByFold(editor: Editor, shape: TLShape): boolean {
  const { parent } = getTreeIndex(editor)
  const hidden = (id: TLShapeId) => hasAncestor(parent, id, (p) => isFolded(editor, p as TLShapeId))
  if (shape.type === 'arrow') {
    return editor.getBindingsFromShape<TLArrowBinding>(shape, 'arrow').some((b) => hidden(b.toId))
  }
  return parent.has(shape.id) && hidden(shape.id)
}

// ---------- Mise en page ----------

/** Vrai pendant que le module déplace lui-même des formes (les effets de bord l'ignorent). */
let layingOut = false

function offsetOf(shape: TLShape | undefined): Vec {
  const o = shape?.meta.treeOffset as Vec | undefined
  return o ? { x: o.x, y: o.y } : { x: 0, y: 0 }
}

export function directionOf(editor: Editor, rootId: TLShapeId): TreeDirection {
  return editor.getShape(rootId)?.meta.treeDir === 'down' ? 'down' : 'right'
}

/** Recalcule la position des nœuds d'un arbre. `reset` efface les décalages manuels. */
export function relayout(editor: Editor, anyNodeId: TLShapeId, opts: { reset?: boolean } = {}) {
  const rootId = rootOf(editor, anyNodeId)
  const { children } = getTreeIndex(editor)
  const dir = directionOf(editor, rootId)
  const ids = [rootId, ...branchOf(editor, rootId)]
  // Tailles avec les détails (place réservée, qu'ils soient dépliés ou non).
  // Ordre des enfants : celui de leur position actuelle, perpendiculairement à l'arbre.
  const crossCenter = (id: TLShapeId) => {
    const b = editor.getShapePageBounds(id)
    return b ? (dir === 'right' ? b.midY : b.midX) : 0
  }
  const nodes = new Map<string, TreeNode>()
  for (const id of ids) {
    const b = boundsWithDetails(editor, id)
    if (!b) continue
    nodes.set(id, {
      w: b.w,
      h: b.h,
      offset: opts.reset ? { x: 0, y: 0 } : offsetOf(editor.getShape(id)),
      children: [...(children.get(id) ?? [])].sort((a, b) => crossCenter(a) - crossCenter(b)),
    })
  }
  const rootBounds = boundsWithDetails(editor, rootId)
  if (!rootBounds) return
  const positions = layoutTree(rootId, { x: rootBounds.x, y: rootBounds.y }, nodes, dir)

  const updates: TLShapePartial[] = []
  for (const [id, target] of positions) {
    const shape = editor.getShape(id as TLShapeId)
    const b = boundsWithDetails(editor, id as TLShapeId)
    if (!shape || !b) continue
    const dx = target.x - b.x
    const dy = target.y - b.y
    // meta est fusionné par updateShapes : on efface le décalage en le mettant à null.
    const meta = opts.reset && shape.meta.treeOffset ? { ...shape.meta, treeOffset: null } : undefined
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && !meta) continue
    updates.push({ id: shape.id, type: shape.type, x: shape.x + dx, y: shape.y + dy, ...(meta && { meta }) })
  }
  const bindings = edgeAnchors(editor, ids, dir)
  if (!updates.length && !bindings.length) return
  layingOut = true
  try {
    editor.updateShapes(updates)
    editor.updateBindings(bindings)
  } finally {
    layingOut = false
  }
}

/** Les branches partent du bord du parent vers le bord opposé de l'enfant (tracé coudé net). */
function edgeAnchors(editor: Editor, ids: TLShapeId[], dir: TreeDirection) {
  const { edge } = getTreeIndex(editor)
  const anchors = dir === 'right' ? { start: { x: 1, y: 0.5 }, end: { x: 0, y: 0.5 } } : { start: { x: 0.5, y: 1 }, end: { x: 0.5, y: 0 } }
  return ids.flatMap((id) => {
    const arrow = edge.get(id)
    if (!arrow) return []
    return editor.getBindingsFromShape<TLArrowBinding>(arrow, 'arrow').flatMap((b) => {
      const a = anchors[b.props.terminal]
      if (b.props.isPrecise && b.props.normalizedAnchor.x === a.x && b.props.normalizedAnchor.y === a.y) return []
      return [{ ...b, props: { ...b.props, normalizedAnchor: a, isPrecise: true } }]
    })
  })
}

// ---------- Création de nœuds ----------

const STYLE_KEYS = ['geo', 'color', 'labelColor', 'fill', 'dash', 'size', 'font', 'align', 'verticalAlign', 'w', 'h'] as const

/** Nouveau nœud relié à `parentId`, sur le modèle de `modelId`, placé près de `near`. */
function createNode(editor: Editor, parentId: TLShapeId, modelId: TLShapeId, near: Vec): TLShapeId {
  const model = editor.getShape(modelId)
  const props: Record<string, unknown> = { richText: toRichText('') }
  if (model?.type === 'geo') for (const k of STYLE_KEYS) props[k] = model.props[k]
  else Object.assign(props, { geo: 'rectangle', w: 200, h: 60 })

  const id = createShapeId()
  const arrowId = createShapeId()
  editor.run(() => {
    editor.createShape({ id, type: 'geo', x: near.x, y: near.y, props, meta: model?.meta.preset ? { preset: model.meta.preset } : {} })
    editor.createShape({
      id: arrowId,
      type: 'arrow',
      meta: { branch: true },
      props: { kind: 'elbow', color: 'grey', size: 's', arrowheadEnd: 'none' },
    })
    const binding = (terminal: 'start' | 'end', toId: TLShapeId) => ({
      type: 'arrow' as const,
      fromId: arrowId,
      toId,
      props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' as const },
    })
    editor.createBindings([binding('start', parentId), binding('end', id)])
    // Un parent replié se déplie pour montrer le nouveau nœud.
    const parent = editor.getShape(parentId)
    if (parent?.meta.folded) editor.updateShape({ id: parentId, type: parent.type, meta: { ...parent.meta, folded: false } })
    relayout(editor, parentId)
  })
  editor.select(id)
  startEditingShapeWithRichText(editor, id, { selectAll: true })
  return id
}

/** Tab : ajoute un enfant (et fait de la forme la racine d'un arbre si besoin). */
export function addChild(editor: Editor, id: TLShapeId) {
  editor.markHistoryStoppingPoint('ajouter un enfant')
  const kids = getTreeIndex(editor).children.get(id) ?? []
  const last = kids
    .map((k) => editor.getShapePageBounds(k))
    .filter(Boolean)
    .sort((a, b) => b!.maxY + b!.maxX - (a!.maxY + a!.maxX))[0]
  const b = editor.getShapePageBounds(id)!
  // Placé après les enfants existants : l'ordre suit la position.
  const near = last ? { x: last.x + 1, y: last.y + 1 } : { x: b.maxX + 72, y: b.y }
  return createNode(editor, id, kids[0] ?? id, near)
}

/** Entrée : ajoute un frère juste après le nœud. Sans parent, ne fait rien. */
export function addSibling(editor: Editor, id: TLShapeId) {
  const parentId = getTreeIndex(editor).parent.get(id)
  if (!parentId) return null
  editor.markHistoryStoppingPoint('ajouter un frère')
  const b = editor.getShapePageBounds(id)!
  return createNode(editor, parentId, id, { x: b.x + 1, y: b.y + 1 })
}

export function toggleFold(editor: Editor, id: TLShapeId) {
  const shape = editor.getShape(id)
  if (!shape) return
  editor.markHistoryStoppingPoint('replier')
  const folded = !shape.meta.folded
  editor.updateShape({ id, type: shape.type, meta: { ...shape.meta, folded } })
  if (folded) {
    const hidden = new Set(branchOf(editor, id))
    editor.setSelectedShapes(editor.getSelectedShapeIds().filter((s) => !hidden.has(s)))
  }
}

export function setDirection(editor: Editor, id: TLShapeId, dir: TreeDirection) {
  const rootId = rootOf(editor, id)
  const root = editor.getShape(rootId)
  if (!root) return
  editor.markHistoryStoppingPoint('direction de l’arbre')
  editor.run(() => {
    editor.updateShape({ id: rootId, type: root.type, meta: { ...root.meta, treeDir: dir } })
    relayout(editor, rootId, { reset: true })
  })
}

// ---------- Effets de bord ----------

/**
 * Supprimer un nœud (touche Suppr, menu) supprime aussi sa branche : ses descendants et leurs flèches.
 * Supprimer une boîte supprime ses détails.
 */
export function withBranchesToDelete(editor: Editor, ids: TLShapeId[]): TLShapeId[] {
  const { edge } = getTreeIndex(editor)
  const { details } = getDetailIndex(editor)
  const all = new Set(ids)
  for (const id of ids) {
    const own = edge.get(id)
    if (own) all.add(own)
    for (const d of branchOf(editor, id)) {
      all.add(d)
      const e = edge.get(d)
      if (e) all.add(e)
    }
  }
  // Les détails partent avec leur boîte.
  for (const id of [...all]) for (const d of details.get(id) ?? []) all.add(d)
  return [...all]
}

/**
 * - Déplacer un nœud à la souris entraîne sa branche et mémorise son décalage.
 * - Quand la taille d'un nœud change (texte, redimensionnement), l'arbre se réorganise.
 */
export function registerTreeSideEffects(editor: Editor) {
  const cleanups = [
    editor.sideEffects.registerAfterChangeHandler('shape', (prev, next) => {
      if (layingOut || prev.type === 'arrow') return
      // Le détail d'un nœud change de taille : l'arbre se réorganise.
      const box = getDetailIndex(editor).owner.get(next.id)
      if (box && isTreeNode(editor, box)) {
        if (prev.props !== next.props) queueRelayout(editor, box)
        return
      }
      if (!isTreeNode(editor, next.id)) return
      const dx = next.x - prev.x
      const dy = next.y - prev.y
      if ((dx || dy) && editor.isIn('select.translating')) {
        const selected = new Set(editor.getSelectedShapeIds())
        // Un ancêtre déplacé en même temps s'occupe de toute sa branche.
        if (hasAncestor(getTreeIndex(editor).parent, next.id, (a) => selected.has(a as TLShapeId))) return
        const moves: TLShapePartial[] = branchOf(editor, next.id)
          .filter((id) => !selected.has(id))
          .map((id) => editor.getShape(id)!)
          .filter(Boolean)
          .map((s) => ({ id: s.id, type: s.type, x: s.x + dx, y: s.y + dy }))
        layingOut = true
        try {
          editor.updateShapes(moves)
          // La racine est l'ancre de l'arbre : seuls les autres nœuds ont un décalage.
          if (getTreeIndex(editor).parent.has(next.id)) {
            const o = offsetOf(next)
            editor.updateShape({ id: next.id, type: next.type, meta: { ...next.meta, treeOffset: { x: o.x + dx, y: o.y + dy } } })
          }
        } finally {
          layingOut = false
        }
        return
      }
      // Texte ou taille modifiés : la réorganisation ne déplace rien si les tailles n'ont pas changé.
      if (prev.props !== next.props) queueRelayout(editor, next.id)
    }),
  ]
  return () => cleanups.forEach((c) => c())
}

// Réorganisation différée : la géométrie d'un nœud en cours d'édition change à chaque frappe.
const pending = new WeakMap<Editor, Set<TLShapeId>>()
function queueRelayout(editor: Editor, id: TLShapeId) {
  let set = pending.get(editor)
  if (!set) {
    set = new Set()
    pending.set(editor, set)
    queueMicrotask(() => {
      const ids = pending.get(editor)
      pending.delete(editor)
      const roots = new Set([...(ids ?? [])].filter((i) => editor.getShape(i)).map((i) => rootOf(editor, i)))
      editor.run(() => roots.forEach((r) => relayout(editor, r)))
    })
  }
  set.add(id)
}

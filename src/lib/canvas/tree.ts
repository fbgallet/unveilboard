// Arbres (cartes mentales) sur des formes tldraw ordinaires.
//
// Un arbre n'est qu'un ensemble de formes reliées par des flèches natives marquées
// `meta.branch` (début = parent, fin = enfant). Tout reste dans le format tldraw :
// sans ce module, le document s'affiche comme un schéma normal.
//
// meta d'une forme-nœud : folded (branche repliée), treeOffset (décalage manuel),
// treeDir (sur la racine : 'right' | 'left' | 'down' | 'up' | 'both'),
// treeSide (disposition « both », enfants de la racine : 'left' | 'right'),
// argument (sur la racine : arbre argumentatif, Tab propose une relation).

import {
  Box,
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
import { applyPresetTo, presetById } from './presets'
import type { Preset } from '../presets/presets'
import {
  TREE_DIRECTIONS,
  TREE_GAPS,
  descendantsOf,
  hasAncestor,
  layoutTree,
  lighterSide,
  treeAxis,
  type TreeDirection,
  type TreeNode,
  type TreeSide,
  type Vec,
} from '../tree/layout'

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
  const dir = editor.getShape(rootId)?.meta.treeDir as TreeDirection | undefined
  return dir && TREE_DIRECTIONS.includes(dir) ? dir : 'right'
}

/** Côté enregistré d'un enfant de la racine (disposition « both »), sinon déduit de sa position. */
function storedSide(editor: Editor, rootId: TLShapeId, childId: TLShapeId): TreeSide {
  const stored = editor.getShape(childId)?.meta.treeSide
  return stored === 'left' || stored === 'right' ? stored : positionSide(editor, rootId, childId)
}

function positionSide(editor: Editor, rootId: TLShapeId, childId: TLShapeId): TreeSide {
  const rb = editor.getShapePageBounds(rootId)
  const b = editor.getShapePageBounds(childId)
  return rb && b && b.midX < rb.midX ? 'left' : 'right'
}

/** Hauteur occupée par un nœud et toute sa branche. */
function branchHeight(editor: Editor, id: TLShapeId) {
  const boxes = [id, ...branchOf(editor, id)].map((n) => editor.getShapePageBounds(n)).filter((b) => !!b)
  return boxes.length ? Box.Common(boxes).h : 0
}

/** Disposition « both » : côté de chaque nœud, celui de la branche de la racine dont il descend. */
function sidesOf(editor: Editor, rootId: TLShapeId): Map<TLShapeId, TreeSide> {
  const sides = new Map<TLShapeId, TreeSide>()
  for (const c of getTreeIndex(editor).children.get(rootId) ?? []) {
    const side = storedSide(editor, rootId, c)
    for (const id of [c, ...branchOf(editor, c)]) sides.set(id, side)
  }
  return sides
}

/** Sens dans lequel s'ouvrent les enfants d'un nœud (en « both », celui de son côté). */
export function nodeDirection(editor: Editor, id: TLShapeId): Exclude<TreeDirection, 'both'> {
  const rootId = rootOf(editor, id)
  const dir = directionOf(editor, rootId)
  if (dir !== 'both') return dir
  return id === rootId ? 'right' : (sidesOf(editor, rootId).get(id) ?? 'right')
}

/** Recalcule la position des nœuds d'un arbre. `reset` efface les décalages manuels. */
export function relayout(editor: Editor, anyNodeId: TLShapeId, opts: { reset?: boolean } = {}) {
  const rootId = rootOf(editor, anyNodeId)
  const { children } = getTreeIndex(editor)
  const dir = directionOf(editor, rootId)
  const ids = [rootId, ...branchOf(editor, rootId)]
  // Ordre des enfants : celui de leur position actuelle, perpendiculairement à l'arbre.
  const crossCenter = (id: TLShapeId) => {
    const b = editor.getShapePageBounds(id)
    return b ? (treeAxis(dir).horizontal ? b.midY : b.midX) : 0
  }
  const nodes = new Map<string, TreeNode>()
  for (const id of ids) {
    const b = editor.getShapePageBounds(id)
    if (!b) continue
    nodes.set(id, {
      w: b.w,
      h: b.h,
      offset: opts.reset ? { x: 0, y: 0 } : offsetOf(editor.getShape(id)),
      children: [...(children.get(id) ?? [])].sort((a, b) => crossCenter(a) - crossCenter(b)),
    })
  }
  const sides = dir === 'both' ? sidesOf(editor, rootId) : undefined
  if (sides) {
    for (const c of children.get(rootId) ?? []) {
      const node = nodes.get(c)
      if (node) node.side = sides.get(c)
    }
  }
  const rootBounds = editor.getShapePageBounds(rootId)
  if (!rootBounds) return
  // Arbre argumentatif : niveaux plus espacés, pour les étiquettes des relations.
  const gaps = editor.getShape(rootId)?.meta.argument ? { main: 170, cross: 44 } : TREE_GAPS
  const positions = layoutTree(rootId, { x: rootBounds.x, y: rootBounds.y }, nodes, dir, gaps)

  const updates: TLShapePartial[] = []
  for (const [id, target] of positions) {
    const shape = editor.getShape(id as TLShapeId)
    const b = editor.getShapePageBounds(id as TLShapeId)
    if (!shape || !b) continue
    const dx = target.x - b.x
    const dy = target.y - b.y
    // meta est fusionné par updateShapes : on efface le décalage en le mettant à null.
    const meta = opts.reset && shape.meta.treeOffset ? { ...shape.meta, treeOffset: null } : undefined
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && !meta) continue
    updates.push({ id: shape.id, type: shape.type, x: shape.x + dx, y: shape.y + dy, ...(meta && { meta }) })
  }
  const bindings = edgeAnchors(editor, ids, (id) => (sides ? (sides.get(id) ?? 'right') : (dir as Exclude<TreeDirection, 'both'>)))
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
const ANCHORS = {
  right: { start: { x: 1, y: 0.5 }, end: { x: 0, y: 0.5 } },
  left: { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
  down: { start: { x: 0.5, y: 1 }, end: { x: 0.5, y: 0 } },
  up: { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
}

function edgeAnchors(editor: Editor, ids: TLShapeId[], dirOf: (id: TLShapeId) => Exclude<TreeDirection, 'both'>) {
  const { edge } = getTreeIndex(editor)
  return ids.flatMap((id) => {
    const arrow = edge.get(id)
    if (!arrow) return []
    return editor.getBindingsFromShape<TLArrowBinding>(arrow, 'arrow').flatMap((b) => {
      const a = ANCHORS[dirOf(id)][b.props.terminal]
      if (b.props.isPrecise && b.props.normalizedAnchor.x === a.x && b.props.normalizedAnchor.y === a.y) return []
      return [{ ...b, props: { ...b.props, normalizedAnchor: a, isPrecise: true } }]
    })
  })
}

// ---------- Création de nœuds ----------

const STYLE_KEYS = ['geo', 'color', 'labelColor', 'fill', 'dash', 'size', 'font', 'align', 'verticalAlign', 'w', 'h'] as const

/** Nouveau nœud relié à `parentId`, sur le modèle de `modelId`, placé près de `near`. */
function createNode(editor: Editor, parentId: TLShapeId, modelId: TLShapeId, near: Vec, side?: TreeSide): TLShapeId {
  const model = editor.getShape(modelId)
  const props: Record<string, unknown> = { richText: toRichText('') }
  if (model?.type === 'geo') for (const k of STYLE_KEYS) props[k] = model.props[k]
  else Object.assign(props, { geo: 'rectangle', w: 200, h: 60 })

  const id = createShapeId()
  const arrowId = createShapeId()
  editor.run(() => {
    const meta = { ...(model?.meta.preset ? { preset: model.meta.preset } : {}), ...(side && { treeSide: side }) }
    editor.createShape({ id, type: 'geo', x: near.x, y: near.y, props, meta })
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
  const b = editor.getShapePageBounds(id)!
  // Disposition « both » : un enfant de la racine va du côté le moins chargé.
  const rootId = rootOf(editor, id)
  const side =
    id === rootId && directionOf(editor, rootId) === 'both'
      ? lighterSide(kids.map((k) => ({ side: storedSide(editor, rootId, k), size: branchHeight(editor, k) })))
      : undefined
  // Placé après les enfants existants (du même côté) : l'ordre suit la position.
  const last = kids
    .filter((k) => !side || storedSide(editor, rootId, k) === side)
    .map((k) => editor.getShapePageBounds(k))
    .filter((k) => !!k)
    .sort((p, q) => q.maxY + q.maxX - (p.maxY + p.maxX))[0]
  const opensLeft = (side ?? nodeDirection(editor, id)) === 'left'
  const near = last ? { x: last.x + 1, y: last.y + 1 } : { x: opensLeft ? b.x - 72 - b.w : b.maxX + 72, y: b.y }
  return createNode(editor, id, kids[0] ?? id, near, side)
}

export const isArgumentTree = (editor: Editor, id: TLShapeId) => !!editor.getShape(rootOf(editor, id))?.meta.argument

export function setArgumentTree(editor: Editor, id: TLShapeId, on: boolean) {
  const rootId = rootOf(editor, id)
  const root = editor.getShape(rootId)
  if (!root) return
  editor.markHistoryStoppingPoint('arbre argumentatif')
  editor.run(() => {
    editor.updateShape({ id: rootId, type: root.type, meta: { ...root.meta, argument: on || null } })
    // Les nœuds déjà reliés par une relation prennent la couleur de leur fonction.
    if (on) {
      const { edge } = getTreeIndex(editor)
      for (const n of branchOf(editor, rootId)) {
        const arrow = editor.getShape(edge.get(n)!)
        if (arrow) colorByFunction(editor, arrow)
      }
    }
    relayout(editor, rootId)
  })
}

/** Relation posée sur une branche : le nœud relié est-il un enfant d'arbre argumentatif ? Sa relation. */
export function functionOf(editor: Editor, id: TLShapeId): Preset | undefined {
  const edgeId = getTreeIndex(editor).edge.get(id)
  if (!edgeId || !isArgumentTree(editor, id)) return undefined
  const relation = presetById(editor, editor.getShape(edgeId)?.meta.preset as string | undefined)
  return relation?.target === 'arrow' && relation.role ? relation : undefined
}

/**
 * Arbre argumentatif : le nœud relié prend la couleur de sa fonction (celle de la relation),
 * en trait et en fond pâle ; sa forme continue de dire sa nature.
 */
function colorByFunction(editor: Editor, arrow: TLShape) {
  const child = editor.getBindingsFromShape<TLArrowBinding>(arrow, 'arrow').find((b) => b.props.terminal === 'end')?.toId
  const shape = child && editor.getShape(child)
  const relation = shape && functionOf(editor, shape.id)
  const color = relation?.style.color
  if (!shape || !color || !('color' in shape.props)) return
  if (shape.props.color === color && (!('fill' in shape.props) || shape.props.fill === 'solid')) return
  editor.updateShape({ id: shape.id, type: shape.type, props: { color, ...('fill' in shape.props && { fill: 'solid' }) } } as TLShapePartial)
}

/**
 * Arbre argumentatif : ajoute un enfant relié par une relation (soutient, objecte…). La branche
 * prend le style et le sens de la relation, l'enfant la nature associée (Exemple pour « illustre »…).
 */
export function addChildWithRelation(editor: Editor, id: TLShapeId, relation: Preset | null) {
  const child = addChild(editor, id)
  if (!relation) return child
  // La nature d'abord (forme), puis la relation, qui donne sa couleur au nœud (effet de bord).
  const nature = presetById(editor, relation.childNature)
  const shape = editor.getShape(child)
  if (nature?.target === 'shape' && shape) applyPresetTo(editor, nature, [shape])
  const edge = getTreeIndex(editor).edge.get(child)
  const arrow = edge && editor.getShape(edge)
  if (arrow) applyPresetTo(editor, relation, [arrow])
  relayout(editor, child)
  return child
}

/** Entrée : ajoute un frère juste après le nœud. Sans parent, ne fait rien. */
export function addSibling(editor: Editor, id: TLShapeId) {
  const parentId = getTreeIndex(editor).parent.get(id)
  if (!parentId) return null
  editor.markHistoryStoppingPoint('ajouter un frère')
  const b = editor.getShapePageBounds(id)!
  const { edge } = getTreeIndex(editor)
  const side = editor.getShape(id)?.meta.treeSide as TreeSide | undefined
  const sibling = createNode(editor, parentId, id, { x: b.x + 1, y: b.y + 1 }, side)
  // Même relation que la branche du modèle (« une autre prémisse »).
  const relation = presetById(editor, editor.getShape(edge.get(id)!)?.meta.preset as string | undefined)
  const newEdge = getTreeIndex(editor).edge.get(sibling)
  const arrow = newEdge && editor.getShape(newEdge)
  if (relation?.target === 'arrow' && arrow) applyPresetTo(editor, relation, [arrow])
  return sibling
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
    // Passage à « both » : les branches se répartissent entre les deux côtés, dans leur ordre.
    if (dir === 'both') {
      const kids = [...(getTreeIndex(editor).children.get(rootId) ?? [])]
      const placed: { side: TreeSide; size: number }[] = []
      for (const k of kids.sort((a, b) => (editor.getShapePageBounds(a)?.midY ?? 0) - (editor.getShapePageBounds(b)?.midY ?? 0))) {
        const side = lighterSide(placed)
        placed.push({ side, size: branchHeight(editor, k) })
        const shape = editor.getShape(k)!
        editor.updateShape({ id: k, type: shape.type, meta: { ...shape.meta, treeSide: side } })
      }
    }
    relayout(editor, rootId, { reset: true })
  })
}

// ---------- Effets de bord ----------

/**
 * Supprimer un nœud (touche Suppr, menu) supprime aussi sa branche : ses descendants et leurs flèches.
 */
export function withBranchesToDelete(editor: Editor, ids: TLShapeId[]): TLShapeId[] {
  const { edge } = getTreeIndex(editor)
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
  return [...all]
}

/**
 * - Déplacer un nœud à la souris entraîne sa branche et mémorise son décalage.
 * - Quand la taille d'un nœud change (texte, redimensionnement), l'arbre se réorganise.
 */
export function registerTreeSideEffects(editor: Editor) {
  /** Arbres dont un nœud vient d'être déplacé à la souris. */
  const dragged = new Set<TLShapeId>()
  const onEvent = (info: { name: string }) => {
    if (info.name !== 'pointer_up' || !dragged.size) return
    const roots = [...dragged]
    dragged.clear()
    queueMicrotask(() => editor.run(() => roots.forEach((r) => editor.getShape(r) && afterDrag(editor, r))))
  }
  editor.on('event', onEvent)
  const cleanups = [
    () => void editor.off('event', onEvent),
    editor.sideEffects.registerAfterChangeHandler('shape', (prev, next) => {
      // Relation posée ou changée sur une branche : couleur de fonction du nœud relié.
      if (next.type === 'arrow' && next.meta.branch && next.meta.preset !== prev.meta.preset) colorByFunction(editor, next)
      if (layingOut || prev.type === 'arrow') return
      if (!isTreeNode(editor, next.id)) return
      const dx = next.x - prev.x
      const dy = next.y - prev.y
      if ((dx || dy) && editor.isIn('select.translating')) {
        const selected = new Set(editor.getSelectedShapeIds())
        // Un ancêtre déplacé en même temps s'occupe de toute sa branche.
        if (hasAncestor(getTreeIndex(editor).parent, next.id, (a) => selected.has(a as TLShapeId))) return
        dragged.add(rootOf(editor, next.id))
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

/**
 * Après un glissement : en disposition « both », une branche amenée de l'autre côté de la
 * racine change de côté (et perd son décalage) ; puis l'arbre se réorganise.
 */
function afterDrag(editor: Editor, rootId: TLShapeId) {
  if (directionOf(editor, rootId) === 'both') {
    for (const c of getTreeIndex(editor).children.get(rootId) ?? []) {
      const side = positionSide(editor, rootId, c)
      const shape = editor.getShape(c)
      if (shape && side !== storedSide(editor, rootId, c)) {
        editor.updateShape({ id: c, type: shape.type, meta: { ...shape.meta, treeSide: side, treeOffset: null } })
      }
    }
  }
  relayout(editor, rootId)
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

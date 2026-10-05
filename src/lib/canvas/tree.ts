// Arbres (cartes mentales) sur des formes tldraw ordinaires.
//
// Un arbre n'est qu'un ensemble de formes reliées par des flèches natives marquées
// `meta.branch` (début = parent, fin = enfant). Tout reste dans le format tldraw :
// sans ce module, le document s'affiche comme un schéma normal.
//
// meta d'une forme-nœud : folded (branche repliée), treeOffset (décalage manuel),
// treeDir (sur la racine : 'right' | 'left' | 'down' | 'up' | 'both'),
// treeSide (disposition « both », enfants de la racine : 'left' | 'right'),
// argument (sur la racine : arbre argumentatif, Tab propose une relation),
// treeEdges (sur la racine : 'elbow' | 'curve' ; par défaut, coudées pour une carte
// d'argument, courbes sinon).

import {
  Box,
  computed,
  createShapeId,
  getDisplayValues,
  renderHtmlFromRichTextForMeasurement,
  startEditingShapeWithRichText,
  toRichText,
  type Computed,
  type Editor,
  type TLArrowBinding,
  type TLShape,
  type TLShapeId,
  type TLRichText,
  type TLShapePartial,
} from 'tldraw'
import { applyPresetTo, presetById } from './presets'
import { LINKED, PREMISE, type Preset } from '../presets/presets'
import {
  TREE_DIRECTIONS,
  TREE_GAPS,
  branchBend,
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

/** Tracé des branches d'un arbre. */
export type TreeEdges = 'elbow' | 'curve'

/** Tracé des branches : celui choisi sur la racine, sinon coudé pour une carte d'argument, courbe pour une carte mentale. */
export function edgesOf(editor: Editor, rootId: TLShapeId): TreeEdges {
  const root = editor.getShape(rootId)
  const chosen = root?.meta.treeEdges
  return chosen === 'elbow' || chosen === 'curve' ? chosen : root?.meta.argument ? 'elbow' : 'curve'
}

export function setEdges(editor: Editor, id: TLShapeId, edges: TreeEdges) {
  const rootId = rootOf(editor, id)
  const root = editor.getShape(rootId)
  if (!root) return
  editor.markHistoryStoppingPoint('tracé des branches')
  editor.run(() => {
    editor.updateShape({ id: rootId, type: root.type, meta: { ...root.meta, treeEdges: edges } })
    relayout(editor, rootId)
  })
}

/**
 * Branches repliées pour la mise en page : celles du document (meta.folded), ou, pendant une
 * présentation, celles de l'étape en cours (src/components/usePresentation.ts).
 */
const foldSources = new WeakMap<Editor, (id: TLShapeId) => boolean>()

export function setFoldSource(editor: Editor, source: ((id: TLShapeId) => boolean) | null) {
  if (source) foldSources.set(editor, source)
  else foldSources.delete(editor)
}

const isCollapsed = (editor: Editor, id: TLShapeId) => (foldSources.get(editor) ?? ((n: TLShapeId) => isFolded(editor, n)))(id)

/** Racines des arbres de la page courante. */
export function treeRoots(editor: Editor): TLShapeId[] {
  const { parent, children } = getTreeIndex(editor)
  return [...children.keys()].filter((id) => !parent.has(id))
}

/**
 * Recalcule la position des nœuds d'un arbre. `reset` efface les décalages manuels ; `animate`
 * fait glisser les nœuds vers leur place (replier, déplier).
 */
export function relayout(editor: Editor, anyNodeId: TLShapeId, opts: { reset?: boolean; animate?: boolean } = {}) {
  // Un glissement en cours s'achève d'abord : le calcul part des places qu'il visait.
  slides.get(editor)?.()
  const rootId = rootOf(editor, anyNodeId)
  const { children, edge } = getTreeIndex(editor)
  const dir = directionOf(editor, rootId)
  const ids = [rootId, ...branchOf(editor, rootId)]
  // Ordre des enfants : celui de leur position actuelle, perpendiculairement à l'arbre.
  const crossCenter = (id: TLShapeId) => {
    const b = editor.getShapePageBounds(id)
    return b ? (treeAxis(dir).horizontal ? b.midY : b.midX) : 0
  }
  const horizontal = treeAxis(dir).horizontal
  const edges = edgesOf(editor, rootId)
  // Arbre argumentatif : niveaux plus espacés, pour les étiquettes des relations ; branches courbes :
  // un peu de longueur, pour que la courbe se lise.
  const gaps = editor.getShape(rootId)?.meta.argument
    ? { main: horizontal ? 220 : 170, cross: 44 }
    : edges === 'curve'
      ? { main: horizontal ? 110 : 90, cross: TREE_GAPS.cross }
      : TREE_GAPS
  const nodes = new Map<string, TreeNode>()
  for (const id of ids) {
    const b = editor.getShapePageBounds(id)
    if (!b) continue
    const kids = [...(children.get(id) ?? [])]
    nodes.set(id, {
      w: b.w,
      h: b.h,
      offset: opts.reset ? { x: 0, y: 0 } : offsetOf(editor.getShape(id)),
      children: kids.sort((a, b) => crossCenter(a) - crossCenter(b)),
      ...(kids.length && isCollapsed(editor, id) && { collapsed: true }),
      // Prémisses liées : serrées contre leur pastille (leurs traits n'ont pas d'étiquette) ; une
      // objection à l'inférence, elle, a une étiquette : il lui faut la place de l'écrire.
      ...(isLinked(editor, id)
        ? { gaps: onlyPremises(editor, id) ? LINKED_GAPS : { ...LINKED_GAPS, main: Math.max(150, labelRoom(editor, kids, horizontal)) } }
        : kids.length && { gaps: { ...gaps, main: Math.max(gaps.main, labelRoom(editor, kids, horizontal)) } }),
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
  const dirOf = (id: TLShapeId) => (sides ? (sides.get(id) ?? 'right') : (dir as Exclude<TreeDirection, 'both'>))
  // Tracé des branches, d'après la place finale des nœuds.
  const boxOf = (id: TLShapeId) => {
    const node = nodes.get(id)
    const at = id === rootId ? rootBounds : positions.get(id)
    return node && at ? { x: at.x, y: at.y, w: node.w, h: node.h } : undefined
  }
  const arrows: TLShapePartial[] = []
  const { parent } = getTreeIndex(editor)
  for (const id of ids) {
    const edgeId = edge.get(id)
    const arrow = edgeId && editor.getShape(edgeId)
    const from = boxOf(parent.get(id)!)
    const to = boxOf(id)
    if (arrow?.type !== 'arrow' || !from || !to) continue
    const a = ANCHORS[dirOf(id)]
    const point = (box: { x: number; y: number; w: number; h: number }, n: Vec) => ({ x: box.x + n.x * box.w, y: box.y + n.y * box.h })
    // Prémisses liées : traits droits et courts sous leur pastille, quel que soit le tracé de l'arbre.
    const kind = edges === 'curve' && !isLinked(editor, parent.get(id)!) ? 'arc' : 'elbow'
    const bend = kind === 'arc' ? Math.round(branchBend(point(from, a.start), point(to, a.end), treeAxis(dirOf(id)).horizontal)) : 0
    if (arrow.props.kind !== kind || Math.abs(arrow.props.bend - bend) >= 1) arrows.push({ id: arrow.id, type: 'arrow', props: { kind, bend } })
  }
  const bindings = edgeAnchors(editor, ids, dirOf)
  if (!updates.length && !arrows.length && !bindings.length) return
  writeLayout(editor, [...updates, ...arrows], bindings, opts.animate)
}

/**
 * Place à laisser entre un nœud et ses enfants pour que l'étiquette de leur branche (« soutient ·
 * par analogie ») tienne sur une ligne : tldraw la replie dès qu'elle dépasse la largeur de la
 * flèche, moins une marge.
 */
function labelRoom(editor: Editor, kids: TLShapeId[], horizontal: boolean): number {
  const { edge } = getTreeIndex(editor)
  let room = 0
  for (const c of kids) {
    const arrow = editor.getShape(edge.get(c)!)
    if (arrow?.type !== 'arrow' || !hasLabel(arrow.props.richText)) continue
    const util = editor.getShapeUtil('arrow') as unknown as Parameters<typeof getDisplayValues>[0]
    const dv = getDisplayValues(util, arrow) as unknown as {
      labelFontFamily: string
      labelFontSize: number
      labelLineHeight: number
      labelPadding: number
    }
    const scale = arrow.props.scale
    const size = editor.textMeasure.measureHtml(renderHtmlFromRichTextForMeasurement(editor, arrow.props.richText), {
      fontFamily: dv.labelFontFamily,
      fontSize: dv.labelFontSize * scale,
      lineHeight: dv.labelLineHeight,
      fontWeight: 'normal',
      fontStyle: 'normal',
      padding: '0px',
      maxWidth: null,
    })
    const w = size.w + dv.labelPadding * 2 * scale
    const h = size.h + dv.labelPadding * 2 * scale
    // À l'horizontale, la largeur de l'étiquette, plus la marge de tldraw et un peu d'air ; à la
    // verticale, sa hauteur, logée dans le dernier segment de la branche.
    room = Math.max(room, horizontal ? Math.min(w, 360) + 100 : 2 * h + 60)
  }
  return room
}

const hasLabel = (richText: TLRichText | undefined) =>
  !!richText?.content?.some((block) => (block as { content?: unknown[] }).content?.length)

/** Durée du glissement des nœuds (replier, déplier). */
const SLIDE_MS = 260
const slides = new WeakMap<Editor, () => void>()

/**
 * Écrit la mise en page. En présentation, le document est verrouillé : les positions, propres à
 * l'étape (branches repliées), s'écrivent sans passer par les commandes de l'éditeur ni par son
 * historique ; elles sont recalculées au retour en édition.
 */
function writeLayout(editor: Editor, partials: TLShapePartial[], bindings: TLArrowBinding[], animate?: boolean) {
  const locked = editor.getIsReadonly()
  const put = (shapes: TLShapePartial[], withBindings: boolean) => {
    layingOut = true
    try {
      if (!locked) {
        editor.updateShapes(shapes)
        if (withBindings) editor.updateBindings(bindings)
        return
      }
      editor.run(
        () => {
          const records = shapes.flatMap((p) => {
            const shape = editor.getShape(p.id)
            return shape ? [{ ...shape, ...p, props: { ...shape.props, ...p.props }, meta: { ...shape.meta, ...p.meta } } as TLShape] : []
          })
          editor.store.put(records)
          if (withBindings) editor.store.put(bindings)
        },
        { history: 'ignore' }
      )
    } finally {
      layingOut = false
    }
  }
  const moving = animate ? partials.filter((p) => p.x !== undefined || p.y !== undefined) : []
  if (!moving.length) return put(partials, true)
  // Glissement : les nœuds vont de leur place à la nouvelle ; les flèches suivent (liées), leur
  // courbure et le reste s'appliquent d'emblée.
  const start = new Map(moving.map((p) => [p.id, editor.getShape(p.id)!]))
  // Sans x ni y (et non x: undefined, que le document verrouillé de la présentation écrirait tel quel).
  put(
    partials.filter((p) => p.props || p.meta).map(({ id, type, props, meta }) => ({ id, type, ...(props && { props }), ...(meta && { meta }) }) as TLShapePartial),
    true
  )
  let elapsed = 0
  const ease = (t: number) => 1 - (1 - t) ** 3
  const frame = (t: number) =>
    moving.map((p) => {
      const s = start.get(p.id)!
      return { id: p.id, type: p.type, x: s.x + ((p.x ?? s.x) - s.x) * t, y: s.y + ((p.y ?? s.y) - s.y) * t } as TLShapePartial
    })
  const stop = () => {
    editor.off('tick', onTick)
    slides.delete(editor)
  }
  const onTick = (dt: number) => {
    elapsed += dt
    const t = Math.min(1, elapsed / SLIDE_MS)
    put(frame(ease(t)), false)
    if (t === 1) stop()
  }
  // Un nouveau calcul pendant le glissement : celui-ci s'achève d'un coup, l'autre repart de là.
  slides.set(editor, () => {
    put(frame(1), false)
    stop()
  })
  editor.on('tick', onTick)
}

/** Recalcule tous les arbres de la page courante. */
export function relayoutAll(editor: Editor, opts: { animate?: boolean } = {}) {
  editor.run(() => treeRoots(editor).forEach((r) => editor.getShape(r) && relayout(editor, r, opts)))
}

/** Écarts entre une pastille de prémisses liées et ses prémisses. */
const LINKED_GAPS = { main: 36, cross: 30 }

/** Les enfants de la pastille sont-ils tous des prémisses ? */
function onlyPremises(editor: Editor, id: TLShapeId) {
  const { children, edge } = getTreeIndex(editor)
  return (children.get(id) ?? []).every((c) => editor.getShape(edge.get(c)!)?.meta.preset === PREMISE)
}

/** Pastille de prémisses liées. */
export const isLinked = (editor: Editor, id: TLShapeId) => editor.getShape(id)?.meta.preset === LINKED

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

/** Relie un nœud à son parent par une flèche de branche (début = parent, fin = enfant). Renvoie la flèche. */
export function linkToParent(editor: Editor, parentId: TLShapeId, childId: TLShapeId): TLShapeId {
  const arrowId = createShapeId()
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
  editor.createBindings([binding('start', parentId), binding('end', childId)])
  return arrowId
}

/** Nouveau nœud relié à `parentId`, sur le modèle de `modelId`, placé près de `near`. */
function createNode(editor: Editor, parentId: TLShapeId, modelId: TLShapeId, near: Vec, side?: TreeSide): TLShapeId {
  // Une pastille de prémisses liées ne sert pas de modèle : le nouveau nœud serait un point.
  const model = isLinked(editor, modelId) ? undefined : editor.getShape(modelId)
  const props: Record<string, unknown> = { richText: toRichText('') }
  if (model?.type === 'geo') for (const k of STYLE_KEYS) props[k] = model.props[k]
  else Object.assign(props, { geo: 'rectangle', w: 200, h: 60 })

  const id = createShapeId()
  editor.run(() => {
    const meta = { ...(model?.meta.preset ? { preset: model.meta.preset } : {}), ...(side && { treeSide: side }) }
    editor.createShape({ id, type: 'geo', x: near.x, y: near.y, props, meta })
    linkToParent(editor, parentId, id)
    // Un parent replié se déplie pour montrer le nouveau nœud.
    const parent = editor.getShape(parentId)
    if (parent?.meta.folded) editor.updateShape({ id: parentId, type: parent.type, meta: { ...parent.meta, folded: false } })
    relayout(editor, parentId)
  })
  editor.select(id)
  startEditingShapeWithRichText(editor, id, { selectAll: true })
  return id
}

/** Place et côté d'un nouvel enfant de `id` : après les enfants existants (du même côté). */
export function newChildPlacement(editor: Editor, id: TLShapeId): { near: Vec; side?: TreeSide } {
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
  return { near, side }
}

/** Tab : ajoute un enfant (et fait de la forme la racine d'un arbre si besoin). */
export function addChild(editor: Editor, id: TLShapeId) {
  editor.markHistoryStoppingPoint('ajouter un enfant')
  const kids = getTreeIndex(editor).children.get(id) ?? []
  const { near, side } = newChildPlacement(editor, id)
  return createNode(editor, id, kids[0] ?? id, near, side)
}

export const isArgumentTree = (editor: Editor, id: TLShapeId) => !!editor.getShape(rootOf(editor, id))?.meta.argument

/** Racine d'une carte d'argument. */
export const isArgumentRoot = (editor: Editor, id: TLShapeId) => !!editor.getShape(id)?.meta.argument

/** Thèse à discuter : racine d'une carte d'argument de type Énoncé (ou sans type) ; une question reste une question. */
export function isThesisRoot(editor: Editor, id: TLShapeId) {
  const shape = editor.getShape(id)
  const type = shape?.meta.preset
  return !!shape?.meta.argument && (!type || type === 'statement')
}

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
 * Couleur de la fonction d'un nœud : celle de sa relation, sauf « répond à » sous une objection,
 * qui prend l'orange des réponses aux objections (sous une question, c'est une position : violet).
 */
export function functionColorOf(editor: Editor, id: TLShapeId): string | undefined {
  const relation = functionOf(editor, id)
  if (!relation) return undefined
  // Une prémisse liée a la fonction de sa pastille (verte si elle soutient, rouge si elle objecte…).
  if (relation.id === PREMISE) {
    const parent = getTreeIndex(editor).parent.get(id)
    return (parent && functionColorOf(editor, parent)) ?? relation.style.color
  }
  if (relation.id === 'answers') {
    const parent = getTreeIndex(editor).parent.get(id)
    if (parent && functionOf(editor, parent)?.id === 'objects') return 'orange'
  }
  return relation.style.color
}

/**
 * Carte d'argument : le nœud relié prend la couleur de sa fonction, en trait et en fond pâle
 * (sa flèche aussi) ; sa forme continue de dire son type.
 */
function colorByFunction(editor: Editor, arrow: TLShape) {
  const child = editor.getBindingsFromShape<TLArrowBinding>(arrow, 'arrow').find((b) => b.props.terminal === 'end')?.toId
  const shape = child && editor.getShape(child)
  const color = shape && functionColorOf(editor, shape.id)
  if (!shape || !color || !('color' in shape.props)) return
  if (arrow.type === 'arrow' && arrow.props.color !== color) {
    editor.updateShape({ id: arrow.id, type: 'arrow', props: { color: color as typeof arrow.props.color } })
  }
  // Fond pâle ; la pastille des prémisses liées, elle, est un point plein.
  const fill = isLinked(editor, shape.id) ? 'fill' : 'solid'
  if (shape.props.color !== color || ('fill' in shape.props && shape.props.fill !== fill)) {
    editor.updateShape({ id: shape.id, type: shape.type, props: { color, ...('fill' in shape.props && { fill }) } } as TLShapePartial)
  }
  // Pastille de prémisses liées : ses prémisses suivent sa fonction.
  if (isLinked(editor, shape.id)) {
    const { children, edge } = getTreeIndex(editor)
    for (const c of children.get(shape.id) ?? []) {
      const e = editor.getShape(edge.get(c)!)
      if (e) colorByFunction(editor, e)
    }
  }
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

/** Relations dont le nœud relié peut former, avec d'autres, des prémisses liées (des raisons, pas des exemples ou des concepts). */
const LINKABLE = new Set(['supports', 'objects', 'refutes', 'answers', 'explains', PREMISE])

/** Peut-on lier une prémisse à ce nœud ? Un nœud relié par une relation de raisonnement, dans une carte d'argument. */
export function canLinkPremise(editor: Editor, id: TLShapeId) {
  if (isLinked(editor, id)) return false
  const relation = functionOf(editor, id)
  return !!relation && LINKABLE.has(relation.id)
}

/** Pastille de prémisses liées : ajoute une prémisse (Entrée, ou « + Prémisse »). */
export function addPremise(editor: Editor, junction: TLShapeId) {
  const premise = presetById(editor, PREMISE)
  return premise ? addChildWithRelation(editor, junction, premise) : null
}

/**
 * Prémisses liées : ajoute une prémisse qui ne vaut qu'avec celle-ci. Sous une pastille, c'est une
 * prémisse de plus ; sinon, une pastille prend la place du nœud (avec sa relation : soutient,
 * objecte…) et porte désormais le nœud et la nouvelle prémisse. Renvoie la nouvelle prémisse.
 */
export function addLinkedPremise(editor: Editor, id: TLShapeId): TLShapeId | null {
  const { parent, edge } = getTreeIndex(editor)
  const parentId = parent.get(id)
  if (!parentId) return null
  if (isLinked(editor, parentId)) return addSibling(editor, id)
  const linked = presetById(editor, LINKED)
  const premise = presetById(editor, PREMISE)
  const relation = presetById(editor, editor.getShape(edge.get(id)!)?.meta.preset as string | undefined)
  if (!linked || !premise) return null
  editor.markHistoryStoppingPoint('prémisses liées')
  const b = editor.getShapePageBounds(id)!
  const junction = createShapeId()
  editor.run(() => {
    const side = editor.getShape(id)?.meta.treeSide
    editor.createShape({ id: junction, type: 'geo', x: b.x, y: b.midY, props: { richText: toRichText('') }, meta: side ? { treeSide: side } : {} })
    applyPresetTo(editor, linked, [editor.getShape(junction)!])
    // La pastille reprend la branche du nœud (sa relation et sa fonction) ; le nœud devient prémisse.
    const oldEdge = editor.getShape(edge.get(id)!)
    const junctionEdge = linkToParent(editor, parentId, junction)
    // Son texte (« soutient · par analogie ») qualifie l'inférence : il passe à la pastille.
    if (oldEdge?.type === 'arrow') {
      editor.updateShape({ id: junctionEdge, type: 'arrow', props: { richText: oldEdge.props.richText }, meta: { reasoning: oldEdge.meta.reasoning ?? null } })
    }
    if (relation?.target === 'arrow') applyPresetTo(editor, relation, [editor.getShape(junctionEdge)!])
    if (oldEdge) {
      const start = editor.getBindingsFromShape<TLArrowBinding>(oldEdge, 'arrow').find((b) => b.props.terminal === 'start')
      if (start) editor.updateBinding({ ...start, toId: junction })
      editor.updateShape({ id: oldEdge.id, type: 'arrow', props: { richText: toRichText('') }, meta: { reasoning: null } })
      applyPresetTo(editor, premise, [editor.getShape(oldEdge.id)!])
    }
    const shape = editor.getShape(id)
    if (shape?.meta.treeOffset) editor.updateShape({ id, type: shape.type, meta: { ...shape.meta, treeOffset: null } })
  })
  return addSibling(editor, id)
}

/**
 * Replier une branche, ou la déplier tout entière : les sous-branches repliées s'ouvrent aussi,
 * pour que la pastille « +n » montre bien n nœuds.
 */
export function toggleFold(editor: Editor, id: TLShapeId) {
  const shape = editor.getShape(id)
  if (!shape) return
  editor.markHistoryStoppingPoint('replier')
  const folded = !shape.meta.folded
  editor.run(() => {
    if (folded) {
      editor.updateShape({ id, type: shape.type, meta: { ...shape.meta, folded } })
      const hidden = new Set(branchOf(editor, id))
      editor.setSelectedShapes(editor.getSelectedShapeIds().filter((s) => !hidden.has(s)))
    } else {
      setFolded(editor, new Map([id, ...branchOf(editor, id)].map((n) => [n, false])))
    }
    // Les voisins se resserrent autour de la branche repliée, ou s'écartent pour la déplier.
    relayout(editor, id, { animate: true })
  })
}

/** Profondeur de chaque nœud d'un arbre (racine : 0). */
export function treeDepths(editor: Editor, rootId: TLShapeId): Map<TLShapeId, number> {
  const { children } = getTreeIndex(editor)
  const depths = new Map<TLShapeId, number>([[rootId, 0]])
  const queue = [rootId]
  while (queue.length) {
    const id = queue.shift()!
    for (const c of children.get(id) ?? []) {
      if (depths.has(c)) continue
      depths.set(c, depths.get(id)! + 1)
      queue.push(c)
    }
  }
  return depths
}

/**
 * Repli voulu de chaque nœud à branches pour n'afficher que les `level` premiers niveaux sous
 * la racine (1 : la racine et ses enfants) ; null : tout déplié.
 */
export function foldsForLevel(editor: Editor, rootId: TLShapeId, level: number | null): Map<TLShapeId, boolean> {
  const { children } = getTreeIndex(editor)
  const folds = new Map<TLShapeId, boolean>()
  for (const [id, depth] of treeDepths(editor, rootId)) {
    if (children.get(id)?.length) folds.set(id, level !== null && depth >= level)
  }
  return folds
}

/** Niveau de repli actuel d'un arbre (null : tout déplié), ou undefined s'il n'est pas uniforme. */
export function foldLevelOf(editor: Editor, rootId: TLShapeId, isFoldedNode = (id: TLShapeId) => isFolded(editor, id)) {
  const depths = treeDepths(editor, rootId)
  const max = Math.max(0, ...depths.values())
  for (const level of [null, ...Array.from({ length: max }, (_, i) => i)]) {
    // Un nœud sous un nœud replié ne compte pas : il est caché de toute façon.
    const folds = foldsForLevel(editor, rootId, level)
    if ([...folds].every(([id, f]) => (level !== null && depths.get(id)! > level) || isFoldedNode(id) === f)) return level
  }
  return undefined
}

/** Replie un arbre à un niveau (null : déplie tout). */
export function foldToLevel(editor: Editor, rootId: TLShapeId, level: number | null) {
  editor.markHistoryStoppingPoint('replier au niveau')
  editor.run(() => {
    setFolded(editor, foldsForLevel(editor, rootId, level))
    const depths = treeDepths(editor, rootId)
    if (level !== null) editor.setSelectedShapes(editor.getSelectedShapeIds().filter((s) => (depths.get(s) ?? 0) <= level))
    relayout(editor, rootId, { animate: true })
  })
}

function setFolded(editor: Editor, folds: Map<TLShapeId, boolean>) {
  const updates: TLShapePartial[] = []
  for (const [id, folded] of folds) {
    const shape = editor.getShape(id)
    if (shape && !!shape.meta.folded !== folded) updates.push({ id, type: shape.type, meta: { ...shape.meta, folded } })
  }
  if (updates.length) editor.updateShapes(updates)
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
      // Nœud relié d'une carte d'argument dont on change le type : il garde la couleur de sa fonction.
      if (next.type !== 'arrow' && next.meta.preset !== prev.meta.preset) {
        const edgeId = getTreeIndex(editor).edge.get(next.id)
        const arrow = edgeId && editor.getShape(edgeId)
        if (arrow) colorByFunction(editor, arrow)
      }
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

// ---------- Dévoiler une carte d'argument ----------

/**
 * Éléments d'une carte d'argument dans l'ordre où les dévoiler : la racine, puis chaque branche
 * en profondeur (un argument, ses objections, leurs réponses…), les frères dans leur ordre
 * d'affichage. Chaque élément vient avec la flèche qui le relie à son parent.
 */
export function revealOrder(editor: Editor, anyNodeId: TLShapeId): { node: TLShapeId; edge?: TLShapeId }[] {
  const rootId = rootOf(editor, anyNodeId)
  const { children, edge } = getTreeIndex(editor)
  const horizontal = treeAxis(directionOf(editor, rootId)).horizontal
  const cross = (id: TLShapeId) => {
    const b = editor.getShapePageBounds(id)
    return b ? (horizontal ? b.midY : b.midX) : 0
  }
  const out: { node: TLShapeId; edge?: TLShapeId }[] = []
  const seen = new Set<TLShapeId>()
  const visit = (id: TLShapeId) => {
    if (seen.has(id)) return
    seen.add(id)
    out.push({ node: id, edge: edge.get(id) })
    // Les suggestions de l'IA en attente ne sont pas dévoilées.
    const kids = [...(children.get(id) ?? [])].filter((c) => !editor.getShape(c)?.meta.suggestion)
    for (const c of kids.sort((a, b) => cross(a) - cross(b))) visit(c)
  }
  visit(rootId)
  return out
}

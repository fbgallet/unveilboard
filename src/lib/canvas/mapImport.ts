// Import d'un schéma au format « unveilboard/map » (src/lib/map/format.ts) dans l'éditeur, avec les
// mêmes fonctions que l'interface : types et relations (préréglages), fonctions en couleur, type de
// raisonnement, puis mise en page automatique des arbres. Le schéma doit avoir été contrôlé
// (parseMap) : les références inconnues sont ignorées.

import { createShapeId, toRichText, type Editor, type TLRichText, type TLShapeId } from 'tldraw'
import { markdownToRichText } from '../map/markdown'
import { clientLocale, m } from '@/i18n/client'
import { isLocale, type Locale } from '@/i18n/config'
import type { KnownVocabulary } from '../map/check'
import type { MapElement, MapLink, MapVocabulary, UnveilMap } from '../map/format'
import { toEngineSteps, type RefShapes } from '../map/sequence'
import type { Preset } from '../presets/presets'
import { SEQUENCE_VERSION, newId, type Sequence } from '../sequence/types'
import { lighterSide, treeAxis, type TreeSide, type Vec } from '../tree/layout'
import { applyPresetTo, documentPresets, presetById, presetSettingsAtom, setReasoning } from './presets'
import { branchOf, linkToParent, relayout, setArgumentTree } from './tree'

/** Taille des boîtes créées (celle des nœuds d'arbre de l'éditeur) ; la hauteur grandit avec le texte. */
const NODE = { w: 300, h: 150 }
/** Écart entre deux arbres (ou boîtes isolées) posés côte à côte. */
const TREE_GAP = 200

export interface MapImport {
  /** Formes créées pour chaque identifiant du schéma. */
  shapes: Map<string, RefShapes>
  sequence: Sequence
}

/** Types et relations connus : préréglages communs et copies du document. */
export function knownVocabulary(editor?: Editor): KnownVocabulary {
  const all = [...presetSettingsAtom.get().items, ...(editor ? Object.values(documentPresets(editor)) : [])]
  return {
    types: all.filter((p) => p.target === 'shape').map((p) => p.id),
    relations: all.filter((p) => p.target === 'arrow').map((p) => p.id),
  }
}

/** Crée les formes du schéma sur la page courante, à partir de `at`, et renvoie sa séquence (non enregistrée). */
export function importMap(editor: Editor, map: UnveilMap, opts: { at?: Vec; unverified?: string[] } = {}): MapImport {
  const presetOf = presetResolver(editor, map.vocabulary)
  const lang = contentLocale(map.lang)
  const shapes = new Map<string, RefShapes>()
  const ids = new Map<string, TLShapeId>()
  const byId = new Map(map.elements.map((e) => [e.id, e]))
  const childrenOf = new Map<string, MapElement[]>()
  for (const e of map.elements) {
    if (e.parent && byId.has(e.parent)) childrenOf.set(e.parent, [...(childrenOf.get(e.parent) ?? []), e])
  }
  const roots = map.elements.filter((e) => !e.parent || !byId.has(e.parent))

  const unverified = new Set(opts.unverified)
  const createBox = (e: MapElement, at: Vec, extraMeta: Record<string, unknown> = {}) => {
    // Extrait (ou citation) introuvable dans la source : signalé à l'utilisateur.
    const id = createElementBox(editor, e, at, { ...extraMeta, ...(unverified.has(e.id) && { excerptUnverified: true }) })
    ids.set(e.id, id)
    return id
  }

  // Un arbre (ou une boîte isolée) après l'autre, de gauche à droite.
  let origin = opts.at ?? { x: 0, y: 0 }
  for (const root of roots) {
    const dir = root.tree?.direction ?? 'right'
    const { horizontal, sign } = treeAxis(dir)
    const rootId = createBox(root, origin, { ...(dir !== 'right' && { treeDir: dir }) })
    applyType(editor, rootId, presetOf(root.type, 'shape'))
    shapes.set(root.id, { kind: 'element', node: rootId })

    // Place de départ : la profondeur le long de l'arbre, l'ordre de visite en travers (la mise en
    // page range les frères d'après leur position).
    let rank = 0
    const placed: { side: TreeSide; size: number }[] = []
    const visit = (parent: MapElement, depth: number) => {
      for (const child of childrenOf.get(parent.id) ?? []) {
        if (ids.has(child.id)) continue
        rank++
        const main = sign * depth * (horizontal ? 400 : 250)
        const at = horizontal ? { x: origin.x + main, y: origin.y + rank * 160 } : { x: origin.x + rank * 340, y: origin.y + main }
        let side: TreeSide | undefined
        if (dir === 'both' && parent === root) {
          side = child.side ?? lighterSide(placed)
          placed.push({ side, size: 1 })
        }
        const id = createBox(child, at, side ? { treeSide: side } : {})
        const edge = attachToParent(editor, ids.get(parent.id)!, id, child, presetOf, lang)
        shapes.set(child.id, { kind: 'element', node: id, edge })
        visit(child, depth + 1)
      }
    }
    visit(root, 1)

    if (root.tree?.kind === 'argument') setArgumentTree(editor, rootId, true)
    if (childrenOf.has(root.id)) relayout(editor, rootId, { reset: true })
    // Arbre ouvert vers la gauche (ou des deux côtés) : il se décale pour ne pas chevaucher le précédent.
    const nodes = [rootId, ...branchOf(editor, rootId)]
    const boxes = nodes.map((id) => editor.getShapePageBounds(id)).filter((b) => !!b)
    const dx = origin.x - Math.min(...boxes.map((b) => b.minX))
    if (dx > 0.5) editor.updateShapes(nodes.map((id) => editor.getShape(id)!).map((s) => ({ id: s.id, type: s.type, x: s.x + dx })))
    origin = { x: Math.max(...boxes.map((b) => b.maxX)) + Math.max(dx, 0) + TREE_GAP, y: origin.y }
  }

  // Liens transversaux : flèches ordinaires entre deux éléments, lues « from RELATION to ».
  for (const link of map.links ?? []) {
    const from = ids.get(link.from)
    const to = ids.get(link.to)
    if (!from || !to) continue
    const id = createLink(editor, link, from, to, presetOf, lang)
    shapes.set(link.id, { kind: 'link', node: id })
  }

  const steps = toEngineSteps(map.sequence?.steps ?? [], (ref) => shapes.get(ref), () => newId('st'))
  const sequence: Sequence = {
    version: SEQUENCE_VERSION,
    id: newId('seq'),
    title: map.title ?? m().sequence.defaultTitle,
    ...(map.sequence?.narrationScale && { narrationScale: map.sequence.narrationScale }),
    steps,
  }
  return { shapes, sequence }
}

/** Langue de l'interface correspondant à la langue d'un contenu (« fr-FR » → fr), sinon celle de l'interface. */
export function contentLocale(lang: string | undefined): Locale {
  const base = lang?.toLowerCase().split('-')[0]
  return isLocale(base) ? base : clientLocale()
}

export type PresetOf = (id: string | undefined, target: Preset['target']) => Preset | undefined

/** Boîte d'un élément (texte, source, modalité, note, provenance), sans type ni relation. */
export function createElementBox(editor: Editor, e: MapElement, at: Vec, extraMeta: Record<string, unknown> = {}): TLShapeId {
  const id = createShapeId()
  const meta = {
    ref: e.id,
    ...(e.source && { author: e.source }),
    ...(e.modality && { modality: e.modality }),
    ...(e.note && { note: e.note }),
    ...(e.folded && { folded: true }),
    ...(e.origin && { origin: e.origin }),
    ...(e.excerpt && { excerpt: e.excerpt }),
    ...extraMeta,
  }
  editor.createShape({
    id,
    type: 'geo',
    x: at.x,
    y: at.y,
    props: { geo: 'rectangle', ...NODE, richText: markdownToRichText(e.text) as TLRichText, font: 'sans', size: 'm' },
    meta,
  })
  return id
}

/**
 * Relie une boîte à son parent : flèche de branche, puis le type (forme) et la relation (sens de
 * la flèche, fonction), dans cet ordre, comme dans l'éditeur. Renvoie la flèche.
 */
export function attachToParent(
  editor: Editor,
  parentId: TLShapeId,
  id: TLShapeId,
  e: Pick<MapElement, 'type' | 'relation' | 'reasoning'>,
  presetOf: PresetOf,
  /** Langue du contenu : celle de l'étiquette de la relation. */
  lang?: Locale
): TLShapeId {
  const edge = linkToParent(editor, parentId, id)
  const relation = presetOf(e.relation, 'arrow')
  applyType(editor, id, presetOf(e.type ?? relation?.childNature, 'shape'))
  if (relation) applyPresetTo(editor, relation, [editor.getShape(edge)!], { lang })
  if (relation && e.reasoning) setReasoning(editor, edge, e.reasoning, { lang })
  return edge
}

/** Lien transversal : flèche ordinaire entre deux éléments, lue « from RELATION to ». */
export function createLink(editor: Editor, link: MapLink, from: TLShapeId, to: TLShapeId, presetOf: PresetOf, lang?: Locale): TLShapeId {
  const id = createShapeId()
  editor.createShape({ id, type: 'arrow', props: { richText: toRichText(link.label ?? '') }, meta: { ref: link.id } })
  const binding = (terminal: 'start' | 'end', toId: TLShapeId) => ({
    type: 'arrow' as const,
    fromId: id,
    toId,
    props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' as const },
  })
  editor.createBindings([binding('start', from), binding('end', to)])
  const relation = presetOf(link.relation, 'arrow')
  if (relation) applyPresetTo(editor, relation, [editor.getShape(id)!], { lang })
  if (relation && link.reasoning) setReasoning(editor, id, link.reasoning, { lang })
  return id
}

export function applyType(editor: Editor, id: TLShapeId, preset: Preset | undefined) {
  if (preset) applyPresetTo(editor, preset, [editor.getShape(id)!])
}

/**
 * Préréglage d'un identifiant du schéma : celui de l'instance (communs, copie du document), sinon
 * celui que décrit le vocabulaire du schéma (préréglage créé ailleurs, repris avec son style).
 */
export function presetResolver(editor: Editor, entries: MapVocabulary[] | undefined): PresetOf {
  const vocabulary = new Map((entries ?? []).map((v) => [v.id, v]))
  return (id, target) => {
    if (!id) return undefined
    const own = presetById(editor, id)
    if (own) return own.target === target ? own : undefined
    const v = vocabulary.get(id)
    if (!v || (v.kind === 'type') !== (target === 'shape')) return undefined
    return {
      id: v.id,
      name: v.name,
      target,
      style: v.style ?? {},
      ...(v.description && { description: v.description }),
      ...(target === 'arrow' && {
        label: v.name,
        ...(v.direction === 'toChild' && { towardChild: true }),
        ...(v.childType && { childNature: v.childType }),
        ...(v.function && { role: v.function }),
      }),
    }
  }
}

/**
 * Crée le schéma dans un document neuf, hors historique (il ne doit pas se défaire avec Ctrl+Z),
 * et renvoie sa séquence, à enregistrer dans le document.
 */
export function seedMap(editor: Editor, map: UnveilMap, opts: { unverified?: string[] } = {}): Sequence {
  let sequence: Sequence | undefined
  editor.run(
    () => {
      sequence = importMap(editor, map, opts).sequence
      // Langue du contenu, gardée dans le document (étiquettes des relations ajoutées ensuite).
      if (map.lang) editor.updateDocumentSettings({ meta: { ...editor.getDocumentSettings().meta, lang: map.lang } })
      editor.setEditingShape(null)
      editor.selectNone()
    },
    { history: 'ignore' }
  )
  // Les fonctions d'arbre et de préréglage posent des points d'historique.
  editor.clearHistory()
  return sequence!
}

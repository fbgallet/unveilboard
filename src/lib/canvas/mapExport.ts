// Export d'un schéma tldraw au format « unveilboard/map » (src/lib/map/format.ts) : la page
// courante, lue à travers les marques de l'app (meta.preset, meta.branch, meta.author…).
// Les formes y reçoivent des identifiants courts ; la table de correspondance est renvoyée
// avec le schéma, pour appliquer ensuite des modifications désignées par ces identifiants.

import { renderPlaintextFromRichText, type Editor, type TLArrowBinding, type TLRichText, type TLShape, type TLShapeId } from 'tldraw'
import { m } from '@/i18n/client'
import { richTextToMarkdown, type RichNode } from '../map/markdown'
import { MAP_FORMAT, MAP_VERSION, TASK_STATES, type MapElement, type MapLink, type MapOther, type MapVocabulary, type TaskState, type UnveilMap } from '../map/format'
import { fromEngineSteps, type RefShapes, type ShapeOwner } from '../map/sequence'
import { defaultPresets, MODALITIES, REASONINGS, type Modality, type Preset, type Reasoning } from '../presets/presets'
import { treeAxis } from '../tree/layout'
import { readSequence } from './adapter'
import { presetById } from './presets'
import { directionOf, functionOf, getTreeIndex } from './tree'
import { ownStyle } from './elementStyle'
import { documentRelationLabels } from './relationLabels'

export interface MapExport {
  map: UnveilMap
  /** Formes désignées par chaque identifiant du schéma. */
  shapes: Map<string, RefShapes>
}

const DEFAULT_IDS = new Set(defaultPresets({}).map((p) => p.id))

export function textOf(editor: Editor, shape: TLShape): string {
  const richText = (shape.props as { richText?: TLRichText }).richText
  return richText ? renderPlaintextFromRichText(editor, richText).trim() : ''
}

/** Texte d'une forme en Markdown (sa mise en forme comprise). */
function markdownOf(shape: TLShape): string {
  return richTextToMarkdown((shape.props as { richText?: TLRichText }).richText as RichNode | undefined)
}

export function exportMap(editor: Editor): MapExport {
  const { parent, children, edge } = getTreeIndex(editor)
  // Les suggestions de l'IA en attente ne font pas partie du schéma.
  const pageShapes = editor.getCurrentPageShapes().filter((s) => !s.meta.suggestion)
  const pending = (id: TLShapeId) => !!editor.getShape(id)?.meta.suggestion
  const bounds = (id: TLShapeId) => editor.getShapePageBounds(id)

  // Éléments : les nœuds d'arbre et les boîtes (formes géométriques).
  const isElement = (s: TLShape) => s.type === 'geo' || parent.has(s.id) || children.has(s.id)
  const elementShapes = pageShapes.filter(isElement)
  const edgeIds = new Set(edge.values())

  // Ordre : chaque arbre en profondeur (les enfants dans leur ordre d'affichage), les arbres et
  // boîtes isolées de haut en bas, puis de gauche à droite.
  const topLeft = (a: TLShape, b: TLShape) => {
    const p = bounds(a.id)
    const q = bounds(b.id)
    return p && q ? p.y - q.y || p.x - q.x : 0
  }
  const ordered: TLShapeId[] = []
  const seen = new Set<TLShapeId>()
  const visit = (id: TLShapeId, horizontal: boolean) => {
    if (seen.has(id)) return
    seen.add(id)
    ordered.push(id)
    const cross = (c: TLShapeId) => {
      const b = bounds(c)
      return b ? (horizontal ? b.midY : b.midX) : 0
    }
    for (const c of [...(children.get(id) ?? [])].filter((c) => !pending(c)).sort((a, b) => cross(a) - cross(b))) visit(c, horizontal)
  }
  for (const root of elementShapes.filter((s) => !parent.has(s.id)).sort(topLeft)) {
    visit(root.id, treeAxis(directionOf(editor, root.id)).horizontal)
  }

  // Identifiants courts et stables : celui que la forme a reçu à l'import (meta.ref), sinon un
  // identifiant tiré de celui de tldraw. Une IA peut ainsi désigner un élément d'un échange à l'autre.
  const refOf = new Map<TLShapeId, string>()
  const kindOf = new Map<string, RefShapes['kind']>()
  const name = (id: TLShapeId, prefix: string, kind: RefShapes['kind']) => {
    const ref = stableRef(editor.getShape(id)?.meta.ref, id, prefix, kindOf)
    refOf.set(id, ref)
    kindOf.set(ref, kind)
    return ref
  }
  ordered.forEach((id) => name(id, 'n', 'element'))

  const usedPresets = new Map<string, Preset>()
  const presetOf = (shape: TLShape | undefined, target: Preset['target']) => {
    const preset = presetById(editor, shape?.meta.preset as string | undefined)
    if (preset?.target !== target) return undefined
    usedPresets.set(preset.id, preset)
    return preset
  }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)

  const elements: MapElement[] = ordered.map((id) => {
    const shape = editor.getShape(id)!
    const p = parent.get(id)
    const arrow = p ? editor.getShape(edge.get(id)!) : undefined
    const relation = presetOf(arrow, 'arrow')
    const reasoning = arrow?.meta.reasoning as Reasoning | undefined
    const modality = shape.meta.modality as Modality | undefined
    const origin = shape.meta.origin
    const isRoot = !p && children.has(id)
    const dir = isRoot ? directionOf(editor, id) : undefined
    const side = shape.meta.treeSide
    const role = functionOf(editor, id)?.role
    const task = shape.meta.task as TaskState | undefined
    const style = ownStyle(editor, shape)
    return {
      id: refOf.get(id)!,
      // Texte des boîtes : leur mise en forme (gras, italique, listes…) en Markdown.
      text: markdownOf(shape),
      ...(presetOf(shape, 'shape') && { type: shape.meta.preset as string }),
      ...(p && { parent: refOf.get(p)! }),
      ...(relation && { relation: relation.id }),
      ...(relation && reasoning && REASONINGS.includes(reasoning) && { reasoning }),
      ...(p && !parent.has(p) && directionOf(editor, p) === 'both' && (side === 'left' || side === 'right') && { side }),
      ...(str(shape.meta.author) && { source: shape.meta.author as string }),
      ...(modality && MODALITIES.includes(modality) && { modality }),
      ...(str(shape.meta.note) && { note: shape.meta.note as string }),
      ...(shape.meta.folded === true && children.has(id) && { folded: true }),
      ...(task && TASK_STATES.includes(task) && { task }),
      ...(style && { style }),
      ...((origin === 'text' || origin === 'reconstruction') && { origin }),
      ...(str(shape.meta.excerpt) && { excerpt: shape.meta.excerpt as string }),
      ...(role && { function: role }),
      ...((isRoot || shape.meta.argument) && {
        tree: { kind: shape.meta.argument ? 'argument' : 'mindmap', ...(dir && dir !== 'right' && { direction: dir }) },
      }),
    } satisfies MapElement
  })

  // Liens : flèches hors des arbres, entre deux éléments ; les autres formes, pour le contexte.
  const links: MapLink[] = []
  const others: MapOther[] = []
  for (const shape of pageShapes) {
    if (refOf.has(shape.id) || edgeIds.has(shape.id)) continue
    if (shape.type === 'arrow') {
      const bindings = editor.getBindingsFromShape<TLArrowBinding>(shape, 'arrow')
      const from = refOf.get(bindings.find((b) => b.props.terminal === 'start')?.toId as TLShapeId)
      const to = refOf.get(bindings.find((b) => b.props.terminal === 'end')?.toId as TLShapeId)
      if (from && to) {
        const relation = presetOf(shape, 'arrow')
        const reasoning = shape.meta.reasoning as Reasoning | undefined
        const label = textOf(editor, shape)
        links.push({
          id: name(shape.id, 'l', 'link'),
          from,
          to,
          ...(relation && { relation: relation.id }),
          ...(relation && reasoning && REASONINGS.includes(reasoning) && { reasoning }),
          ...(!relation && label && { label }),
        })
        continue
      }
    }
    const text = textOf(editor, shape)
    others.push({ id: name(shape.id, 'x', 'other'), kind: shape.type, ...(text && { text }) })
  }

  // Formes de chaque identifiant, et propriétaire de chaque forme (pour la séquence).
  const shapes = new Map<string, RefShapes>()
  const owners = new Map<string, ShapeOwner>()
  for (const [shapeId, ref] of refOf) {
    const kind = kindOf.get(ref)!
    const e = kind === 'element' ? edge.get(shapeId) : undefined
    shapes.set(ref, { kind, node: shapeId, ...(e && { edge: e }) })
    owners.set(shapeId, { ref, part: 'node' })
    if (e) owners.set(e, { ref, part: 'edge' })
  }

  const seq = readSequence(editor)
  const labels = documentRelationLabels(editor)
  const map: UnveilMap = {
    format: MAP_FORMAT,
    version: MAP_VERSION,
    ...(seq?.title && { title: seq.title }),
    // Langue du contenu, si le document la connaît (schéma importé ou généré).
    ...(typeof editor.getDocumentSettings().meta.lang === 'string' && { lang: editor.getDocumentSettings().meta.lang as string }),
    vocabulary: [...usedPresets.values()].map((p) => vocabularyEntry(p, labels[p.id])),
    elements,
    ...(links.length && { links }),
    ...(others.length && { others }),
    ...(seq && {
      sequence: {
        ...(seq.narrationScale && seq.narrationScale !== 100 && { narrationScale: seq.narrationScale }),
        ...(seq.intro && { intro: seq.intro }),
        steps: fromEngineSteps(seq.steps, (s) => owners.get(s), (r) => shapes.get(r)),
      },
    }),
  }
  return { map, shapes }
}

const REF = /^\S{1,64}$/

/** Identifiant court d'une forme : le sien s'il est libre, sinon tiré de son identifiant tldraw (FNV-1a). */
function stableRef(own: unknown, shapeId: string, prefix: string, taken: Map<string, unknown>): string {
  if (typeof own === 'string' && REF.test(own) && !taken.has(own)) return own
  let h = 0x811c9dc5
  for (let i = 0; i < shapeId.length; i++) h = Math.imul(h ^ shapeId.charCodeAt(i), 0x01000193)
  const hash = (h >>> 0).toString(36).padStart(7, '0')
  for (let len = 4; len <= hash.length; len++) {
    const ref = prefix + hash.slice(0, len)
    if (!taken.has(ref)) return ref
  }
  let n = 2
  while (taken.has(`${prefix}${hash}${n}`)) n++
  return `${prefix}${hash}${n}`
}

/**
 * Entrée du vocabulaire : nom (celui de la langue du schéma, s'il est gardé), définition, sens de
 * lecture ; le style seulement pour les préréglages créés.
 */
function vocabularyEntry(p: Preset, label?: string): MapVocabulary {
  const description = p.description ?? m().presetHelp[p.id]?.definition
  return {
    id: p.id,
    kind: p.target === 'shape' ? 'type' : 'relation',
    name: (p.target === 'arrow' && label) || p.name,
    ...(description && { description }),
    ...(p.target === 'arrow' && { direction: p.towardChild ? 'toChild' : 'toParent' }),
    ...(p.target === 'arrow' && p.childNature && { childType: p.childNature }),
    ...(p.target === 'arrow' && p.role && { function: p.role }),
    ...(!DEFAULT_IDS.has(p.id) && { style: { ...p.style } as Record<string, string> }),
  }
}

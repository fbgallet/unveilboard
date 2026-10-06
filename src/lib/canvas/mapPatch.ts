// Application au canevas de modifications (« unveilboard/patch », src/lib/map/patch.ts), déjà
// contrôlées (readJson) : mêmes fonctions que l'éditeur, puis mise en page des arbres touchés.
// Le tout se défait d'un seul Ctrl+Z.

import { toRichText, type Editor, type JsonObject, type TLArrowBinding, type TLRichText, type TLShapeId, type TLShapePartial } from 'tldraw'
import { markdownToRichText } from '../map/markdown'
import type { MapPatch, PatchOperation } from '../map/patch'
import { toEngineSteps, type RefShapes } from '../map/sequence'
import { SEQUENCE_VERSION, emptySequence, newId } from '../sequence/types'
import { m } from '@/i18n/client'
import { readSequence, writeSequence } from './adapter'
import { exportMap } from './mapExport'
import { applyType, attachToParent, contentLocale, createElementBox, createLink, presetResolver, type PresetOf } from './mapImport'
import type { Locale } from '@/i18n/config'
import { applyPresetTo, setReasoning } from './presets'
import { relationLabels, rememberRelationLabels } from './relationLabels'
import {
  getTreeIndex,
  linkToParent,
  newChildPlacement,
  relayout,
  rootOf,
  setArgumentTree,
  setDirection,
  withBranchesToDelete,
} from './tree'

/** Écart entre le contenu de la page et un élément isolé ajouté. */
const GAP = 200

/**
 * Applique des modifications contrôlées au schéma ouvert. `ghost` : les éléments et liens ajoutés
 * sont des suggestions en attente (src/lib/canvas/suggestions.ts) ; les autres opérations sont
 * alors ignorées. Renvoie le nombre d'opérations ignorées.
 */
export function applyPatch(editor: Editor, patch: MapPatch, opts: { ghost?: boolean } = {}): { skipped: number } {
  const mark = editor.markHistoryStoppingPoint('modifications JSON')
  const exported = exportMap(editor)
  const presetOf = presetResolver(editor, patch.vocabulary, exported.map.lang)
  const shapes = exported.shapes
  const lang = contentLocale(exported.map.lang)
  /** Nœuds dont l'arbre est à remettre en page. */
  const touched = new Set<TLShapeId>()
  let skipped = 0
  editor.run(() => {
    rememberRelationLabels(editor, relationLabels(editor, patch.vocabulary, exported.map.lang))
    for (const op of patch.operations) {
      if (opts.ghost && op.op !== 'add' && op.op !== 'link') {
        skipped++
        continue
      }
      applyOperation(editor, op, shapes, presetOf, touched, lang)
      if (opts.ghost) markSuggestion(editor, op, shapes)
    }
    const roots = new Set([...touched].filter((id) => editor.getShape(id)).map((id) => rootOf(editor, id)))
    for (const root of roots) relayout(editor, root)
  })
  editor.squashToMark(mark)
  return { skipped }
}

/** Marque en suggestion ce qu'une opération vient d'ajouter (boîte et sa branche, ou lien). */
function markSuggestion(editor: Editor, op: PatchOperation, shapes: Map<string, RefShapes>) {
  if (op.op !== 'add' && op.op !== 'link') return
  const added = shapes.get(op.id)
  const suggestion = op.rationale ? { rationale: op.rationale } : {}
  const updates = [added?.node, added?.edge]
    .map((id) => id && editor.getShape(id as TLShapeId))
    .filter((s) => !!s)
    .map((s) => ({ id: s.id, type: s.type, meta: { ...s.meta, suggestion } }) as TLShapePartial)
  editor.updateShapes(updates)
}

function applyOperation(
  editor: Editor,
  op: PatchOperation,
  shapes: Map<string, RefShapes>,
  presetOf: PresetOf,
  touched: Set<TLShapeId>,
  lang: Locale
) {
  const nodeOf = (ref: string) => shapes.get(ref)?.node as TLShapeId | undefined
  switch (op.op) {
    case 'add': {
      const parentId = op.parent ? nodeOf(op.parent) : undefined
      if (parentId) {
        const { near, side } = newChildPlacement(editor, parentId)
        const id = createElementBox(editor, op, near, side ? { treeSide: side } : {})
        const edge = attachToParent(editor, parentId, id, op, presetOf, lang)
        unfold(editor, parentId)
        shapes.set(op.id, { kind: 'element', node: id, edge })
        touched.add(id)
      } else {
        // Élément isolé (ou nouvelle racine) : à droite du contenu de la page.
        const page = editor.getCurrentPageBounds()
        const at = page ? { x: page.maxX + GAP, y: page.minY } : { x: 0, y: 0 }
        const dir = op.tree?.direction
        const id = createElementBox(editor, op, at, dir && dir !== 'right' ? { treeDir: dir } : {})
        applyType(editor, id, presetOf(op.type, 'shape'))
        if (op.tree?.kind === 'argument') setArgumentTree(editor, id, true)
        shapes.set(op.id, { kind: 'element', node: id })
      }
      return
    }
    case 'update':
      return applyUpdate(editor, op, shapes, presetOf, touched, lang)
    case 'move': {
      const id = nodeOf(op.id)
      const parentId = nodeOf(op.parent)
      if (!id || !parentId) return
      const oldEdge = shapes.get(op.id)?.edge as TLShapeId | undefined
      const old = oldEdge && editor.getShape(oldEdge)
      if (old) touched.add(rootOf(editor, id))
      const relationId = op.relation === null ? undefined : (op.relation ?? (old?.meta.preset as string | undefined))
      const reasoning = old?.meta.reasoning as string | undefined
      if (oldEdge) editor.deleteShapes([oldEdge])
      // Placé après les enfants du nouveau parent ; l'ancienne racine perd ses réglages d'arbre.
      const { near, side } = newChildPlacement(editor, parentId)
      const shape = editor.getShape(id)!
      // meta est fusionné par updateShape : null efface un champ.
      const meta = { ...shape.meta, treeOffset: null, treeSide: side ?? null, treeDir: null, argument: null }
      editor.updateShape({ id, type: shape.type, x: near.x, y: near.y, meta })
      const edge = linkToParent(editor, parentId, id)
      const relation = presetOf(relationId, 'arrow')
      if (relation) applyPresetTo(editor, relation, [editor.getShape(edge)!], { lang })
      if (relation && reasoning) setReasoning(editor, edge, reasoning as never, { lang })
      unfold(editor, parentId)
      shapes.set(op.id, { kind: 'element', node: id, edge })
      touched.add(id)
      return
    }
    case 'remove': {
      const target = shapes.get(op.id)
      if (!target) return
      if (target.kind === 'link') return void editor.deleteShapes([target.node as TLShapeId])
      const id = target.node as TLShapeId
      const parent = getTreeIndex(editor).parent.get(id)
      if (parent) touched.add(parent)
      const gone = withBranchesToDelete(editor, [id])
      // Les liens transversaux qui touchent la branche partent avec elle.
      const goneSet = new Set(gone)
      const links = editor
        .getCurrentPageShapes()
        .filter((s) => s.type === 'arrow' && !goneSet.has(s.id))
        .filter((s) => editor.getBindingsFromShape<TLArrowBinding>(s, 'arrow').some((b) => goneSet.has(b.toId)))
      editor.deleteShapes([...gone, ...links.map((s) => s.id)])
      shapes.delete(op.id)
      return
    }
    case 'link': {
      const from = nodeOf(op.from)
      const to = nodeOf(op.to)
      if (!from || !to) return
      shapes.set(op.id, { kind: 'link', node: createLink(editor, op, from, to, presetOf, lang) })
      return
    }
    case 'sequence': {
      const current = readSequence(editor) ?? emptySequence(m().sequence.defaultTitle)
      // Les formes du schéma à ce point des modifications (identifiants des éléments ajoutés compris).
      const refs = exportMap(editor).shapes
      const steps = toEngineSteps(op.steps, (ref) => refs.get(ref), () => newId('st'))
      writeSequence(editor, {
        ...current,
        version: SEQUENCE_VERSION,
        ...(op.title && { title: op.title }),
        ...(op.intro !== undefined && { intro: op.intro || undefined }),
        steps: op.mode === 'append' ? [...current.steps, ...steps] : steps,
      }, { undoable: true })
      return
    }
  }
}

function applyUpdate(
  editor: Editor,
  op: Extract<PatchOperation, { op: 'update' }>,
  shapes: Map<string, RefShapes>,
  presetOf: PresetOf,
  touched: Set<TLShapeId>,
  lang: Locale
) {
  const target = shapes.get(op.id)
  const id = target?.node as TLShapeId | undefined
  const shape = id && editor.getShape(id)
  if (!target || !id || !shape) return
  touched.add(id)

  // Texte et champs de meta (null : retiré ; meta est fusionné par updateShape, null efface un champ).
  const meta: Record<string, unknown> = { ...shape.meta }
  const setMeta = (key: string, value: unknown) => {
    if (value !== undefined) meta[key] = value
  }
  setMeta('author', op.source)
  setMeta('modality', op.modality)
  setMeta('note', op.note)
  setMeta('origin', op.origin)
  setMeta('excerpt', op.excerpt)
  if (op.folded !== undefined) meta.folded = op.folded
  if (op.type === null) meta.preset = null
  editor.updateShape({
    id,
    type: shape.type,
    meta: meta as JsonObject,
    ...(op.text !== undefined && { props: { richText: markdownToRichText(op.text) as TLRichText } }),
  } as TLShapePartial)
  if (op.type) applyType(editor, id, presetOf(op.type, 'shape'))

  // Relation et type de raisonnement : sur la flèche qui relie l'élément à son parent.
  const edge = target.edge as TLShapeId | undefined
  const arrow = edge && editor.getShape(edge)
  if (edge && arrow && op.relation !== undefined) {
    const reasoning = op.reasoning === undefined ? (arrow.meta.reasoning as string | undefined) : op.reasoning
    const rest = { ...arrow.meta, preset: null, reasoning: null }
    // Nouvelle étiquette : celle de la relation (le texte de l'ancienne est effacé).
    editor.updateShape({ id: edge, type: 'arrow', props: { richText: toRichText('') }, meta: rest })
    const relation = presetOf(op.relation ?? undefined, 'arrow')
    if (relation) {
      applyPresetTo(editor, relation, [editor.getShape(edge)!], { lang })
      if (reasoning) setReasoning(editor, edge, reasoning as never, { lang })
    } else {
      // Sans relation : une simple branche, comme à la création.
      editor.updateShape({
        id: edge,
        type: 'arrow',
        props: { color: 'grey', dash: 'draw', size: 's', arrowheadStart: 'none', arrowheadEnd: 'none' },
      })
      const type = presetOf(meta.preset as string | undefined, 'shape')
      if (type) applyType(editor, id, type)
    }
  } else if (edge && op.reasoning !== undefined) {
    setReasoning(editor, edge, op.reasoning, { lang })
  }

  // Réglages d'arbre, sur une racine.
  if (op.tree === null) {
    setArgumentTree(editor, id, false)
  } else if (op.tree) {
    setArgumentTree(editor, id, op.tree.kind === 'argument')
    if (op.tree.direction) setDirection(editor, id, op.tree.direction)
  }
}

function unfold(editor: Editor, id: TLShapeId) {
  const shape = editor.getShape(id)
  if (shape?.meta.folded) editor.updateShape({ id, type: shape.type, meta: { ...shape.meta, folded: false } })
}

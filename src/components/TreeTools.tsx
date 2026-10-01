'use client'

import { useCallback, useEffect, useState } from 'react'
import { atom, renderPlaintextFromRichText, useEditor, useValue, type Editor, type TLRichText, type TLShapeId } from 'tldraw'
import { readSequence, writeSequence } from '@/lib/canvas/adapter'
import { addStep, appearanceIndex, showAlongWith } from '@/lib/sequence/edit'
import {
  addChild,
  addChildWithRelation,
  addLinkedPremise,
  addPremise,
  addSibling,
  canLinkPremise,
  isLinked,
  functionOf,
  branchOf,
  directionOf,
  edgesOf,
  nodeDirection,
  getTreeIndex,
  isThesisRoot,
  isArgumentTree,
  isFolded,
  isTreeNode,
  relayout,
  revealOrder,
  rootOf,
  setArgumentTree,
  setDirection,
  setEdges,
  toggleFold,
  type TreeEdges,
} from '@/lib/canvas/tree'
import { presetSettingsAtom, swatchColor } from '@/lib/canvas/presets'
import { PREMISE, offeredPresets, relationsFor, type Preset } from '@/lib/presets/presets'
import { presetName, presetRole } from '@/lib/presets/labels'
import { presetDefinition, presetGuideOpenAtom } from './PresetTools'
import { TREE_DIRECTIONS, type TreeDirection } from '@/lib/tree/layout'
import { editUnlockedAtom, foldBadgesAtom, modeAtom, setFoldOverride } from '@/lib/presentation/store'
import { useT } from '@/i18n/client'
import { swallowNextKeyUp } from '@/lib/keyboard'
import { elementAiAtom } from './ElementAi'
import { openAssistant } from './MapJsonDialog'

const ARROWS: Record<TreeDirection, string> = { right: '→', left: '←', down: '↓', up: '↑', both: '↔' }
const EDGE_GLYPHS: Record<TreeEdges, string> = { curve: '╭', elbow: '┌' }

/** Arbre argumentatif : nœud dont on choisit la relation du prochain enfant (Tab). */
export const relationPickerAtom = atom<TLShapeId | null>('relationPicker', null)

/** Tab : enfant simple, ou choix d'une relation dans un arbre argumentatif. */
function tab(editor: Editor, id: TLShapeId) {
  if (isArgumentTree(editor, id)) relationPickerAtom.set(id)
  else addChild(editor, id)
}

/**
 * Lie une prémisse au nœud. Quand une pastille prend sa place, elle apparaît dans la séquence en même
 * temps que lui (sa flèche avec celle du nœud) : sinon, non programmée, elle surgirait avec le parent.
 */
function linkPremise(editor: Editor, id: TLShapeId) {
  const { parent, edge } = getTreeIndex(editor)
  const before = parent.get(id)
  const oldEdge = edge.get(id)
  addLinkedPremise(editor, id)
  const after = getTreeIndex(editor)
  const junction = after.parent.get(id)
  const junctionEdge = junction && after.edge.get(junction)
  const seq = readSequence(editor)
  if (!seq || !junction || !junctionEdge || junction === before) return
  let next = showAlongWith(seq, id, [junction])
  if (oldEdge) next = showAlongWith(next, oldEdge, [junctionEdge])
  writeSequence(editor, next)
}

/** Le document est modifiable : mode édition, ou présentation déverrouillée. */
const canEdit = () => modeAtom.get() === 'edit' || editUnlockedAtom.get()

/**
 * Raccourcis de l'arbre :
 * Tab ajoute un enfant (et commence un arbre sur n'importe quelle boîte) ;
 * Entrée ajoute un frère (sur une pastille de prémisses liées : une prémisse) ;
 * Maj+Entrée lie une prémisse au nœud sélectionné ;
 * pendant la saisie, Entrée valide (Maj+Entrée : saut de ligne).
 */
export function useTreeKeyboard(editor: Editor) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!canEdit() || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key !== 'Tab' && e.key !== 'Enter') return
      const editing = editor.getEditingShapeId()

      if (editing) {
        const shape = editor.getShape(editing)
        if (shape?.type !== 'geo') return
        if (e.key === 'Enter' && (e.shiftKey || !isTreeNode(editor, editing))) return
        stop(e)
        editor.complete()
        if (e.key === 'Tab') tab(editor, editing)
        return
      }

      // Hors saisie : une seule forme sélectionnée, et pas de champ de saisie de l'interface.
      if (isTypingTarget(e.target)) return
      const selected = editor.getOnlySelectedShape()
      if (!selected || selected.type !== 'geo' || !editor.isIn('select.idle')) return
      if (e.key === 'Tab') {
        stop(e)
        tab(editor, selected.id)
      } else if (e.shiftKey && canLinkPremise(editor, selected.id)) {
        stop(e)
        linkPremise(editor, selected.id)
      } else if (!e.shiftKey && isLinked(editor, selected.id)) {
        stop(e)
        addPremise(editor, selected.id)
      } else if (!e.shiftKey && getTreeIndex(editor).parent.has(selected.id)) {
        stop(e)
        addSibling(editor, selected.id)
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [editor])
}

function stop(e: KeyboardEvent) {
  e.preventDefault()
  e.stopPropagation()
  // tldraw traite aussi Tab au relâchement (forme suivante) : on l'en empêche.
  if (e.key === 'Tab') swallowNextKeyUp('Tab')
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Barre contextuelle en édition : une boîte (ou un nœud d'arbre) sélectionnée. */
export function TreeToolbar({ editor }: { editor: Editor }) {
  const t = useT()
  const info = useValue(
    'tree toolbar',
    () => {
      const shape = editor.getOnlySelectedShape()
      if (!shape || shape.type !== 'geo' || !editor.isIn('select.idle')) return null
      const argument = isArgumentTree(editor, shape.id)
      if (!isTreeNode(editor, shape.id)) return { id: shape.id, argument, inTree: false as const }
      const root = rootOf(editor, shape.id)
      return {
        id: shape.id,
        argument,
        inTree: true as const,
        kids: getTreeIndex(editor).children.get(shape.id)?.length ?? 0,
        folded: isFolded(editor, shape.id),
        linkable: canLinkPremise(editor, shape.id),
        junction: isLinked(editor, shape.id),
        dir: directionOf(editor, root),
        edges: edgesOf(editor, root),
      }
    },
    [editor]
  )
  if (!info) return null
  const id = info.id as TLShapeId

  // Carte d'argument : une étape par élément non encore programmé, dans l'ordre de l'arbre.
  const revealMap = () => {
    const seq = readSequence(editor)
    if (!seq) return
    const shown = appearanceIndex(seq)
    const items = revealOrder(editor, id).filter((i) => !shown.has(i.node))
    if (!items.length) return void alert(t.tree.revealNothing)
    // Prémisses liées : la pastille et ses prémisses forment une seule étape.
    const { parent } = getTreeIndex(editor)
    const groups: (typeof items)[] = []
    for (const item of items) {
      const p = parent.get(item.node)
      const last = groups.at(-1)
      if (last && p && isLinked(editor, p) && last.some((i) => i.node === p)) last.push(item)
      else groups.push([item])
    }
    const textOf = (node: TLShapeId) => {
      const shape = editor.getShape(node)
      return shape && 'richText' in shape.props ? renderPlaintextFromRichText(editor, shape.props.richText as TLRichText).split('\n')[0].trim() : ''
    }
    let next = seq
    for (const group of groups) {
      const title = group.map((i) => textOf(i.node)).find(Boolean) ?? ''
      const edges = group.flatMap((i) => (i.edge ? [i.edge] : []))
      ;[next] = addStep(next, next.steps.length, {
        title: title.length > 48 ? `${title.slice(0, 47)}…` : title || t.tree.revealStep,
        actions: [
          { type: 'show', targets: group.map((i) => i.node), effect: 'rise' },
          ...(edges.length ? [{ type: 'show' as const, targets: edges, effect: 'draw' as const }] : []),
        ],
      })
    }
    editor.markHistoryStoppingPoint('dévoiler la carte')
    writeSequence(editor, next)
  }

  const argumentToggle = (
    <button
      className={`qa-btn ${info.argument ? 'qa-btn-on' : ''}`}
      onClick={() => setArgumentTree(editor, id, !info.argument)}
      aria-pressed={info.argument}
      title={t.tree.argumentHint}
    >
      {t.tree.argument}
    </button>
  )

  // À partir de cet élément, une demande à l'IA.
  const aiButton = (
    <button className="qa-btn" onClick={() => elementAiAtom.set(id)} title={t.elementAi.buttonHint}>
      {t.elementAi.button}
    </button>
  )

  if (!info.inTree) {
    return (
      <div className="tree-toolbar">
        {aiButton}
        {argumentToggle}
        <span className="tree-hint">
          <kbd>Tab</kbd> {info.argument ? t.tree.argumentTabHint : t.tree.startTree}
        </span>
      </div>
    )
  }
  return (
    <div className="tree-toolbar">
      {info.kids > 0 && (
        <button className="qa-btn" onClick={() => toggleFold(editor, id)} title={t.tree.toggleFoldHint}>
          {info.folded ? t.tree.unfoldCount(info.kids) : t.tree.fold}
        </button>
      )}
      <button
        className="qa-btn"
        onClick={() => {
          editor.markHistoryStoppingPoint('réorganiser')
          relayout(editor, id, { reset: true })
        }}
        title={t.tree.relayoutHint}
      >
        {t.tree.relayout}
      </button>
      {info.linkable && (
        <button className="qa-btn" onClick={() => linkPremise(editor, id)} title={t.tree.linkPremiseHint}>
          {t.tree.linkPremise}
        </button>
      )}
      {info.junction && (
        <button className="qa-btn" onClick={() => addPremise(editor, id)} title={t.tree.addPremiseHint}>
          {t.tree.addPremise}
        </button>
      )}
      {argumentToggle}
      {info.argument && (
        <button className="qa-btn" onClick={revealMap} title={t.tree.revealMapHint}>
          {t.tree.revealMap}
        </button>
      )}
      <button className="qa-btn" onClick={() => openAssistant('sequence')} title={t.tree.sequenceAiHint}>
        {t.tree.sequenceAi}
      </button>
      {aiButton}
      {/* Orientation de l'arbre */}
      <span className="tree-dirs">
        {TREE_DIRECTIONS.map((dir) => (
          <button
            key={dir}
            className={`tree-dir ${info.dir === dir ? 'tree-dir-active' : ''}`}
            onClick={() => info.dir !== dir && setDirection(editor, id, dir)}
            title={t.tree.directions[dir]}
            aria-label={t.tree.directions[dir]}
            aria-pressed={info.dir === dir}
          >
            {ARROWS[dir]}
          </button>
        ))}
      </span>
      {/* Tracé des branches */}
      <span className="tree-dirs">
        {(['curve', 'elbow'] as TreeEdges[]).map((edges) => (
          <button
            key={edges}
            className={`tree-dir ${info.edges === edges ? 'tree-dir-active' : ''}`}
            onClick={() => info.edges !== edges && setEdges(editor, id, edges)}
            title={t.tree.edges[edges]}
            aria-label={t.tree.edges[edges]}
            aria-pressed={info.edges === edges}
          >
            {EDGE_GLYPHS[edges]}
          </button>
        ))}
      </span>
      <span className="tree-hint">
        <kbd>Tab</kbd> {t.tree.child} · <kbd>{t.tree.enter}</kbd> {t.tree.sibling}
      </span>
    </div>
  )
}

/**
 * Pastilles « +n » sur les nœuds repliés : cliquer pour déplier. Un nœud déplié survolé (ou
 * sélectionné, en édition) montre « − » pour replier sa branche. En présentation, le geste ne
 * touche pas au document : il s'ajoute à la séquence le temps de la séance.
 * readOnly : fenêtre public du double affichage, qui suit le présentateur.
 */
export function FoldBadges({ readOnly = false }: { readOnly?: boolean }) {
  const t = useT()
  const editor = useEditor()
  const badges = useValue(
    'fold badges',
    () => {
      const presenting = modeAtom.get() === 'present'
      const { children } = getTreeIndex(editor)
      const active = new Set<string>([...editor.getSelectedShapeIds(), editor.getHoveredShapeId() ?? ''])
      let folded: { id: string; n: number }[]
      let unfolded: string[]
      if (presenting) {
        const pres = foldBadgesAtom.get()
        folded = pres.folded
        unfolded = readOnly ? [] : pres.open.filter((id) => active.has(id))
      } else {
        folded = [...children.keys()]
          .filter((id) => isFolded(editor, id) && !editor.isShapeHidden(id))
          .map((id) => ({ id, n: branchOf(editor, id).length }))
        unfolded = [...children.keys()].filter((id) => active.has(id) && !isFolded(editor, id) && !editor.isShapeHidden(id))
      }
      const badge = (id: string, n: number, fold: boolean) => {
        const b = editor.getShapePageBounds(id as TLShapeId)
        if (!b) return []
        const dir = nodeDirection(editor, id as TLShapeId)
        const at = { right: { x: b.maxX, y: b.midY }, left: { x: b.minX, y: b.midY }, down: { x: b.midX, y: b.maxY }, up: { x: b.midX, y: b.minY } }[dir]
        return [{ id: id as TLShapeId, n, fold, ...at }]
      }
      return [...folded.flatMap((f) => badge(f.id, f.n, false)), ...unfolded.flatMap((id) => badge(id, 0, true))]
    },
    [editor, readOnly]
  )
  const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor])
  const presenting = useValue(modeAtom) === 'present'

  return (
    <>
      {badges.map((b) => (
        <button
          key={b.id}
          className={`fold-badge ${b.fold ? 'fold-badge-open' : ''}`}
          style={{ left: b.x, top: b.y, transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
          disabled={readOnly}
          title={readOnly ? undefined : b.fold ? t.tree.collapseBranch : t.tree.expandBranch}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => (presenting ? setFoldOverride(b.id, b.fold) : toggleFold(editor, b.id))}
        >
          {b.fold ? '−' : `+${b.n}`}
        </button>
      ))}
    </>
  )
}

/** Touche d'une relation dans le choix : 1 à 9, puis a, b, c… */
const relationKey = (i: number) => (i < 9 ? String(i + 1) : String.fromCharCode(97 + i - 9))

/**
 * Arbre argumentatif : choix de la relation du nouvel enfant (touches 1 à 9 puis a, b…,
 * 0 sans relation, Échap pour annuler). La branche prend le style et le sens de la relation, l'enfant sa nature.
 */
export function RelationPicker({ editor }: { editor: Editor }) {
  const t = useT()
  const nodeId = useValue(relationPickerAtom)
  // « Plus… » : toutes les relations, pour ce choix-ci.
  const [allFor, setAllFor] = useState<TLShapeId | null>(null)
  const all = !!nodeId && allFor === nodeId
  const setAll = useCallback(() => setAllFor(nodeId), [nodeId])
  // Fermer le choix le remet à zéro (liste contextuelle à la prochaine ouverture).
  const closePicker = useCallback(() => {
    relationPickerAtom.set(null)
    setAllFor(null)
  }, [])
  const relations = useValue(
    'relations',
    () => {
      const settings = presetSettingsAtom.get()
      const visible = settings.items.filter((p) => p.target === 'arrow' && !p.hidden)
      // Sous une pastille de prémisses liées : une prémisse, ou une objection à l'inférence elle-même.
      if (nodeId && isLinked(editor, nodeId)) return settings.items.filter((p) => p.id === PREMISE || p.id === 'objects')
      if (all || !nodeId) return visible.filter((p) => p.id !== PREMISE).slice(0, 35)
      // Selon le profil, puis selon le nœud : sa fonction (relation à son parent), sinon son type.
      const offered = new Set(offeredPresets(settings).map((p) => p.id))
      const context = { functionId: functionOf(editor, nodeId)?.id, typeId: editor.getShape(nodeId)?.meta.preset as string | undefined }
      return relationsFor(context, visible.filter((r) => offered.has(r.id))).slice(0, 35)
    },
    [editor, nodeId, all]
  )
  const hasMore = useValue(
    'more relations',
    () => presetSettingsAtom.get().items.filter((p) => p.target === 'arrow' && !p.hidden).length > relations.length,
    [relations]
  )
  const at = useValue(
    'picker position',
    () => {
      const b = nodeId && editor.getShapePageBounds(nodeId)
      return b ? editor.pageToViewport({ x: b.maxX, y: b.minY }) : null
    },
    [editor, nodeId]
  )

  useEffect(() => {
    if (!nodeId) return
    const pick = (relation: Preset | null) => {
      closePicker()
      addChildWithRelation(editor, nodeId, relation)
    }
    function onKeyDown(e: KeyboardEvent) {
      const i = relations.findIndex((_, i) => relationKey(i) === e.key.toLowerCase())
      if (e.key === 'Escape') closePicker()
      else if (e.key === '0') pick(null)
      else if (e.key === '+' && hasMore) setAll()
      else if (i >= 0) pick(relations[i])
      else return
      stop(e)
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [editor, nodeId, relations, hasMore, setAll, closePicker])

  if (!nodeId || !at) return null
  const pick = (relation: Preset | null) => {
    closePicker()
    addChildWithRelation(editor, nodeId, relation)
  }
  // Ce qu'on ajoute (sa fonction) d'abord, la relation ensuite.
  const title = isThesisRoot(editor, nodeId) ? t.tree.addToThesis : t.tree.addTo
  return (
    <div className="relation-picker" style={{ left: at.x + 12, top: at.y }} role="menu" aria-label={title}>
      <p className="relation-picker-title">{title}</p>
      {relations.map((r, i) => (
        <button key={r.id} className="relation-item" role="menuitem" onClick={() => pick(r)} title={presetDefinition(r, t)}>
          <kbd>{relationKey(i)}</kbd>
          <span className="relation-line" style={{ borderColor: swatchColor(editor, r), borderStyle: r.style.dash === 'dashed' ? 'dashed' : r.style.dash === 'dotted' ? 'dotted' : 'solid' }} />
          <span>
            {presetRole(r, t) ?? presetName(r, t)}
            {r.role && <span className="relation-verb"> · {presetName(r, t)}</span>}
          </span>
        </button>
      ))}
      <button className="relation-item" role="menuitem" onClick={() => pick(null)}>
        <kbd>0</kbd>
        <span className="relation-line" />
        {t.tree.noRelation}
      </button>
      {hasMore && (
        <button className="relation-item relation-more" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={setAll}>
          <kbd>+</kbd>
          <span className="relation-line" />
          {t.tree.moreRelations}
        </button>
      )}
      <button className="relation-guide" onMouseDown={(e) => e.preventDefault()} onClick={() => presetGuideOpenAtom.set(true)}>
        ? {t.guide.open}
      </button>
    </div>
  )
}

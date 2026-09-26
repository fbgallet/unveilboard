'use client'

import { useEffect } from 'react'
import { atom, useEditor, useValue, type Editor, type TLShapeId } from 'tldraw'
import {
  addChild,
  addChildWithRelation,
  addSibling,
  branchOf,
  directionOf,
  nodeDirection,
  getTreeIndex,
  isArgumentTree,
  isFolded,
  isTreeNode,
  relayout,
  rootOf,
  setArgumentTree,
  setDirection,
  toggleFold,
} from '@/lib/canvas/tree'
import { presetSettingsAtom, swatchColor } from '@/lib/canvas/presets'
import type { Preset } from '@/lib/presets/presets'
import { TREE_DIRECTIONS, type TreeDirection } from '@/lib/tree/layout'
import { editUnlockedAtom, foldedBadgesAtom, modeAtom } from '@/lib/presentation/store'
import { useT } from '@/i18n/client'

const ARROWS: Record<TreeDirection, string> = { right: '→', left: '←', down: '↓', up: '↑', both: '↔' }

/** Arbre argumentatif : nœud dont on choisit la relation du prochain enfant (Tab). */
export const relationPickerAtom = atom<TLShapeId | null>('relationPicker', null)

/** Tab : enfant simple, ou choix d'une relation dans un arbre argumentatif. */
function tab(editor: Editor, id: TLShapeId) {
  if (isArgumentTree(editor, id)) relationPickerAtom.set(id)
  else addChild(editor, id)
}

/** Le document est modifiable : mode édition, ou présentation déverrouillée. */
const canEdit = () => modeAtom.get() === 'edit' || editUnlockedAtom.get()

/**
 * Raccourcis de l'arbre :
 * Tab ajoute un enfant (et commence un arbre sur n'importe quelle boîte) ;
 * Entrée ajoute un frère ; pendant la saisie, Entrée valide (Maj+Entrée : saut de ligne).
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
        dir: directionOf(editor, root),
      }
    },
    [editor]
  )
  if (!info) return null
  const id = info.id as TLShapeId

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

  if (!info.inTree) {
    return (
      <div className="tree-toolbar">
        {argumentToggle}
        <span className="tree-hint">
          <kbd>Tab</kbd> {t.tree.startTree}
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
      {argumentToggle}
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
      <span className="tree-hint">
        <kbd>Tab</kbd> {t.tree.child} · <kbd>{t.tree.enter}</kbd> {t.tree.sibling}
      </span>
    </div>
  )
}

/** Pastilles « +n » sur les nœuds repliés (en édition : cliquer pour déplier). */
export function FoldBadges() {
  const t = useT()
  const editor = useEditor()
  const badges = useValue(
    'fold badges',
    () => {
      const presenting = modeAtom.get() === 'present'
      const { children } = getTreeIndex(editor)
      const folded = presenting
        ? foldedBadgesAtom.get()
        : [...children.keys()].filter((id) => isFolded(editor, id) && !editor.isShapeHidden(id))
      return folded.flatMap((id) => {
        const b = editor.getShapePageBounds(id as TLShapeId)
        if (!b) return []
        const dir = nodeDirection(editor, id as TLShapeId)
        const at = { right: { x: b.maxX, y: b.midY }, left: { x: b.minX, y: b.midY }, down: { x: b.midX, y: b.maxY }, up: { x: b.midX, y: b.minY } }[dir]
        return [{ id: id as TLShapeId, n: branchOf(editor, id as TLShapeId).length, ...at }]
      })
    },
    [editor]
  )
  const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor])
  const presenting = useValue(modeAtom) === 'present'

  return (
    <>
      {badges.map((b) => (
        <button
          key={b.id}
          className="fold-badge"
          style={{ left: b.x, top: b.y, transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
          disabled={presenting}
          title={presenting ? undefined : t.tree.expandBranch}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => toggleFold(editor, b.id)}
        >
          +{b.n}
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
  const relations = useValue('relations', () => presetSettingsAtom.get().items.filter((p) => p.target === 'arrow').slice(0, 35), [])
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
      relationPickerAtom.set(null)
      addChildWithRelation(editor, nodeId, relation)
    }
    function onKeyDown(e: KeyboardEvent) {
      const i = relations.findIndex((_, i) => relationKey(i) === e.key.toLowerCase())
      if (e.key === 'Escape') relationPickerAtom.set(null)
      else if (e.key === '0') pick(null)
      else if (i >= 0) pick(relations[i])
      else return
      stop(e)
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [editor, nodeId, relations])

  if (!nodeId || !at) return null
  const pick = (relation: Preset | null) => {
    relationPickerAtom.set(null)
    addChildWithRelation(editor, nodeId, relation)
  }
  return (
    <div className="relation-picker" style={{ left: at.x + 12, top: at.y }} role="menu" aria-label={t.tree.pickRelation}>
      <p className="relation-picker-title">{t.tree.pickRelation}</p>
      {relations.map((r, i) => (
        <button key={r.id} className="relation-item" role="menuitem" onClick={() => pick(r)}>
          <kbd>{relationKey(i)}</kbd>
          <span className="relation-line" style={{ borderColor: swatchColor(editor, r), borderStyle: r.style.dash === 'dashed' ? 'dashed' : r.style.dash === 'dotted' ? 'dotted' : 'solid' }} />
          {r.name}
        </button>
      ))}
      <button className="relation-item" role="menuitem" onClick={() => pick(null)}>
        <kbd>0</kbd>
        <span className="relation-line" />
        {t.tree.noRelation}
      </button>
    </div>
  )
}

'use client'

import { useEffect } from 'react'
import { useEditor, useValue, type Editor, type TLShapeId } from 'tldraw'
import {
  addChild,
  addSibling,
  branchOf,
  directionOf,
  getTreeIndex,
  isFolded,
  isTreeNode,
  relayout,
  rootOf,
  setDirection,
  toggleFold,
} from '@/lib/canvas/tree'
import { addDetail, getDetailIndex, isDetailOpen, toggleDetail } from '@/lib/canvas/details'
import { editUnlockedAtom, foldedBadgesAtom, modeAtom } from '@/lib/presentation/store'
import { useT } from '@/i18n/client'

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
        if (e.key === 'Tab') addChild(editor, editing)
        return
      }

      // Hors saisie : une seule forme sélectionnée, et pas de champ de saisie de l'interface.
      if (isTypingTarget(e.target)) return
      const selected = editor.getOnlySelectedShape()
      if (!selected || selected.type !== 'geo' || !editor.isIn('select.idle')) return
      if (e.key === 'Tab') {
        stop(e)
        addChild(editor, selected.id)
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

/** Barre contextuelle en édition : une boîte (ou un nœud d'arbre) sélectionnée : arbre et détail. */
export function TreeToolbar({ editor }: { editor: Editor }) {
  const t = useT()
  const info = useValue(
    'tree toolbar',
    () => {
      const shape = editor.getOnlySelectedShape()
      if (!shape || shape.type !== 'geo' || !editor.isIn('select.idle')) return null
      const detail = !getDetailIndex(editor).details.has(shape.id) ? 'none' : isDetailOpen(editor, shape.id) ? 'open' : 'closed'
      if (!isTreeNode(editor, shape.id)) return { id: shape.id, detail, inTree: false as const }
      const root = rootOf(editor, shape.id)
      return {
        id: shape.id,
        detail,
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

  const detailButton =
    info.detail === 'none' ? (
      <button className="qa-btn" onClick={() => addDetail(editor, id)} title={t.tree.addDetailHint}>
        {t.tree.addDetail}
      </button>
    ) : (
      <button className="qa-btn" onClick={() => toggleDetail(editor, id)} title={t.tree.toggleDetailHint}>
        {info.detail === 'open' ? t.tree.collapseDetail : t.tree.expandDetail}
      </button>
    )

  if (!info.inTree) {
    return (
      <div className="tree-toolbar">
        {detailButton}
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
      {detailButton}
      <button
        className="qa-btn"
        onClick={() => setDirection(editor, id, info.dir === 'right' ? 'down' : 'right')}
        title={t.tree.directionHint}
      >
        {info.dir === 'right' ? t.tree.right : t.tree.down}
      </button>
      <span className="tree-hint">
        <kbd>Tab</kbd> {t.tree.child} · <kbd>{t.tree.enter}</kbd> {t.tree.sibling}
      </span>
    </div>
  )
}

/** Pastilles « … » sous les boîtes dont le détail est replié (édition : cliquer pour le déplier). */
export function DetailBadges() {
  const t = useT()
  const editor = useEditor()
  const badges = useValue(
    'detail badges',
    () => {
      if (modeAtom.get() !== 'edit') return []
      return [...getDetailIndex(editor).details.keys()].flatMap((id) => {
        if (isDetailOpen(editor, id) || editor.isShapeHidden(id)) return []
        const b = editor.getShapePageBounds(id)
        return b ? [{ id, x: b.midX, y: b.maxY }] : []
      })
    },
    [editor]
  )
  const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor])
  return (
    <>
      {badges.map((b) => (
        <button
          key={b.id}
          className="fold-badge"
          style={{ left: b.x, top: b.y, transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
          title={t.tree.expandDetailBadge}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => toggleDetail(editor, b.id)}
        >
          …
        </button>
      ))}
    </>
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
        const dir = directionOf(editor, rootOf(editor, id as TLShapeId))
        const at = dir === 'right' ? { x: b.maxX, y: b.midY } : { x: b.midX, y: b.maxY }
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

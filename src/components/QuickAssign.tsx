'use client'

import { useValue, type Editor, type TLShapeId } from 'tldraw'
import { readSequence, writeSequence } from '@/lib/canvas/adapter'
import { addStep, addTargets, appearanceIndex } from '@/lib/sequence/edit'
import { stepIndexAtom } from '@/lib/presentation/store'

/**
 * Document déverrouillé pendant la présentation : rattacher la sélection à la séquence
 * d'un clic (étape courante, ou nouvelle étape juste avant / juste après).
 */
export function QuickAssign({ editor }: { editor: Editor }) {
  const selection = useValue('selection', () => editor.getSelectedShapeIds(), [editor])
  const seq = useValue('sequence', () => readSequence(editor), [editor])
  const index = useValue(stepIndexAtom)
  const isBusy = useValue(
    'busy',
    () => !!editor.getEditingShapeId() || !editor.isIn('select.idle'),
    [editor]
  )
  if (!seq || !selection.length || isBusy) return null

  const current = seq.steps[index]
  const appears = appearanceIndex(seq)
  const already = [...new Set(selection.map((id) => appears.get(id)).filter((n) => n !== undefined))]

  function apply(run: () => number) {
    const nextIndex = run()
    editor.selectNone()
    stepIndexAtom.set(nextIndex)
  }

  const addToCurrent = () =>
    apply(() => {
      writeSequence(editor, addTargets(seq!, current.id, 'show', selection))
      return index
    })

  // Nouvelle étape à la position `at`, qui fait apparaître la sélection.
  const insertAt = (at: number, thenShow: number) =>
    apply(() => {
      const [next] = addStep(seq!, at, {
        title: 'Nouvelle étape',
        actions: [{ type: 'show', targets: selection as TLShapeId[], effect: 'fade' }],
      })
      writeSequence(editor, next)
      return thenShow
    })

  const count = `${selection.length} objet${selection.length > 1 ? 's' : ''}`

  return (
    <div className="quick-assign pointer-events-auto absolute left-1/2 z-[600] flex -translate-x-1/2 items-center gap-1 rounded-xl border border-stone-200 bg-white/95 p-1 pl-3 text-xs text-stone-600 shadow-lg backdrop-blur">
      <span className="mr-1 whitespace-nowrap">
        {count}
        {already.length > 0 && (
          <span className="text-stone-400"> · déjà à l&apos;étape {already.join(', ')}</span>
        )}
      </span>
      <button
        className="qa-btn"
        disabled={index < 0}
        onClick={() => insertAt(index, index + 1)}
        title="Créer une étape intermédiaire, juste avant l'étape affichée"
      >
        ← Nouvelle étape avant
      </button>
      <button
        className="qa-btn qa-btn-primary"
        disabled={!current}
        onClick={addToCurrent}
        title="Faire apparaître la sélection à l'étape affichée"
      >
        Ajouter à l&apos;étape {index + 1}
      </button>
      <button
        className="qa-btn"
        onClick={() => insertAt(index + 1, index + 1)}
        title="Créer une étape juste après l'étape affichée, et y aller"
      >
        Nouvelle étape après →
      </button>
    </div>
  )
}

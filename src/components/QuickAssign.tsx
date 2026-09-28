'use client'

import { useEffect, useRef } from 'react'
import { useValue, type Editor, type TLShapeId } from 'tldraw'
import { readSequence, writeSequence } from '@/lib/canvas/adapter'
import { addStep, addTargets, appearanceIndex, appearances, removeTargets } from '@/lib/sequence/edit'
import { emptySequence, type Sequence } from '@/lib/sequence/types'
import { useT } from '@/i18n/client'
import { activeStepIdAtom, pendingShapesAtom, quickSequenceAtom, stepIndexAtom } from '@/lib/presentation/store'

/**
 * Document déverrouillé pendant la présentation : rattacher la sélection à la séquence
 * d'un clic (étape courante, ou nouvelle étape juste avant / juste après).
 */
export function QuickAssign({ editor }: { editor: Editor }) {
  const selection = useValue('selection', () => editor.getSelectedShapeIds(), [editor])
  const seq = useValue('sequence', () => readSequence(editor), [editor])
  const index = useValue(stepIndexAtom)
  const isBusy = useIsBusy(editor)
  if (!seq || !selection.length || isBusy) return null

  return (
    <AssignBar
      editor={editor}
      seq={seq}
      index={index}
      targets={selection}
      onAssigned={(_, nextIndex) => {
        editor.selectNone()
        stepIndexAtom.set(nextIndex)
      }}
    />
  )
}

/**
 * Mode édition, une étape active : rattacher la sélection d'un clic à cette étape,
 * ou à une nouvelle étape juste avant / juste après.
 */
export function SelectionAssign({ editor }: { editor: Editor }) {
  const selection = useValue('selection', () => editor.getSelectedShapeIds(), [editor])
  const seq = useValue('sequence', () => readSequence(editor), [editor])
  const activeId = useValue(activeStepIdAtom)
  const isBusy = useIsBusy(editor)
  const index = seq?.steps.findIndex((s) => s.id === activeId) ?? -1
  if (!seq || index < 0 || !selection.length || isBusy) return null

  return (
    <AssignBar
      editor={editor}
      seq={seq}
      index={index}
      targets={selection}
      onAssigned={(next, nextIndex) => {
        editor.selectNone()
        activeStepIdAtom.set(next.steps[nextIndex]?.id ?? null)
      }}
    />
  )
}

/**
 * Séquençage rapide (mode édition) : les objets créés s'accumulent, puis on les rattache
 * d'un clic (ou 1 / 2 / 3) à l'étape active, ou à une nouvelle étape avant / après.
 */
export function QuickSequence({ editor }: { editor: Editor }) {
  const t = useT()
  usePendingShapes(editor)
  const stored = useValue('sequence', () => readSequence(editor), [editor])
  const seq = stored ?? emptySequence()
  const activeId = useValue(activeStepIdAtom)
  const pending = useValue('pending', () => pendingTargets(editor), [editor])
  // Sans objet créé en attente, la sélection se rattache de la même façon.
  const selection = useValue('selection', () => editor.getSelectedShapeIds(), [editor])
  const targets = pending.length ? pending : selection
  const isBusy = useIsBusy(editor)
  const index = seq.steps.findIndex((s) => s.id === activeId)

  const goTo = (i: number) => activeStepIdAtom.set(seq.steps[i]?.id ?? null)
  const nav = (
    <span className="flex items-center gap-0.5 text-stone-500">
      <button className="qa-btn px-1.5" disabled={index <= 0} onClick={() => goTo(index - 1)} title={t.quick.previousStep}>
        ‹
      </button>
      <span className="min-w-[4.5rem] text-center whitespace-nowrap">
        {seq.steps.length ? t.quick.stepOf(index + 1, seq.steps.length) : t.quick.noSteps}
      </span>
      <button
        className="qa-btn px-1.5"
        disabled={index >= seq.steps.length - 1}
        onClick={() => goTo(index + 1)}
        title={t.quick.nextStep}
      >
        ›
      </button>
    </span>
  )
  const quit = (
    <button className="qa-btn text-stone-400" onClick={() => quickSequenceAtom.set(false)} title={t.quick.quit}>
      ✕
    </button>
  )

  if (!targets.length || isBusy) {
    return (
      <div className="quick-assign quick-sequence pointer-events-auto absolute left-1/2 z-[600] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-amber-300 bg-white/95 p-1 pl-3 text-xs text-stone-500 shadow-lg backdrop-blur">
        <span className="font-medium text-amber-700">{t.quick.title}</span>
        {nav}
        <span className="whitespace-nowrap text-stone-400">{t.quick.createHint}</span>
        {quit}
      </div>
    )
  }

  return (
    <AssignBar
      editor={editor}
      seq={seq}
      index={index}
      targets={targets}
      shortcuts
      className="border-amber-300"
      onAssigned={(next, nextIndex) => {
        if (pending.length) pendingShapesAtom.set([])
        else editor.selectNone()
        activeStepIdAtom.set(next.steps[nextIndex]?.id ?? null)
      }}
      extra={
        <>
          {pending.length > 0 && (
            <button
              className="qa-btn text-stone-400"
              onClick={() => pendingShapesAtom.set([])}
              title={t.quick.ignoreHint}
            >
              {t.quick.ignore}
            </button>
          )}
          {quit}
        </>
      }
      before={nav}
    />
  )
}

interface AssignBarProps {
  editor: Editor
  seq: Sequence
  /** Étape courante (-1 : avant la première étape). */
  index: number
  targets: TLShapeId[]
  /** Appelé avec la séquence enregistrée et l'index de l'étape à afficher ensuite. */
  onAssigned(next: Sequence, nextIndex: number): void
  /** Raccourcis 1 / 2 / 3 (avant / ajouter / après). */
  shortcuts?: boolean
  className?: string
  before?: React.ReactNode
  extra?: React.ReactNode
}

function AssignBar({ editor, seq, index, targets, onAssigned, shortcuts, className = '', before, extra }: AssignBarProps) {
  const t = useT()
  const current = seq.steps[index]
  const appears = appearances(seq)
  const already = [...new Set(targets.flatMap((id) => appears.get(id) ?? []))].sort((a, b) => a - b)

  function save(next: Sequence, nextIndex: number) {
    writeSequence(editor, next)
    onAssigned(next, nextIndex)
  }

  const addToCurrent = () => {
    if (current) save(addTargets(seq, current.id, 'show', targets), index)
  }
  // Objets déjà visés par une action de l'étape courante : on peut les en retirer.
  const selected = new Set<string>(targets)
  const inCurrent = !!current?.actions.some((a) => a.targets.some((id) => selected.has(id)))
  const removeFromCurrent = () => {
    if (current) save(removeTargets(seq, current.id, targets), index)
  }

  // Nouvelle étape à la position `at`, qui fait apparaître les objets.
  const insertAt = (at: number, thenShow: number) => {
    const [next] = addStep(seq, at, {
      title: t.step.newTitle,
      actions: [{ type: 'show', targets, effect: 'fade' }],
    })
    save(next, thenShow)
  }
  const insertBefore = () => {
    if (index >= 0) insertAt(index, index + 1)
  }
  const insertAfter = () => insertAt(index + 1, index + 1)

  // Raccourcis : la dernière version des commandes, sans réabonner le clavier à chaque rendu.
  const commands = useRef({ insertBefore, addToCurrent, insertAfter })
  useEffect(() => {
    commands.current = { insertBefore, addToCurrent, insertAfter }
  })
  useEffect(() => {
    if (!shortcuts) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || isTypingTarget(e.target)) return
      const run = { '1': commands.current.insertBefore, '2': commands.current.addToCurrent, '3': commands.current.insertAfter }[e.key]
      if (!run) return
      e.preventDefault()
      e.stopPropagation()
      run()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [shortcuts])

  const count = t.common.objects(targets.length)
  const key = (k: string) => (shortcuts ? <kbd className="qa-kbd">{k}</kbd> : null)

  return (
    <div
      className={`quick-assign pointer-events-auto absolute left-1/2 z-[600] flex -translate-x-1/2 items-center gap-1 rounded-xl border border-stone-200 bg-white/95 p-1 pl-3 text-xs text-stone-600 shadow-lg backdrop-blur ${className}`}
    >
      {before}
      <span className="mr-1 whitespace-nowrap">
        {count}
        {already.length > 0 && (
          <span className="text-stone-400">{t.quick.alreadyAt(already.join(', '))}</span>
        )}
      </span>
      <button
        className="qa-btn"
        disabled={index < 0}
        onClick={insertBefore}
        title={t.quick.newBeforeHint}
      >
        {key('1')}
        {t.quick.newBefore}
      </button>
      <button
        className="qa-btn qa-btn-primary"
        disabled={!current}
        onClick={addToCurrent}
        title={t.quick.addToStepHint}
      >
        {key('2')}
        {t.quick.addToStep(index + 1)}
      </button>
      {inCurrent && (
        <button className="qa-btn" onClick={removeFromCurrent} title={t.quick.removeFromStepHint}>
          {t.quick.removeFromStep(index + 1)}
        </button>
      )}
      <button
        className="qa-btn"
        onClick={insertAfter}
        title={t.quick.newAfterHint}
      >
        {key('3')}
        {seq.steps.length ? t.quick.newAfter : t.quick.firstStep}
      </button>
      {extra}
    </div>
  )
}

/** Saisie de texte ou geste en cours sur le canevas : la barre attend. */
function useIsBusy(editor: Editor) {
  return useValue('busy', () => !!editor.getEditingShapeId() || !editor.isIn('select.idle'), [editor])
}

/** Tant que le séquençage rapide est actif, mémorise les objets créés par l'utilisateur. */
function usePendingShapes(editor: Editor) {
  useEffect(() => {
    const stop = editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
      if (source === 'user') pendingShapesAtom.set([...pendingShapesAtom.get(), shape.id])
    })
    return () => {
      stop()
      pendingShapesAtom.set([])
    }
  }, [editor])
}

/**
 * Objets en attente qui ont encore besoin d'une étape : toujours présents, pas déjà dans la séquence
 * ni dans un cadre ou groupe qui y est. Sont exclus les groupes et les branches d'arbre
 * (elles suivent leurs nœuds). Les autres flèches sont proposées : liées, elles apparaissent
 * au plus tôt avec leurs extrémités, ou plus tard si on les place à une étape suivante.
 */
export function pendingTargets(editor: Editor): TLShapeId[] {
  const seq = readSequence(editor)
  const appears = seq ? appearanceIndex(seq) : new Map()
  return (pendingShapesAtom.get() as TLShapeId[]).filter((id) => {
    const shape = editor.getShape(id)
    if (!shape || shape.type === 'group' || appears.has(id)) return false
    if (editor.findShapeAncestor(shape, (a) => appears.has(a.id))) return false
    if (shape.type === 'arrow' && shape.meta.branch) return false
    return true
  })
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

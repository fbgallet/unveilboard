'use client'

import { useValue, type Editor, type TLShapeId } from 'tldraw'
import { readSequence, writeSequence } from '@/lib/canvas/adapter'
import {
  addStep,
  addTargets,
  appearanceIndex,
  moveStep,
  removeAction,
  removeStep,
  updateAction,
  updateStep,
} from '@/lib/sequence/edit'
import {
  ACTION_LABELS,
  CAMERA_LABELS,
  EFFECT_LABELS,
  emptySequence,
  type CameraMode,
  type Effect,
  type Sequence,
  type Step,
  type StepActionType,
} from '@/lib/sequence/types'
import { activeStepIdAtom } from '@/lib/presentation/store'
import { enterPresentation } from './usePresentation'

const ADDABLE: StepActionType[] = ['show', 'dim', 'hide', 'undim', 'highlight', 'focus']

export function SequencePanel({ editor }: { editor: Editor }) {
  const seq = useValue('sequence', () => readSequence(editor) ?? emptySequence(), [editor])
  const selection = useValue('selection', () => editor.getSelectedShapeIds(), [editor])
  const activeId = useValue(activeStepIdAtom)
  const appears = appearanceIndex(seq)

  const save = (next: Sequence) => writeSequence(editor, next)
  const activeIndex = seq.steps.findIndex((s) => s.id === activeId)

  function newStepFromSelection() {
    const [next, step] = addStep(seq, activeIndex >= 0 ? activeIndex + 1 : seq.steps.length, {
      actions: selection.length ? [{ type: 'show', targets: selection, effect: 'fade' }] : [],
    })
    save(next)
    activeStepIdAtom.set(step.id)
  }

  const selectionHint =
    selection.length === 1 && appears.has(selection[0])
      ? `Cet objet apparaît à l'étape ${appears.get(selection[0])}.`
      : selection.length
        ? `${selection.length} objet${selection.length > 1 ? 's' : ''} sélectionné${selection.length > 1 ? 's' : ''}.`
        : 'Sélectionnez des objets sur le canevas pour les ajouter à une étape.'

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-zinc-200 bg-zinc-50 text-sm text-zinc-800">
      <header className="flex flex-col gap-2 border-b border-zinc-200 p-3">
        <input
          className="rounded bg-transparent px-1 text-base font-semibold outline-none focus:bg-white"
          value={seq.title}
          onChange={(e) => save({ ...seq, title: e.target.value })}
        />
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={() => enterPresentation(-1)} disabled={!seq.steps.length}>
            ▶ Présenter
          </button>
          <button
            className="btn"
            onClick={() => enterPresentation(activeIndex)}
            disabled={activeIndex < 0}
            title="Présenter à partir de l'étape sélectionnée"
          >
            ▶ Depuis l&apos;étape
          </button>
        </div>
      </header>

      <div className="border-b border-zinc-200 p-3">
        <p className="mb-2 text-xs text-zinc-500">{selectionHint}</p>
        <button className="btn w-full" onClick={newStepFromSelection}>
          + Nouvelle étape{selection.length ? ' (faire apparaître la sélection)' : ''}
        </button>
      </div>

      <ol className="flex-1 space-y-2 overflow-y-auto p-3">
        {seq.steps.map((step, i) => (
          <StepCard
            key={step.id}
            step={step}
            index={i}
            count={seq.steps.length}
            active={step.id === activeId}
            selection={selection}
            onActivate={() => activeStepIdAtom.set(step.id)}
            onChange={(patch) => save(updateStep(seq, step.id, patch))}
            onAdd={(type) => save(addTargets(seq, step.id, type, selection))}
            onRemoveAction={(ai) => save(removeAction(seq, step.id, ai))}
            onEffect={(ai, effect) => save(updateAction(seq, step.id, ai, { effect }))}
            onSelectTargets={(targets) => {
              const ids = (targets as TLShapeId[]).filter((id) => editor.getShape(id))
              editor.select(...ids)
              editor.zoomToSelection({ animation: { duration: 300 } })
            }}
            onMove={(d) => save(moveStep(seq, step.id, d))}
            onDelete={() => save(removeStep(seq, step.id))}
            onPresent={() => enterPresentation(i)}
          />
        ))}
        {!seq.steps.length && (
          <li className="rounded border border-dashed border-zinc-300 p-4 text-center text-zinc-500">
            Aucune étape. Sélectionnez des objets puis « Nouvelle étape ».
          </li>
        )}
      </ol>

      <footer className="border-t border-zinc-200 p-3 text-[11px] leading-relaxed text-zinc-500">
        En présentation : <kbd>→</kbd>/<kbd>Espace</kbd> suivant · <kbd>←</kbd> précédent · <kbd>O</kbd> vue
        d&apos;ensemble · <kbd>C</kbd> recentrer · <kbd>K</kbd> laser · <kbd>N</kbd> narration · <kbd>F</kbd> plein écran ·{' '}
        <kbd>Échap</kbd> quitter
      </footer>
    </aside>
  )
}

interface StepCardProps {
  step: Step
  index: number
  count: number
  active: boolean
  selection: TLShapeId[]
  onActivate(): void
  onChange(patch: Partial<Step>): void
  onAdd(type: StepActionType): void
  onRemoveAction(index: number): void
  onEffect(index: number, effect: Effect): void
  onSelectTargets(targets: string[]): void
  onMove(delta: -1 | 1): void
  onDelete(): void
  onPresent(): void
}

function StepCard(p: StepCardProps) {
  const { step } = p
  return (
    <li
      className={`rounded-lg border bg-white p-2 shadow-sm transition ${
        p.active ? 'border-amber-400 ring-2 ring-amber-200' : 'border-zinc-200 hover:border-zinc-300'
      }`}
      onClick={p.onActivate}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-white">
          {p.index + 1}
        </span>
        <input
          className="min-w-0 flex-1 rounded px-1 font-medium outline-none focus:bg-zinc-100"
          value={step.title}
          onChange={(e) => p.onChange({ title: e.target.value })}
        />
        <div className="flex shrink-0 text-zinc-400">
          <IconBtn title="Monter" disabled={p.index === 0} onClick={() => p.onMove(-1)}>↑</IconBtn>
          <IconBtn title="Descendre" disabled={p.index === p.count - 1} onClick={() => p.onMove(1)}>↓</IconBtn>
          <IconBtn title="Présenter depuis cette étape" onClick={p.onPresent}>▶</IconBtn>
          <IconBtn title="Supprimer l'étape" onClick={p.onDelete}>✕</IconBtn>
        </div>
      </div>

      <ul className="mt-2 space-y-1">
        {step.actions.map((action, ai) => (
          <li key={ai} className="flex items-center gap-2 rounded bg-zinc-50 px-2 py-1 text-xs">
            <span className={`pill pill-${action.type}`}>{ACTION_LABELS[action.type]}</span>
            <button
              className="text-zinc-500 underline decoration-dotted hover:text-zinc-800"
              onClick={(e) => {
                e.stopPropagation()
                p.onSelectTargets(action.targets)
              }}
              title="Sélectionner ces objets sur le canevas"
            >
              {action.targets.length} objet{action.targets.length > 1 ? 's' : ''}
            </button>
            {action.type === 'show' && (
              <select
                className="ml-auto rounded border border-zinc-200 bg-white px-1"
                value={action.effect ?? 'fade'}
                onChange={(e) => p.onEffect(ai, e.target.value as Effect)}
              >
                {Object.entries(EFFECT_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            )}
            <IconBtn
              className={action.type === 'show' ? '' : 'ml-auto'}
              title="Retirer l'action"
              onClick={() => p.onRemoveAction(ai)}
            >
              ✕
            </IconBtn>
          </li>
        ))}
      </ul>

      {p.active && (
        <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap gap-1">
            {ADDABLE.map((type) => (
              <button
                key={type}
                className="btn-xs"
                disabled={!p.selection.length}
                onClick={() => p.onAdd(type)}
                title={p.selection.length ? `Ajouter la sélection : ${ACTION_LABELS[type]}` : 'Sélectionnez des objets'}
              >
                + {ACTION_LABELS[type]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-600">
            Caméra
            <select
              className="rounded border border-zinc-200 bg-white px-1 py-0.5"
              value={step.camera.mode}
              onChange={(e) => p.onChange({ camera: { ...step.camera, mode: e.target.value as CameraMode } })}
            >
              {Object.entries(CAMERA_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </label>
          <textarea
            className="h-28 w-full resize-y rounded border border-zinc-200 p-2 text-xs outline-none focus:border-amber-400"
            placeholder="Narration affichée à la classe (**gras**, *italique*, > citation)"
            value={step.narration}
            onChange={(e) => p.onChange({ narration: e.target.value })}
          />
        </div>
      )}
    </li>
  )
}

function IconBtn({
  children,
  onClick,
  className = '',
  ...rest
}: { children: React.ReactNode; onClick(): void; className?: string; title?: string; disabled?: boolean }) {
  return (
    <button
      {...rest}
      className={`rounded px-1.5 py-0.5 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-30 ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )
}

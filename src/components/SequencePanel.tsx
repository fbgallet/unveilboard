'use client'

import Link from 'next/link'
import { Box, createShapeId, useValue, type Editor, type TLShapeId } from 'tldraw'
import { readSequence, writeSequence } from '@/lib/canvas/adapter'
import { SPOTLIGHT_TYPE } from '@/lib/canvas/spotlight'
import { getTreeIndex } from '@/lib/canvas/tree'
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
import {
  SEQUENCE_PANEL_WIDTH,
  activeStepIdAtom,
  quickSequenceAtom,
  sequencePanelOpenAtom,
  sequencePanelWidthAtom,
  stepBadgesVisibleAtom,
  storeValue,
} from '@/lib/presentation/store'
import { enterPresentation, toggleQuickSequence } from './usePresentation'
import { SyncIndicator } from './SyncIndicator'
import { downloadTldr } from '@/lib/storage/tldrFile'
import { ResizeHandle } from './ResizeHandle'

const ADDABLE: StepActionType[] = ['show', 'dim', 'hide', 'undim', 'highlight', 'focus']
/** Proposées seulement si la sélection contient un nœud d'arbre qui a des enfants. */
const TREE_ACTIONS: StepActionType[] = ['fold', 'unfold']

function toggleStepBadges() {
  const visible = !stepBadgesVisibleAtom.get()
  stepBadgesVisibleAtom.set(visible)
  storeValue('stepBadgesVisible', visible)
}

function setPanelOpen(open: boolean) {
  sequencePanelOpenAtom.set(open)
  storeValue('sequencePanelOpen', open)
}

export function SequencePanel({ editor }: { editor: Editor }) {
  const open = useValue(sequencePanelOpenAtom)
  const width = useValue(sequencePanelWidthAtom)
  if (!open) {
    return (
      <button
        className="flex h-full w-9 shrink-0 flex-col items-center gap-3 border-l border-zinc-200 bg-zinc-50 pt-3 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
        onClick={() => setPanelOpen(true)}
        title="Déplier le panneau des étapes"
        aria-label="Déplier le panneau des étapes"
      >
        <span aria-hidden="true">«</span>
        <span className="text-xs font-medium [writing-mode:vertical-rl]">Séquence</span>
      </button>
    )
  }
  return <SequencePanelContent editor={editor} width={width} />
}

function SequencePanelContent({ editor, width }: { editor: Editor; width: number }) {
  const seq = useValue('sequence', () => readSequence(editor) ?? emptySequence(), [editor])
  const selection = useValue('selection', () => editor.getSelectedShapeIds(), [editor])
  const activeId = useValue(activeStepIdAtom)
  const quickSequence = useValue(quickSequenceAtom)
  const badgesVisible = useValue(stepBadgesVisibleAtom)
  const canFold = useValue('can fold', () => selection.some((id) => getTreeIndex(editor).children.has(id)), [editor, selection])
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

  /** Calque occultant autour de la sélection (ou au centre de la vue), qui apparaît à l'étape active. */
  function addSpotlight() {
    const vp = editor.getViewportPageBounds()
    const box = editor.getSelectionPageBounds()?.clone().expandBy(24) ?? Box.FromCenter(vp.center, { x: vp.w * 0.4, y: vp.h * 0.4 })
    const id = createShapeId()
    editor.createShape({ id, type: SPOTLIGHT_TYPE, x: box.x, y: box.y, props: { w: box.w, h: box.h } })
    editor.select(id)
    if (activeIndex >= 0) save(addTargets(seq, seq.steps[activeIndex].id, 'show', [id]))
  }

  const selectionHint =
    selection.length === 1 && appears.has(selection[0])
      ? `Cet objet apparaît à l'étape ${appears.get(selection[0])}.`
      : selection.length
        ? `${selection.length} objet${selection.length > 1 ? 's' : ''} sélectionné${selection.length > 1 ? 's' : ''}.`
        : 'Sélectionnez des objets sur le canevas pour les ajouter à une étape.'

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-l border-zinc-200 bg-zinc-50 text-sm text-zinc-800"
      style={{ width }}
    >
      <ResizeHandle width={sequencePanelWidthAtom} limits={SEQUENCE_PANEL_WIDTH} storageKey="sequencePanelWidth" />
      <header className="flex flex-col gap-2 border-b border-zinc-200 p-3">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900">
            ← Mes schémas
          </Link>
          <div className="flex items-center gap-2">
            <SyncIndicator />
            <button
              className="rounded px-1.5 text-xs text-zinc-400 hover:bg-zinc-200 hover:text-zinc-900"
              onClick={() => void downloadTldr(editor)}
              title="Télécharger ce schéma (fichier .tldr, séquence comprise) : sauvegarde, transfert, ou ouverture sur tldraw.com"
            >
              Exporter
            </button>
            <button
              className="rounded px-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-900"
              onClick={() => setPanelOpen(false)}
              title="Replier le panneau"
              aria-label="Replier le panneau"
            >
              »
            </button>
          </div>
        </div>
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

      <div className="flex flex-col gap-1.5 border-b border-zinc-200 px-3 py-2">
        <div className="flex items-center gap-0.5">
          <button
            className="btn-ghost"
            onClick={newStepFromSelection}
            title={`Nouvelle étape${activeIndex >= 0 ? ` après l'étape ${activeIndex + 1}` : ''}${selection.length ? ', qui fait apparaître la sélection' : ''}`}
          >
            <Icon name="plus" />
            Étape
          </button>
          <button
            className="btn-ghost"
            onClick={addSpotlight}
            title={`Calque occultant${selection.length ? ' autour de la sélection' : ''}${activeIndex >= 0 ? `, à l'étape ${activeIndex + 1}` : ''}. Pendant la présentation, tout est flouté sauf ce rectangle ; un nouveau calque remplace le précédent, « Cacher » le retire.`}
          >
            <Icon name="spot" />
            Calque
          </button>
          <span className="mx-1 h-4 w-px bg-zinc-200" />
          <button
            className={`btn-ghost ${quickSequence ? 'btn-ghost-on' : ''}`}
            onClick={() => toggleQuickSequence(editor)}
            aria-pressed={quickSequence}
            title="Séquençage rapide : chaque objet créé est proposé à l'étape active, ou à une nouvelle étape avant / après (touches 1, 2, 3). Les objets des étapes suivantes sont estompés."
          >
            <Icon name="bolt" />
            Rapide
          </button>
          <button
            className={`btn-ghost ${badgesVisible ? 'btn-ghost-on' : ''}`}
            onClick={toggleStepBadges}
            aria-pressed={badgesVisible}
            title={badgesVisible ? "Masquer les numéros d'étape sur le canevas" : "Afficher les numéros d'étape sur le canevas"}
          >
            <Icon name="hash" />
            Numéros
          </button>
        </div>
        <p className="px-1 text-[11px] text-zinc-400">{selectionHint}</p>
      </div>

      <ol
        className="flex-1 space-y-2 overflow-y-auto p-3"
        onClick={(e) => {
          if (e.target === e.currentTarget) activeStepIdAtom.set(null)
        }}
      >
        {seq.steps.map((step, i) => (
          <StepCard
            key={step.id}
            step={step}
            index={i}
            count={seq.steps.length}
            active={step.id === activeId}
            selection={selection}
            canFold={canFold}
            onActivate={() => activeStepIdAtom.set(step.id === activeId ? null : step.id)}
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
        d&apos;ensemble · <kbd>C</kbd> recentrer · <kbd>K</kbd> laser · <kbd>M</kbd> calque occultant · <kbd>N</kbd> narration · <kbd>F</kbd> plein écran ·{' '}
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
  canFold: boolean
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
      onClick={(e) => {
        // Sur l'étape active, un clic dans un champ ou un bouton ne la désélectionne pas.
        if (p.active && (e.target as HTMLElement).closest('input, textarea, select, button')) return
        p.onActivate()
      }}
      title={p.active ? 'Cliquer pour désélectionner' : undefined}
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
            {(p.canFold ? [...ADDABLE, ...TREE_ACTIONS] : ADDABLE).map((type) => (
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

const ICONS = {
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  spot: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" strokeDasharray="2 2" />
      <rect x="5.5" y="5.5" width="5" height="5" rx="1" />
    </>
  ),
  bolt: <path d="M9 2 4 9h4l-1 5 5-7H8l1-5Z" strokeLinejoin="round" />,
  hash: <path d="M6 2.5 5 13.5M11 2.5l-1 11M3 6h10.5M2.5 10H13" />,
}

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

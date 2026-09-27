'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { LogoMark } from './Logo'
import { shareDialogOpenAtom } from './ShareDialog'
import { Box, createShapeId, useValue, type Editor, type TLShapeId } from 'tldraw'
import { readSequence, writeSequence } from '@/lib/canvas/adapter'
import { SPOTLIGHT_TYPE } from '@/lib/canvas/spotlight'
import { getTreeIndex } from '@/lib/canvas/tree'
import { noteOf, resolveTextImage, setNote, storeTextImage } from '@/lib/canvas/notes'
import { NatureFields, ReasoningField } from './PresetTools'
import { MarkdownEditor } from './MarkdownEditor'
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
  CAMERA_MODES,
  EFFECTS,
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
import { FileButton, SyncIndicator } from './SyncIndicator'
import { ResizeHandle } from './ResizeHandle'
import { useT } from '@/i18n/client'

const ADDABLE: StepActionType[] = ['show', 'dim', 'hide', 'undim', 'highlight', 'focus']
/** Proposées seulement si la sélection contient un nœud d'arbre qui a des enfants, ou une boîte à détail. */
const TREE_ACTIONS: StepActionType[] = ['fold', 'unfold']
const NOTE_ACTIONS: StepActionType[] = ['note']

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
  const t = useT()
  const open = useValue(sequencePanelOpenAtom)
  const width = useValue(sequencePanelWidthAtom)
  if (!open) {
    return (
      <button
        className="flex h-full w-9 shrink-0 flex-col items-center gap-3 border-l border-zinc-200 bg-zinc-50 pt-3 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
        onClick={() => setPanelOpen(true)}
        title={t.panel.expand}
        aria-label={t.panel.expand}
      >
        <span aria-hidden="true">«</span>
        <span className="text-xs font-medium [writing-mode:vertical-rl]">{t.panel.sequence}</span>
      </button>
    )
  }
  return <SequencePanelContent editor={editor} width={width} />
}

function SequencePanelContent({ editor, width }: { editor: Editor; width: number }) {
  const t = useT()
  const seq = useValue('sequence', () => readSequence(editor) ?? emptySequence(), [editor])
  const selection = useValue('selection', () => editor.getSelectedShapeIds(), [editor])
  const activeId = useValue(activeStepIdAtom)
  const quickSequence = useValue(quickSequenceAtom)
  const badgesVisible = useValue(stepBadgesVisibleAtom)
  const canFold = useValue('can fold', () => selection.some((id) => getTreeIndex(editor).children.has(id)), [editor, selection])
  // Images de la narration et des notes : en ligne, ou ressources du document.
  const images = useMemo(
    () => ({ storeImage: (file: File) => storeTextImage(editor, file), resolveSrc: resolveTextImage(editor) }),
    [editor]
  )
  const canNote = useValue('can note', () => selection.some((id) => !!noteOf(editor.getShape(id))), [editor, selection])
  const appears = appearanceIndex(seq)

  const save = (next: Sequence) => writeSequence(editor, next)
  const activeIndex = seq.steps.findIndex((s) => s.id === activeId)

  function newStepFromSelection() {
    const [next, step] = addStep(seq, activeIndex >= 0 ? activeIndex + 1 : seq.steps.length, {
      title: t.step.defaultTitle(seq.steps.length + 1),
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
      ? t.panel.appearsAtStep(appears.get(selection[0])!)
      : selection.length
        ? t.panel.selected(selection.length)
        : t.panel.selectHint

  const k = t.panel.shortcuts

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-l border-zinc-200 bg-zinc-50 text-sm text-zinc-800"
      style={{ width }}
    >
      <ResizeHandle width={sequencePanelWidthAtom} limits={SEQUENCE_PANEL_WIDTH} storageKey="sequencePanelWidth" />
      <header className="flex flex-col gap-2 border-b border-zinc-200 p-3">
        <div className="flex items-center justify-between">
          <Link href="/" className="group flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-900">
            <LogoMark className="h-5 w-5" />
            {t.panel.back}
          </Link>
          <div className="flex items-center gap-2">
            <SyncIndicator />
            <button
              className="rounded px-1.5 text-xs text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
              onClick={() => shareDialogOpenAtom.set(true)}
              title={t.share.buttonHint}
            >
              {t.share.button}
            </button>
            <FileButton />
            <button
              className="rounded px-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-900"
              onClick={() => setPanelOpen(false)}
              title={t.panel.collapse}
              aria-label={t.panel.collapse}
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
            {t.panel.present}
          </button>
          <button
            className="btn"
            onClick={() => enterPresentation(activeIndex)}
            disabled={activeIndex < 0}
            title={t.panel.presentFromStepHint}
          >
            {t.panel.presentFromStep}
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-1.5 border-b border-zinc-200 px-3 py-2">
        <div className="flex items-center gap-0.5">
          <button
            className="btn-ghost"
            onClick={newStepFromSelection}
            title={t.panel.newStepHint(activeIndex >= 0 ? activeIndex + 1 : null, selection.length > 0)}
          >
            <Icon name="plus" />
            {t.panel.step}
          </button>
          <button
            className="btn-ghost"
            onClick={addSpotlight}
            title={t.panel.spotlightHint(selection.length > 0, activeIndex >= 0 ? activeIndex + 1 : null)}
          >
            <Icon name="spot" />
            {t.panel.spotlight}
          </button>
          <span className="mx-1 h-4 w-px bg-zinc-200" />
          <button
            className={`btn-ghost ${quickSequence ? 'btn-ghost-on' : ''}`}
            onClick={() => toggleQuickSequence(editor)}
            aria-pressed={quickSequence}
            title={t.panel.quickHint}
          >
            <Icon name="bolt" />
            {t.panel.quick}
          </button>
          <button
            className={`btn-ghost ${badgesVisible ? 'btn-ghost-on' : ''}`}
            onClick={toggleStepBadges}
            aria-pressed={badgesVisible}
            title={badgesVisible ? t.panel.hideNumbers : t.panel.showNumbers}
          >
            <Icon name="hash" />
            {t.panel.numbers}
          </button>
        </div>
        <p className="px-1 text-[11px] text-zinc-400">{selectionHint}</p>
        {selection.length === 1 && <NatureFields editor={editor} id={selection[0]} />}
        {selection.length === 1 && <ReasoningField editor={editor} id={selection[0]} />}
        {selection.length === 1 && <NoteEditor editor={editor} id={selection[0]} images={images} />}
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
            images={images}
            step={step}
            index={i}
            count={seq.steps.length}
            active={step.id === activeId}
            selection={selection}
            canFold={canFold}
            canNote={canNote}
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
            {t.panel.noSteps}
          </li>
        )}
      </ol>

      <footer className="border-t border-zinc-200 p-3 text-[11px] leading-relaxed text-zinc-500">
        {k.intro} <kbd>→</kbd>/<kbd>{k.space}</kbd> {k.next} · <kbd>←</kbd> {k.previous} · <kbd>O</kbd> {k.overview} ·{' '}
        <kbd>C</kbd> {k.recenter} · <kbd>K</kbd> {k.laser} · <kbd>M</kbd> {k.mask} · <kbd>N</kbd> {k.narration} · <kbd>+</kbd>/<kbd>−</kbd> {k.textSize} · <kbd>L</kbd> {k.legend} ·{' '}
        <kbd>F</kbd> {k.fullscreen} · <kbd>{k.esc}</kbd> {k.exit}
      </footer>
    </aside>
  )
}

interface StepCardProps {
  images: TextImages
  step: Step
  index: number
  count: number
  active: boolean
  selection: TLShapeId[]
  canFold: boolean
  canNote: boolean
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
  const t = useT()
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
      title={p.active ? t.step.deselect : undefined}
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
          <IconBtn title={t.common.moveUp} disabled={p.index === 0} onClick={() => p.onMove(-1)}>↑</IconBtn>
          <IconBtn title={t.common.moveDown} disabled={p.index === p.count - 1} onClick={() => p.onMove(1)}>↓</IconBtn>
          <IconBtn title={t.step.presentFrom} onClick={p.onPresent}>▶</IconBtn>
          <IconBtn title={t.step.delete} onClick={p.onDelete}>✕</IconBtn>
        </div>
      </div>

      <ul className="mt-2 space-y-1">
        {step.actions.map((action, ai) => (
          <li key={ai} className="flex items-center gap-2 rounded bg-zinc-50 px-2 py-1 text-xs">
            <span className={`pill pill-${action.type}`}>{t.actions[action.type]}</span>
            <button
              className="text-zinc-500 underline decoration-dotted hover:text-zinc-800"
              onClick={(e) => {
                e.stopPropagation()
                p.onSelectTargets(action.targets)
              }}
              title={t.step.selectTargets}
            >
              {t.common.objects(action.targets.length)}
            </button>
            {action.type === 'show' && (
              <select
                className="ml-auto rounded border border-zinc-200 bg-white px-1"
                value={action.effect ?? 'fade'}
                onChange={(e) => p.onEffect(ai, e.target.value as Effect)}
              >
                {EFFECTS.map((k) => (
                  <option key={k} value={k}>{t.effects[k]}</option>
                ))}
              </select>
            )}
            <IconBtn
              className={action.type === 'show' ? '' : 'ml-auto'}
              title={t.step.removeAction}
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
            {[...ADDABLE, ...(p.canFold ? TREE_ACTIONS : []), ...(p.canNote ? NOTE_ACTIONS : [])].map((type) => (
              <button
                key={type}
                className="btn-xs"
                disabled={!p.selection.length}
                onClick={() => p.onAdd(type)}
                title={p.selection.length ? t.step.addSelection(t.actions[type]) : t.step.selectObjects}
              >
                + {t.actions[type]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-600">
            {t.step.camera}
            <select
              className="rounded border border-zinc-200 bg-white px-1 py-0.5"
              value={step.camera.mode}
              onChange={(e) => p.onChange({ camera: { ...step.camera, mode: e.target.value as CameraMode } })}
            >
              {CAMERA_MODES.map((k) => (
                <option key={k} value={k}>{t.camera[k]}</option>
              ))}
            </select>
          </label>
          <MarkdownEditor
            value={step.narration}
            onChange={(narration) => p.onChange({ narration })}
            placeholder={t.step.narrationPlaceholder}
            rows={6}
            title={step.title}
            {...p.images}
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

/** Note de l'objet sélectionné : affichée dans le panneau de narration pendant la présentation. */
interface TextImages {
  storeImage(file: File): Promise<string>
  resolveSrc(src: string): string | undefined
}

function NoteEditor({ editor, id, images }: { editor: Editor; id: TLShapeId; images: TextImages }) {
  const t = useT()
  const note = useValue('note', () => noteOf(editor.getShape(id)), [editor, id])
  return (
    <div className="mt-1 flex flex-col gap-1 px-1 text-[11px] text-zinc-500">
      {t.panel.note}
      <MarkdownEditor
        value={note}
        onChange={(text) => setNote(editor, id, text)}
        placeholder={t.panel.notePlaceholder}
        rows={note ? 5 : 2}
        title={t.panel.note}
        {...images}
      />
    </div>
  )
}

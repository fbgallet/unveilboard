'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import Link from 'next/link'
import { LogoMark } from './Logo'
import { shareDialogOpenAtom } from './ShareDialog'
import { Box, createShapeId, useValue, type Editor, type TLShapeId } from 'tldraw'
import { readSequence, writeSequence } from '@/lib/canvas/adapter'
import { SPOTLIGHT_TYPE } from '@/lib/canvas/spotlight'
import { getTreeIndex } from '@/lib/canvas/tree'
import { noteOf, resolveTextImage, setNote, shapeLabel, storeTextImage } from '@/lib/canvas/notes'
import { NatureFields, ProvenanceField, ReasoningField } from './PresetTools'
import { MarkdownEditor } from './MarkdownEditor'
import { QUICK, elementAiAtom, elementAiRequestAtom } from './ElementAi'
import { openAssistant } from './MapJsonDialog'
import { ChatPane } from './ChatPane'
import { Markdownish } from './Markdownish'
import {
  addStep,
  addTargets,
  appearances,
  moveStep,
  removeAction,
  removeStep,
  updateAction,
  stepUses,
  updateStep,
} from '@/lib/sequence/edit'
import {
  CAMERA_MODES,
  EFFECTS,
  emptySequence,
  type Area,
  type CameraMode,
  type Effect,
  type Sequence,
  type Step,
  type StepActionType,
} from '@/lib/sequence/types'
import {
  SEQUENCE_PANEL_WIDTH,
  NARRATION_SCALE,
  activeStepIdAtom,
  changeElementScale,
  elementScaleAtom,
  noteEditingAtom,
  panelTabAtom,
  type PanelTab,
  quickSequenceAtom,
  sequencePanelOpenAtom,
  sequencePanelWidthAtom,
  stepBadgesVisibleAtom,
  storeValue,
} from '@/lib/presentation/store'
import { enterPresentation, toggleQuickSequence } from './usePresentation'
import { FileButton, SyncIndicator } from './SyncIndicator'
import { ResizeHandle } from './ResizeHandle'
import { readPageSource } from '@/lib/canvas/source'
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

const PANEL_TABS = ['sequence', 'element', 'chat'] as const satisfies readonly PanelTab[]
const TAB_ICONS = { sequence: 'steps', element: 'element', chat: 'chat' } as const

function tabLabel(t: ReturnType<typeof useT>, id: PanelTab) {
  return id === 'sequence' ? t.panel.sequence : id === 'element' ? t.panel.element : t.panel.chat
}

function setPanelOpen(open: boolean) {
  sequencePanelOpenAtom.set(open)
  storeValue('sequencePanelOpen', open)
}

export function SequencePanel({ editor }: { editor: Editor }) {
  const t = useT()
  const open = useValue(sequencePanelOpenAtom)
  const width = useValue(sequencePanelWidthAtom)
  const tab = useValue(panelTabAtom)
  if (!open) {
    // Replié : le logo reste un chemin vers la liste des schémas ; chaque onglet rouvre le panneau sur lui.
    return (
      <div className="flex h-full w-9 shrink-0 flex-col items-center border-l border-zinc-200 bg-zinc-50">
        <Link href="/" className="group pt-2.5 pb-1" title={t.nav.home} aria-label={t.nav.home}>
          <LogoMark className="h-5 w-5" />
        </Link>
        <button
          className="w-full py-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          onClick={() => setPanelOpen(true)}
          title={t.panel.expand}
          aria-label={t.panel.expand}
        >
          <span aria-hidden="true">«</span>
        </button>
        <nav className="flex w-full flex-col items-center gap-1 px-1" aria-label={t.panel.tabs}>
          {PANEL_TABS.map((id) => (
            <button
              key={id}
              className={`panel-rail-tab ${tab === id ? 'panel-rail-tab-active' : ''}`}
              onClick={() => {
                panelTabAtom.set(id)
                setPanelOpen(true)
              }}
              aria-current={tab === id}
              title={`${tabLabel(t, id)} · ${t.panel.expand}`}
            >
              <Icon name={TAB_ICONS[id]} />
              <span className="[writing-mode:vertical-rl]">{tabLabel(t, id)}</span>
            </button>
          ))}
        </nav>
        {/* Le reste de la bande rouvre aussi le panneau. */}
        <button className="w-full flex-1 hover:bg-zinc-100" onClick={() => setPanelOpen(true)} tabIndex={-1} aria-hidden="true" />
      </div>
    )
  }
  return <SequencePanelContent editor={editor} width={width} />
}

function SequencePanelContent({ editor, width }: { editor: Editor; width: number }) {
  const t = useT()
  const seq = useValue('sequence', () => readSequence(editor) ?? emptySequence(), [editor])
  const hasSource = useValue('has source', () => !!readPageSource(editor), [editor])
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
  const tab = useValue(panelTabAtom)
  const canNote = useValue('can note', () => selection.some((id) => !!noteOf(editor.getShape(id))), [editor, selection])
  const appears = appearances(seq)
  const uses = stepUses(seq)
  // Document à plusieurs pages : chaque page a sa séquence (le titre reste celui du document).
  const pageName = useValue('page name', () => (editor.getPages().length > 1 ? editor.getCurrentPage().name : null), [editor])

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

  /**
   * Zone caméra : la sélection avec une petite marge, ou ce que montre le canevas, un peu en retrait
   * de ses bords pour que le cadre et ses poignées restent visibles et saisissables (hors des menus).
   */
  function areaFrom(source: 'view' | 'selection'): Area {
    const selected = source === 'selection' ? editor.getSelectionPageBounds()?.clone().expandBy(32) : null
    const view = editor.getViewportPageBounds()
    const { x, y, w, h } = selected ?? view.clone().expandBy(-Math.min(view.w, view.h) * 0.08)
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
  }

  const selectionUsage = () => {
    const id = selection[0]
    const shown = appears.get(id) ?? []
    const others = (uses.get(id) ?? []).filter((n) => !shown.includes(n))
    return [shown.length ? t.panel.appearsAtStep(shown) : '', others.length ? t.panel.usedAtSteps(others) : ''].filter(Boolean).join(' ')
  }
  const selectionHint =
    selection.length === 1 && uses.has(selection[0])
      ? selectionUsage()
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
      <header className="flex flex-col gap-2.5 border-b border-zinc-200 p-3">
        <div className="flex items-center justify-between">
          <Link href="/" className="group flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-900" title={t.nav.home}>
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
        {/* Titre du document (toutes ses pages) : nom du schéma dans la liste et du fichier .tldr. */}
        <input
          className="-mt-0.5 rounded bg-transparent px-1 text-base font-semibold outline-none hover:bg-zinc-100 focus:bg-white"
          value={seq.title}
          onChange={(e) => save({ ...seq, title: e.target.value })}
          aria-label={t.panel.titleLabel}
          title={t.panel.titleHint}
          placeholder={t.common.untitled}
        />
        <nav className="panel-tabs" role="tablist" aria-label={t.panel.tabs}>
          {PANEL_TABS.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`panel-tab ${tab === id ? 'panel-tab-active' : ''}`}
              onClick={() => panelTabAtom.set(id)}
            >
              <Icon name={TAB_ICONS[id]} />
              {tabLabel(t, id)}
              {id === 'element' && canNote && selection.length === 1 && (
                <span className="panel-tab-badge" title={t.panel.hasNote}>
                  ¶
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>
      {tab === 'chat' ? (
        <ChatPane editor={editor} />
      ) : tab === 'element' ? (
        <ElementPane editor={editor} selection={selection} usage={selection.length === 1 && uses.has(selection[0]) ? selectionUsage() : ''} images={images} />
      ) : (
      <>
      <div className="flex flex-col gap-2 border-b border-zinc-200 px-3 py-3">
        {pageName !== null && <p className="px-1 text-[11px] text-zinc-400">{t.panel.pageSteps(pageName)}</p>}
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
      </div>
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
      </div>

      <ol
        className="flex-1 space-y-2 overflow-y-auto p-3"
        onClick={(e) => {
          if (e.target === e.currentTarget) activeStepIdAtom.set(null)
        }}
      >
        <StartCard
          intro={seq.intro ?? ''}
          images={images}
          onChange={(intro) => save({ ...seq, intro: intro || undefined })}
          onPresent={() => enterPresentation(-1)}
          sourceText={hasSource ? { value: !!seq.sourceText, onChange: (on) => save({ ...seq, sourceText: on || undefined }) } : undefined}
        />
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
            onCaptureArea={(source) => save(updateStep(seq, step.id, { camera: { ...step.camera, mode: 'area', area: areaFrom(source) } }))}
            onShowArea={(area) => editor.zoomToBounds(Box.From(area), { inset: 0, animation: { duration: 300 } })}
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
      </>
      )}
    </aside>
  )
}

/**
 * Départ de la présentation, avant la première étape : le titre du schéma et un texte d'accueil
 * facultatif (consigne, question posée, plan de la séance). Replié, il n'en montre que la première ligne.
 */
function StartCard(p: {
  intro: string
  images: TextImages
  onChange(intro: string): void
  onPresent(): void
  /** Page avec un texte source : l'afficher ou non au lancement de la présentation. */
  sourceText?: { value: boolean; onChange(on: boolean): void }
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const firstLine = p.intro.split('\n').find((l) => l.trim())?.trim()
  return (
    <li
      data-start
      className={`rounded-lg border border-dashed bg-white/60 p-2 transition ${open ? 'border-amber-400' : 'border-zinc-300 hover:border-zinc-400'}`}
      onClick={() => setOpen(!open)}
      title={t.step.startHint}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-400 text-[10px] text-amber-600" aria-hidden>
          ▶
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{t.step.startTitle}</span>
        <div className="flex shrink-0 text-zinc-400">
          <IconBtn title={t.step.presentFromStart} onClick={p.onPresent}>▶</IconBtn>
        </div>
      </div>
      {!open && (
        <p className={`mt-1 truncate px-1 text-xs ${firstLine ? 'text-zinc-600' : 'text-zinc-400'}`}>{firstLine ?? t.step.introEmpty}</p>
      )}
      {open && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <MarkdownEditor
            value={p.intro}
            onChange={p.onChange}
            placeholder={t.step.introPlaceholder}
            rows={4}
            title={t.step.startTitle}
            {...p.images}
          />
          {p.sourceText && (
            <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
              <input type="checkbox" checked={p.sourceText.value} onChange={(e) => p.sourceText!.onChange(e.target.checked)} />
              {t.source.showWhenPresenting}
            </label>
          )}
        </div>
      )}
    </li>
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
  onCaptureArea(source: 'view' | 'selection'): void
  onShowArea(area: Area): void
}

function StepCard(p: StepCardProps) {
  const t = useT()
  const { step } = p
  return (
    <li
      data-step={p.index + 1}
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
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            <label className="flex items-center gap-2">
              {t.step.camera}
              <select
                className="rounded border border-zinc-200 bg-white px-1 py-0.5"
                value={step.camera.mode}
                onChange={(e) => {
                  const mode = e.target.value as CameraMode
                  // Zone définie : d'emblée la sélection, ou à défaut la vue actuelle ; ajustable ensuite.
                  if (mode === 'area' && !step.camera.area) p.onCaptureArea(p.selection.length ? 'selection' : 'view')
                  else p.onChange({ camera: { ...step.camera, mode } })
                }}
              >
                {CAMERA_MODES.map((k) => (
                  <option key={k} value={k}>{t.camera[k]}</option>
                ))}
              </select>
            </label>
            {step.camera.mode === 'area' && (
              <span className="flex items-center gap-1">
                <button className="btn-xs" onClick={() => p.onCaptureArea('view')} title={t.step.areaFromViewHint}>
                  {t.step.areaFromView}
                </button>
                <button
                  className="btn-xs"
                  disabled={!p.selection.length}
                  onClick={() => p.onCaptureArea('selection')}
                  title={p.selection.length ? t.step.areaFromSelectionHint : t.step.selectObjects}
                >
                  {t.step.areaFromSelection}
                </button>
                {step.camera.area && (
                  <button className="btn-xs" onClick={() => p.onShowArea(step.camera.area!)} title={t.step.areaGoHint}>
                    {t.step.areaGo}
                  </button>
                )}
              </span>
            )}
          </div>
          {step.camera.mode === 'area' && <p className="text-[11px] leading-snug text-zinc-400">{t.step.areaFitNote}</p>}
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
  steps: <path d="M3 4h10M3 8h10M3 12h6" />,
  element: <rect x="2.5" y="4" width="11" height="8" rx="2" />,
  locate: (
    <>
      <circle cx="8" cy="8" r="4.5" />
      <path d="M8 1.5v2.5M8 12v2.5M1.5 8H4M12 8h2.5" />
    </>
  ),
  pencil: <path d="M10.5 3 13 5.5 6 12.5H3.5V10L10.5 3Z" strokeLinejoin="round" />,
  check: <path d="m3.5 8.5 3 3 6-7" strokeLinejoin="round" />,
  chat: <path d="M3 3.5h10v7H7l-3 2.5v-2.5H3Z" strokeLinejoin="round" />,
  sparkle: <path d="M8 2.5 9.3 6.7 13.5 8 9.3 9.3 8 13.5 6.7 9.3 2.5 8 6.7 6.7Z" strokeLinejoin="round" />,
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

interface TextImages {
  storeImage(file: File): Promise<string>
  resolveSrc(src: string): string | undefined
}

/**
 * Onglet Élément : ce qui appartient à l'objet sélectionné, indépendamment de la séquence
 * (nature, provenance, raisonnement d'une relation, note).
 */
function ElementPane(p: { editor: Editor; selection: TLShapeId[]; usage: string; images: TextImages }) {
  const t = useT()
  const id = p.selection.length === 1 ? p.selection[0] : null
  const pane = useRef<HTMLDivElement>(null)
  useCtrlWheel(pane, changeElementScale, id)
  const title = useValue('element title', () => (id ? shapeLabel(p.editor, p.editor.getShape(id)!) : ''), [p.editor, id])
  // L'IA part d'une boîte (pas d'une flèche, d'un dessin ou d'une image).
  const isBox = useValue('element is box', () => !!id && p.editor.getShape(id)?.type === 'geo', [p.editor, id])
  if (!id) {
    return (
      <p className="p-4 text-[12px] leading-relaxed text-zinc-500">
        {p.selection.length ? t.panel.elementMany(p.selection.length) : t.panel.elementHint}
      </p>
    )
  }
  return (
    <div ref={pane} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
      <div className="flex items-center gap-1 px-1">
        <h2 className="min-w-0 flex-1 truncate font-medium text-zinc-900" title={title}>
          {title || t.panel.elementUntitled}
        </h2>
        <button
          className="icon-btn"
          onClick={() => p.editor.zoomToSelection({ animation: { duration: 300 } })}
          title={t.panel.noteLocate}
          aria-label={t.panel.noteLocate}
        >
          <Icon name="locate" />
        </button>
        {isBox && <ElementAiMenu id={id} />}
      </div>
      {p.usage && <p className="px-1 text-[11px] text-zinc-400">{p.usage}</p>}
      <NatureFields editor={p.editor} id={id} />
      <ProvenanceField editor={p.editor} id={id} />
      <ReasoningField editor={p.editor} id={id} />
      <NoteSection key={id} editor={p.editor} id={id} images={p.images} />
    </div>
  )
}

/**
 * Note de l'objet : lecture (comme en présentation), ou saisie. Elle appartient à l'objet,
 * pas à la séquence : en présentation, elle s'ouvre au double-clic ou à une étape « Afficher la note ».
 */
function NoteSection(p: { editor: Editor; id: TLShapeId; images: TextImages }) {
  const t = useT()
  const note = useValue('note', () => noteOf(p.editor.getShape(p.id)), [p.editor, p.id])
  // Saisie : ouverte ici, ou demandée par le menu contextuel (« Ajouter une note »).
  const requested = useValue(noteEditingAtom) === p.id
  const scale = useValue(elementScaleAtom)
  const [open, setOpen] = useState(false)
  const editing = open || requested
  const setEditing = (on: boolean) => {
    setOpen(on)
    if (!on) noteEditingAtom.set(null)
  }
  return (
    <section
      className="element-note mt-2 flex flex-col gap-2 border-t border-zinc-200 px-1 pt-3"
      style={{ '--element-scale': scale / 100 } as CSSProperties}
    >
      <div className="flex items-center gap-0.5">
        <h3 className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">¶ {t.panel.note}</h3>
        {/* Taille du texte (aussi : Ctrl + molette au-dessus de l'onglet), comme pour la narration */}
        {scale !== NARRATION_SCALE.default && (
          <button className="btn-ghost tabular-nums" onClick={() => changeElementScale(null)} title={t.panel.textReset}>
            {scale} %
          </button>
        )}
        <button className="btn-ghost" onClick={() => changeElementScale(-1)} title={t.presenter.textSmaller}>
          A−
        </button>
        <button className="btn-ghost" onClick={() => changeElementScale(1)} title={t.presenter.textLarger}>
          A+
        </button>
        {(note || editing) && (
          <button
            className={`icon-btn ${editing ? 'icon-btn-on' : ''}`}
            onClick={() => setEditing(!editing)}
            aria-pressed={editing}
            title={editing ? t.panel.noteDone : t.panel.noteEdit}
            aria-label={editing ? t.panel.noteDone : t.panel.noteEdit}
          >
            <Icon name={editing ? 'check' : 'pencil'} />
          </button>
        )}
      </div>
      {editing ? (
        <MarkdownEditor
          value={note}
          onChange={(text) => setNote(p.editor, p.id, text)}
          placeholder={t.panel.notePlaceholder}
          rows={10}
          title={t.panel.note}
          label={t.panel.note}
          {...p.images}
        />
      ) : note ? (
        <div className="space-y-[0.75em] leading-relaxed text-zinc-700" style={{ fontSize: `${(14 * scale) / 100}px` }}>
          <Markdownish text={note} resolveSrc={p.images.resolveSrc} />
        </div>
      ) : (
        <button className="btn self-start text-xs" onClick={() => setEditing(true)} title={t.panel.notePlaceholder}>
          {t.panel.addNote}
        </button>
      )}
    </section>
  )
}

/** Ctrl + molette (ou pincement sur un trackpad) au-dessus d'un élément : taille du texte. */
function useCtrlWheel(ref: RefObject<HTMLElement | null>, change: (delta: number) => void, dep: unknown) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let acc = 0
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      acc += e.deltaY
      if (Math.abs(acc) < 40) return
      change(acc > 0 ? -1 : 1)
      acc = 0
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref, change, dep])
}

/** Menu ✦ de l'onglet Élément : demandes toutes faites à l'IA à partir de l'objet, ou demande libre. */
function ElementAiMenu({ id }: { id: TLShapeId }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const ask = (request = '') => {
    setOpen(false)
    // Le panneau de l'IA lit la demande préremplie à son ouverture : on le rouvre au besoin.
    elementAiRequestAtom.set(request)
    elementAiAtom.set(null)
    setTimeout(() => elementAiAtom.set(id))
  }
  return (
    <div ref={root} className="relative shrink-0">
      <button className={`btn-ghost ${open ? 'btn-ghost-on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" title={t.elementAi.buttonHint}>
        <Icon name="sparkle" />
        {t.panel.elementAi}
      </button>
      {open && (
        <div className="panel-menu" role="menu">
          {QUICK.map((k) => (
            <button key={k} role="menuitem" onClick={() => ask(t.elementAi.quick[k].request)}>
              {t.elementAi.quick[k].label}
            </button>
          ))}
          <hr />
          <button role="menuitem" onClick={() => ask()}>
            {t.panel.elementAiFree}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              openAssistant('style')
            }}
          >
            {t.styleAi.menu}
          </button>
        </div>
      )}
    </div>
  )
}

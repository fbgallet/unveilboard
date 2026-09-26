'use client'

import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import { renderPlaintextFromRichText, useEditor, useValue, type Editor, type TLRichText, type TLShape, type TLShapeId } from 'tldraw'
import { noteOf } from '@/lib/canvas/notes'
import { presetById, swatchColor } from '@/lib/canvas/presets'
import type { Step } from '@/lib/sequence/types'
import { readSequence } from '@/lib/canvas/adapter'
import {
  DEFAULT_LASER,
  LASER_COLORS,
  NARRATION_WIDTH,
  editUnlockedAtom,
  laserPopoverOpenAtom,
  laserSettingsAtom,
  liveSpotAtom,
  spotToolAtom,
  updateLaserSettings,
  narrationVisibleAtom,
  narrationWidthAtom,
  narrationScaleAtom,
  changeNarrationScale,
  openedNotesAtom,
  legendVisibleAtom,
  shapeClassesAtom,
  toggleOpenedNote,
  overviewAtom,
  stepIndexAtom,
} from '@/lib/presentation/store'
import {
  clearLiveSpot,
  exitPresentation,
  goToStep,
  recenter,
  recenterAfterResize,
  toggleFullscreen,
  toggleLaser,
  toggleNarration,
  toggleOverview,
  toggleSpotTool,
  toggleUnlocked,
} from './usePresentation'
import { ResizeHandle } from './ResizeHandle'
import { useLocale, useT } from '@/i18n/client'

export function NarrationPanel({ editor }: { editor: Editor }) {
  const t = useT()
  const seq = useValue('sequence', () => readSequence(editor), [editor])
  const index = useValue(stepIndexAtom)
  const visible = useValue(narrationVisibleAtom)
  const width = useValue(narrationWidthAtom)
  const scale = useValue(narrationScaleAtom)
  if (!seq || !visible) return null
  const step = seq.steps[index]

  return (
    <aside
      className="narration relative flex h-full shrink-0 flex-col border-l border-stone-200 bg-stone-50 px-10 py-12"
      style={{ width }}
    >
      <ResizeHandle
        width={narrationWidthAtom}
        limits={NARRATION_WIDTH}
        storageKey="narrationWidth"
        onResized={recenterAfterResize}
      />
      <div className="absolute right-3 top-3 flex items-center gap-0.5">
        {/* Taille du texte (aussi : touches +, − et 0) */}
        <button className="pbtn narration-size" onClick={() => changeNarrationScale(-1)} title={t.presenter.textSmaller}>
          A−
        </button>
        <button className="pbtn narration-size" onClick={() => changeNarrationScale(1)} title={`${t.presenter.textLarger} · ${t.presenter.textReset}`}>
          A+
        </button>
        <button className="pbtn" onClick={toggleNarration} title={t.presenter.hideNarration} aria-label={t.presenter.hideNarrationLabel}>
          <Icon name="close" />
        </button>
      </div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">{seq.title}</p>
      {/* key : relance l'animation d'entrée du texte à chaque étape */}
      <div
        key={step?.id ?? 'start'}
        className="narration-body mt-8 flex-1 overflow-y-auto"
        style={{ fontSize: `${scale / 100}rem` }}
      >
        {/* Tailles en em : elles suivent le réglage de taille du texte. */}
        {step ? (
          <>
            <h2 className="font-serif text-[1.875em] leading-tight text-stone-900">{step.title}</h2>
            <div className="mt-[1.5em] space-y-[1em] text-[1.25em] leading-relaxed text-stone-700">
              <Markdownish text={step.narration} />
            </div>
          </>
        ) : (
          <h2 className="font-serif text-[2.25em] leading-tight text-stone-900">{seq.title}</h2>
        )}
        <ObjectNotes editor={editor} step={step} />
      </div>
    </aside>
  )
}

export function ProgressBar({ editor }: { editor: Editor }) {
  const t = useT()
  const seq = useValue('sequence', () => readSequence(editor), [editor])
  const index = useValue(stepIndexAtom)
  const overview = useValue(overviewAtom)
  const narration = useValue(narrationVisibleAtom)
  const unlocked = useValue(editUnlockedAtom)
  const laser = useValue('laser', () => editor.getCurrentToolId() === 'laser', [editor])
  if (!seq) return null
  const total = seq.steps.length

  return (
    <div className="progress pointer-events-auto absolute inset-x-0 bottom-0 z-[500] flex items-center gap-3 py-2 pl-16 pr-44 text-xs text-stone-500">
      <ToolBtn onClick={() => goToStep(editor, index - 1)} disabled={index < 0} title={t.presenter.previous} icon="prev" />
      <div className="flex flex-1 items-center gap-1">
        {seq.steps.map((s, i) => (
          <button
            key={s.id}
            onClick={() => goToStep(editor, i)}
            title={`${i + 1}. ${s.title}`}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < index ? 'bg-stone-400' : i === index ? 'bg-amber-500' : 'bg-stone-200 hover:bg-stone-300'
            }`}
          />
        ))}
      </div>
      <span className="tabular-nums">
        {Math.max(index + 1, 0)} / {total}
      </span>
      <ToolBtn
        onClick={() => goToStep(editor, index + 1)}
        disabled={index >= total - 1}
        title={t.presenter.next}
        icon="next"
      />

      <div className="tools flex items-center gap-0.5 border-l border-stone-200 pl-2">
        <ToolBtn onClick={toggleOverview} active={overview} title={t.presenter.overview} icon="overview" />
        <ToolBtn onClick={recenter} title={t.presenter.recenter} icon="recenter" />
        <LaserControl editor={editor} active={laser} />
        <SpotControl editor={editor} />
        <ToolBtn
          onClick={toggleUnlocked}
          active={unlocked}
          title={unlocked ? t.presenter.lock : t.presenter.unlock}
          icon={unlocked ? 'unlocked' : 'locked'}
        />
        <ToolBtn onClick={toggleNarration} active={narration} title={t.presenter.narration} icon="panel" />
        <ToolBtn onClick={toggleFullscreen} title={t.presenter.fullscreen} icon="fullscreen" />
        <ToolBtn onClick={exitPresentation} title={t.presenter.exit} icon="close" />
      </div>
    </div>
  )
}

function LaserControl({ editor, active }: { editor: Editor; active: boolean }) {
  const t = useT()
  const [locale] = useLocale()
  const open = useValue(laserPopoverOpenAtom)
  const settings = useValue(laserSettingsAtom)
  const ref = useRef<HTMLDivElement>(null)

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) laserPopoverOpenAtom.set(false)
    }
    window.addEventListener('pointerdown', onDown, { capture: true })
    return () => window.removeEventListener('pointerdown', onDown, { capture: true })
  }, [open])

  return (
    <div ref={ref} className="relative flex items-center">
      <ToolBtn onClick={() => toggleLaser(editor)} active={active} title={t.laser.pointer} icon="laser" />
      <button
        className={`laser-caret ${open ? 'text-stone-900' : ''}`}
        onClick={() => laserPopoverOpenAtom.set(!open)}
        title={t.laser.settings}
        aria-label={t.laser.settings}
        aria-expanded={open}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
          <path d="m6 15 6-6 6 6" />
        </svg>
      </button>

      {open && (
        <div className="laser-popover" role="dialog" aria-label={t.laser.settings}>
          <LaserPreview color={settings.color} width={settings.width} />

          <p className="lp-label">{t.laser.color}</p>
          <div className="flex gap-1.5">
            {LASER_COLORS.map((c) => (
              <button
                key={c}
                className={`lp-swatch ${settings.color === c ? 'lp-swatch-active' : ''}`}
                style={{ background: c, boxShadow: `0 0 8px ${c}` }}
                onClick={() => updateLaserSettings({ color: c })}
                aria-label={t.laser.colorValue(c)}
              />
            ))}
            <label className="lp-swatch lp-custom" title={t.laser.otherColor}>
              <input
                type="color"
                value={settings.color}
                onChange={(e) => updateLaserSettings({ color: e.target.value })}
                aria-label={t.laser.customColor}
              />
            </label>
          </div>

          <p className="lp-label">
            {t.laser.width} <span>{settings.width} px</span>
          </p>
          <input
            type="range"
            min={2}
            max={16}
            step={1}
            value={settings.width}
            onChange={(e) => updateLaserSettings({ width: Number(e.target.value) })}
            className="lp-range"
          />

          <p className="lp-label">
            {t.laser.fadeAfter} <span>{(settings.delayMs / 1000).toLocaleString(locale)} s</span>
          </p>
          <input
            type="range"
            min={300}
            max={8000}
            step={100}
            value={settings.delayMs}
            onChange={(e) => updateLaserSettings({ delayMs: Number(e.target.value) })}
            className="lp-range"
          />

          <button className="lp-reset" onClick={() => updateLaserSettings(DEFAULT_LASER)}>
            {t.laser.reset}
          </button>
        </div>
      )}
    </div>
  )
}

/** Calque occultant à la volée, avec un bouton pour le retirer quand il est posé. */
function SpotControl({ editor }: { editor: Editor }) {
  const t = useT()
  const tool = useValue(spotToolAtom)
  const live = useValue(liveSpotAtom)
  return (
    <div className="relative flex items-center">
      <ToolBtn
        onClick={() => toggleSpotTool(editor)}
        active={tool || !!live}
        title={tool ? t.spotlight.finish : t.spotlight.draw}
        icon="spot"
      />
      {live && (
        <button className="spot-clear" onClick={clearLiveSpot} title={t.spotlight.remove} aria-label={t.spotlight.removeLabel}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

/** Aperçu du faisceau avec les réglages courants. */
function LaserPreview({ color, width }: { color: string; width: number }) {
  const d = 'M 12 30 C 60 4, 110 52, 196 18'
  return (
    <svg className="lp-preview" viewBox="0 0 208 44" aria-hidden="true">
      <path d={d} stroke={color} strokeWidth={width * 1.8} opacity="0.3" style={{ filter: `blur(${width * 0.6}px)` }} />
      <path d={d} stroke={color} strokeWidth={width} opacity="0.9" style={{ filter: `drop-shadow(0 0 ${width * 0.3}px ${color})` }} />
    </svg>
  )
}

function ToolBtn({
  icon,
  onClick,
  title,
  active = false,
  disabled = false,
}: {
  icon: IconName
  onClick(): void
  title: string
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      className={`pbtn ${active ? 'pbtn-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active || undefined}
    >
      <Icon name={icon} />
    </button>
  )
}

type IconName =
  | 'prev'
  | 'next'
  | 'overview'
  | 'recenter'
  | 'laser'
  | 'spot'
  | 'locked'
  | 'unlocked'
  | 'panel'
  | 'fullscreen'
  | 'close'

const ICONS: Record<IconName, ReactNode> = {
  prev: <path d="m15 18-6-6 6-6" />,
  next: <path d="m9 18 6-6-6-6" />,
  overview: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5M8 11h6" />
    </>
  ),
  recenter: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  laser: (
    <>
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  spot: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2.5" strokeDasharray="2.5 3" />
      <rect x="7.5" y="8" width="9" height="8" rx="1.5" />
    </>
  ),
  locked: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  unlocked: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.9-1" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  fullscreen: <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
}

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  )
}

/** Rendu minimal : paragraphes, > citations, **gras**, *italique*. */
function Markdownish({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim())
  return (
    <>
      {blocks.map((block, i) =>
        block.startsWith('>') ? (
          <blockquote key={i} className="border-l-4 border-amber-400 pl-4 font-serif italic text-stone-800">
            {inline(block.replace(/^>\s?/gm, ''))}
          </blockquote>
        ) : (
          <p key={i}>{inline(block)}</p>
        )
      )}
    </>
  )
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold text-stone-900">{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>
    return <Fragment key={i}>{part}</Fragment>
  })
}

/** Texte d'une forme (première ligne), pour titrer sa note. */
function shapeLabel(editor: Editor, shape: TLShape) {
  const richText = (shape.props as { richText?: TLRichText }).richText
  return richText ? (renderPlaintextFromRichText(editor, richText).split('\n').find((l) => l.trim()) ?? '') : ''
}

/** Notes d'objets dans le panneau de narration : programmées à l'étape, ou ouvertes au double-clic. */
function ObjectNotes({ editor, step }: { editor: Editor; step: Step | undefined }) {
  const t = useT()
  const opened = useValue(openedNotesAtom)
  const notes = useValue(
    'object notes',
    () => {
      const planned = step?.actions.filter((a) => a.type === 'note').flatMap((a) => a.targets) ?? []
      return [...new Set([...planned, ...opened])].flatMap((id) => {
        const shape = editor.getShape(id as TLShapeId)
        const note = noteOf(shape)
        if (!shape || !note) return []
        return [{ id, title: shapeLabel(editor, shape), note, manual: !planned.includes(id) }]
      })
    },
    [editor, step, opened]
  )
  if (!notes.length) return null
  return (
    <div className="mt-[2em] space-y-[1.5em]">
      {notes.map((n) => (
        <section key={n.id} className="narration-note">
          <header className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-[0.8em] font-semibold uppercase tracking-[0.12em] text-stone-400">{n.title}</h3>
            {n.manual && (
              <button className="pbtn -mt-1 shrink-0" onClick={() => toggleOpenedNote(n.id)} title={t.presenter.closeNote} aria-label={t.presenter.closeNote}>
                <Icon name="close" />
              </button>
            )}
          </header>
          <div className="mt-[0.5em] space-y-[0.8em] text-[1.1em] leading-relaxed text-stone-700">
            <Markdownish text={n.note} />
          </div>
        </section>
      ))}
    </div>
  )
}

/** Marques sur les objets visibles qui ont une note (présentation) : un clic l'affiche. */
export function NoteMarkers() {
  const t = useT()
  const editor = useEditor()
  const markers = useValue(
    'note markers',
    () => {
      const classes = shapeClassesAtom.get()
      if (!classes) return []
      return editor.getCurrentPageShapes().flatMap((shape) => {
        if (!noteOf(shape)) return []
        if ((classes.byId.get(shape.id) ?? classes.fallback).className.includes('pres-hidden')) return []
        const b = editor.getShapePageBounds(shape.id)
        return b ? [{ id: shape.id, x: b.maxX, y: b.minY }] : []
      })
    },
    [editor]
  )
  const opened = useValue(openedNotesAtom)
  const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor])
  return (
    <>
      {markers.map((m) => (
        <button
          key={m.id}
          className={`note-marker ${opened.includes(m.id) ? 'note-marker-open' : ''}`}
          style={{ left: m.x, top: m.y, transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
          title={t.presenter.showNote}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => toggleOpenedNote(m.id)}
        >
          ¶
        </button>
      ))}
    </>
  )
}

/** Légende (présentation, touche L) : natures et relations utilisées dans le schéma. */
export function Legend({ editor }: { editor: Editor }) {
  const t = useT()
  const visible = useValue(legendVisibleAtom)
  const items = useValue(
    'legend',
    () => {
      const ids = new Set(editor.getCurrentPageShapes().map((s) => s.meta.preset as string | undefined))
      return [...ids].flatMap((id) => {
        const p = presetById(editor, id)
        return p ? [{ id: p.id, name: p.name, arrow: p.target === 'arrow', color: swatchColor(editor, p), dash: p.style.dash }] : []
      })
    },
    [editor]
  )
  if (!visible || !items.length) return null
  const natures = items.filter((i) => !i.arrow)
  const relations = items.filter((i) => i.arrow)
  return (
    <div className="legend pointer-events-auto absolute bottom-14 left-4 z-[500]" aria-label={t.presenter.legend}>
      {[natures, relations].map((group, g) =>
        group.length ? (
          <ul key={g} className="legend-group">
            {group.map((i) => (
              <li key={i.id} className="legend-item">
                {i.arrow ? (
                  <span className="legend-line" style={{ borderColor: i.color, borderStyle: i.dash === 'dashed' ? 'dashed' : i.dash === 'dotted' ? 'dotted' : 'solid' }} />
                ) : (
                  <span className="legend-box" style={{ borderColor: i.color }} />
                )}
                {i.name}
              </li>
            ))}
          </ul>
        ) : null
      )}
    </div>
  )
}

'use client'

import { Fragment, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { renderPlaintextFromRichText, useEditor, useValue, type Editor, type TLPageId, type TLRichText, type TLShape, type TLShapeId } from 'tldraw'
import { noteOf, panelNoteIds, plannedNoteIds, resolveTextImage } from '@/lib/canvas/notes'
import { presetById, swatchColor } from '@/lib/canvas/presets'
import { presetName } from '@/lib/presets/labels'
import { pagesWithSteps, readSequence } from '@/lib/canvas/adapter'
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
  activeNoteAtom,
  closeNote,
  narrationScaleDefaultAtom,
  shapeClassesAtom,
  toggleOpenedNote,
  overviewAtom,
  stepIndexAtom,
  viewerAtom,
  moreMenuOpenAtom,
  shortcutsHelpOpenAtom,
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
import { Markdownish } from './Markdownish'
import { screenConnectedAtom } from '@/lib/presentation/screen'
import { remoteStatusAtom } from '@/lib/remote/host'
import { useLocale, useT } from '@/i18n/client'

/**
 * Panneau de droite en présentation : la narration de l'étape, ou la note d'un objet (onglets).
 * top : bloc affiché en tête du panneau (contrôles du double affichage, chez le présentateur).
 * onPinScale : garder la taille du texte courante comme défaut du schéma (absent si non modifiable).
 */
export function NarrationPanel({ editor, top, onPinScale }: { editor: Editor; top?: ReactNode; onPinScale?: () => void }) {
  const t = useT()
  const seq = useValue('sequence', () => readSequence(editor), [editor])
  const index = useValue(stepIndexAtom)
  const visible = useValue(narrationVisibleAtom)
  const width = useValue(narrationWidthAtom)
  const scale = useValue(narrationScaleAtom)
  const scaleDefault = useValue(narrationScaleDefaultAtom)
  const active = useValue(activeNoteAtom)
  const opened = useValue(openedNotesAtom)
  const step = seq?.steps[index]
  const tabs = useValue(
    'note tabs',
    () => {
      const planned = plannedNoteIds(step)
      return panelNoteIds(editor, step, opened).map((id) => {
        const shape = editor.getShape(id as TLShapeId)!
        return { id, title: shapeLabel(editor, shape), note: noteOf(shape), manual: !planned.includes(id) }
      })
    },
    [editor, step, opened]
  )
  const aside = useRef<HTMLElement>(null)
  const resolveSrc = useMemo(() => resolveTextImage(editor), [editor])

  // Ctrl + molette (ou pincement sur un trackpad) au-dessus du panneau : taille du texte.
  useEffect(() => {
    const el = aside.current
    if (!el) return
    let acc = 0
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      acc += e.deltaY
      if (Math.abs(acc) < 40) return
      changeNarrationScale(acc > 0 ? -1 : 1)
      acc = 0
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [visible, seq])

  if (!seq || !visible) return null
  const note = tabs.find((n) => n.id === active)

  return (
    <aside
      ref={aside}
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
        {/* Taille du texte (aussi : touches +, − et 0, Ctrl + molette) */}
        {onPinScale && scale !== scaleDefault && (
          <button className="pbtn narration-size" onClick={onPinScale} title={t.presenter.pinTextSize(scale)}>
            {scale} %
          </button>
        )}
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
      {top}
      <p className="pr-24 text-xs font-medium uppercase tracking-[0.2em] text-stone-400">{seq.title}</p>
      {tabs.length > 0 && (
        <nav className="narration-tabs" aria-label={t.presenter.panelTabs}>
          <button className={`narration-tab ${note ? '' : 'narration-tab-active'}`} onClick={() => activeNoteAtom.set(null)}>
            {t.presenter.narrationTab}
          </button>
          {tabs.map((n) => (
            <span key={n.id} className={`narration-tab ${note?.id === n.id ? 'narration-tab-active' : ''}`}>
              <button className="min-w-0 truncate" onClick={() => activeNoteAtom.set(n.id)} title={n.title}>
                ¶ {n.title || t.panel.note}
              </button>
              {n.manual && (
                <button className="narration-tab-close" onClick={() => closeNote(n.id)} title={t.presenter.closeNote} aria-label={t.presenter.closeNote}>
                  ×
                </button>
              )}
            </span>
          ))}
        </nav>
      )}
      {/* key : relance l'animation d'entrée du texte à chaque étape et à chaque changement d'onglet */}
      <div
        key={`${step?.id ?? 'start'}:${note?.id ?? ''}`}
        className="narration-body mt-8 flex-1 overflow-y-auto"
        // em : relatif au panneau, dont la taille de base diminue sur petit écran (globals.css).
        style={{ fontSize: `${scale / 100}em` }}
      >
        {/* Tailles en em : elles suivent le réglage de taille du texte. */}
        {note ? (
          <>
            <h2 className="line-clamp-3 font-serif text-[1.5em] leading-tight text-stone-900">{note.title}</h2>
            <div className="mt-[1.2em] space-y-[0.9em] text-[1.15em] leading-relaxed text-stone-700">
              <Markdownish text={note.note} resolveSrc={resolveSrc} />
            </div>
          </>
        ) : step ? (
          <>
            <h2 className="font-serif text-[1.875em] leading-tight text-stone-900">{step.title}</h2>
            <div className="mt-[1.5em] space-y-[1em] text-[1.25em] leading-relaxed text-stone-700">
              <Markdownish text={step.narration} resolveSrc={resolveSrc} />
            </div>
          </>
        ) : (
          <h2 className="font-serif text-[2.25em] leading-tight text-stone-900">{seq.title}</h2>
        )}
      </div>
    </aside>
  )
}

/**
 * onProject : ouvre la fenêtre public du double affichage ; onRemote : appaire un téléphone.
 * Absents dans le lecteur d'un lien partagé.
 */
export function ProgressBar({ editor, onProject, onRemote }: { editor: Editor; onProject?: () => void; onRemote?: () => void }) {
  const t = useT()
  const seq = useValue('sequence', () => readSequence(editor), [editor])
  const index = useValue(stepIndexAtom)
  const overview = useValue(overviewAtom)
  const narration = useValue(narrationVisibleAtom)
  const unlocked = useValue(editUnlockedAtom)
  const viewer = useValue(viewerAtom)
  const screenConnected = useValue(screenConnectedAtom)
  const remoteConnected = useValue('remote connected', () => remoteStatusAtom.get().state === 'connected', [])
  const laser = useValue('laser', () => editor.getCurrentToolId() === 'laser', [editor])
  if (!seq) return null
  const total = seq.steps.length

  return (
    <div className="progress pointer-events-auto absolute inset-x-0 bottom-0 z-[500] flex items-center gap-2 py-2 pl-2 pr-32 text-xs text-stone-500 md:gap-3 md:pl-16 md:pr-44">
      <PagePicker editor={editor} />
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
      <span className="whitespace-nowrap tabular-nums">
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
        {/* Laser et calque : pensés pour la souris, retirés sur petit écran. */}
        <span className="flex items-center gap-0.5 max-md:hidden">
          <LaserControl editor={editor} active={laser} />
          <SpotControl editor={editor} />
        </span>
        <ToolBtn onClick={toggleNarration} active={narration} title={t.presenter.narration} icon="panel" />
        <ToolBtn onClick={toggleFullscreen} title={t.presenter.fullscreen} icon="fullscreen" />
        {/* Actions moins fréquentes : recentrer, déverrouiller, projeter, télécommande. */}
        <MoreMenu
          items={[
            { label: t.presenter.recenter, icon: 'recenter', onClick: recenter },
            { label: t.help.menu, icon: 'help', onClick: () => shortcutsHelpOpenAtom.set(true) },
            ...(viewer
              ? []
              : [
                  {
                    label: unlocked ? t.presenter.lock : t.presenter.unlock,
                    icon: (unlocked ? 'unlocked' : 'locked') as IconName,
                    onClick: toggleUnlocked,
                    active: unlocked,
                  },
                ]),
            ...(onProject ? [{ label: t.screen.project, icon: 'screen' as IconName, onClick: onProject, active: screenConnected, desktopOnly: true }] : []),
            ...(onRemote ? [{ label: t.remote.button, icon: 'phone' as IconName, onClick: onRemote, active: remoteConnected, desktopOnly: true }] : []),
          ]}
        />
        {!viewer && <ToolBtn onClick={exitPresentation} title={t.presenter.exit} icon="close" />}
      </div>
    </div>
  )
}

/** Document à plusieurs pages : chaque page a sa séquence ; on passe de l'une à l'autre, au début de sa séquence. */
function PagePicker({ editor }: { editor: Editor }) {
  const t = useT()
  const pages = useValue(
    'presented pages',
    () => {
      const withSteps = new Set<string>(pagesWithSteps(editor))
      const current = editor.getCurrentPageId()
      return editor.getPages().filter((p) => withSteps.has(p.id) || p.id === current).map((p) => ({ id: p.id, name: p.name }))
    },
    [editor]
  )
  const current = useValue('current page', () => editor.getCurrentPageId(), [editor])
  if (pages.length < 2) return null
  return (
    <select
      className="page-picker max-w-[9rem] truncate rounded border border-stone-200 bg-white px-1 py-0.5 text-xs text-stone-600"
      value={current}
      onChange={(e) => editor.setCurrentPage(e.target.value as TLPageId)}
      title={t.presenter.page}
      aria-label={t.presenter.page}
    >
      {pages.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  )
}

interface MoreItem {
  label: string
  icon: IconName
  onClick(): void
  active?: boolean
  /** Sans objet sur petit écran (second écran, téléphone). */
  desktopOnly?: boolean
}

/** Menu « ⋯ » de la barre de présentation. Échap le referme sans quitter la présentation (usePresentation). */
function MoreMenu({ items }: { items: MoreItem[] }) {
  const t = useT()
  const open = useValue(moreMenuOpenAtom)
  const setOpen = (value: boolean) => moreMenuOpenAtom.set(value)
  const ref = useRef<HTMLDivElement>(null)

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) moreMenuOpenAtom.set(false)
    }
    window.addEventListener('pointerdown', onDown, { capture: true })
    return () => window.removeEventListener('pointerdown', onDown, { capture: true })
  }, [open])

  return (
    <div ref={ref} className="relative flex items-center">
      <ToolBtn onClick={() => setOpen(!open)} active={open || items.some((i) => i.active)} title={t.presenter.more} icon="more" />
      {open && (
        <div className="more-menu" role="menu" aria-label={t.presenter.more}>
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className={`more-item ${item.active ? 'more-item-active' : ''} ${item.desktopOnly ? 'max-md:hidden' : ''}`}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
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
  | 'screen'
  | 'phone'
  | 'more'
  | 'help'
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
  screen: <path d="M3 4h18v12H3zM8 20h8M12 16v4" />,
  help: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" />,
  phone: <path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2" />,
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
/** Texte d'une forme (première ligne), pour titrer sa note. */
function shapeLabel(editor: Editor, shape: TLShape) {
  const richText = (shape.props as { richText?: TLRichText }).richText
  return richText ? (renderPlaintextFromRichText(editor, richText).split('\n').find((l) => l.trim()) ?? '') : ''
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
        return p ? [{ id: p.id, name: presetName(p, t), arrow: p.target === 'arrow', color: swatchColor(editor, p), dash: p.style.dash }] : []
      })
    },
    [editor, t]
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

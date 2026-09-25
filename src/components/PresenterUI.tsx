'use client'

import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import { useValue, type Editor } from 'tldraw'
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

export function NarrationPanel({ editor }: { editor: Editor }) {
  const seq = useValue('sequence', () => readSequence(editor), [editor])
  const index = useValue(stepIndexAtom)
  const visible = useValue(narrationVisibleAtom)
  const width = useValue(narrationWidthAtom)
  if (!seq || !visible) return null
  const step = seq.steps[index]

  return (
    <aside
      className="narration relative flex h-full shrink-0 flex-col border-l border-stone-200 bg-[#fbfaf7] px-10 py-12"
      style={{ width }}
    >
      <ResizeHandle
        width={narrationWidthAtom}
        limits={NARRATION_WIDTH}
        storageKey="narrationWidth"
        onResized={recenterAfterResize}
      />
      <button
        className="pbtn absolute right-3 top-3"
        onClick={toggleNarration}
        title="Masquer la narration (N)"
        aria-label="Masquer la narration"
      >
        <Icon name="close" />
      </button>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">{seq.title}</p>
      {/* key : relance l'animation d'entrée du texte à chaque étape */}
      <div key={step?.id ?? 'start'} className="narration-body mt-8 flex-1 overflow-y-auto">
        {step ? (
          <>
            <h2 className="font-serif text-3xl leading-tight text-stone-900">{step.title}</h2>
            <div className="mt-6 space-y-4 text-xl leading-relaxed text-stone-700">
              <Markdownish text={step.narration} />
            </div>
          </>
        ) : (
          <h2 className="font-serif text-4xl leading-tight text-stone-900">{seq.title}</h2>
        )}
      </div>
    </aside>
  )
}

export function ProgressBar({ editor }: { editor: Editor }) {
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
      <ToolBtn onClick={() => goToStep(editor, index - 1)} disabled={index < 0} title="Précédent (←)" icon="prev" />
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
        title="Suivant (→, Espace)"
        icon="next"
      />

      <div className="tools flex items-center gap-0.5 border-l border-stone-200 pl-2">
        <ToolBtn onClick={toggleOverview} active={overview} title="Vue d'ensemble (O)" icon="overview" />
        <ToolBtn onClick={recenter} title="Recentrer sur l'étape (C)" icon="recenter" />
        <LaserControl editor={editor} active={laser} />
        <SpotControl editor={editor} />
        <ToolBtn
          onClick={toggleUnlocked}
          active={unlocked}
          title={unlocked ? 'Reverrouiller le document' : 'Déverrouiller : modifier le schéma pendant la présentation'}
          icon={unlocked ? 'unlocked' : 'locked'}
        />
        <ToolBtn onClick={toggleNarration} active={narration} title="Narration (N)" icon="panel" />
        <ToolBtn onClick={toggleFullscreen} title="Plein écran (F)" icon="fullscreen" />
        <ToolBtn onClick={exitPresentation} title="Quitter la présentation (Échap)" icon="close" />
      </div>
    </div>
  )
}

function LaserControl({ editor, active }: { editor: Editor; active: boolean }) {
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
      <ToolBtn onClick={() => toggleLaser(editor)} active={active} title="Pointeur laser (K)" icon="laser" />
      <button
        className={`laser-caret ${open ? 'text-stone-900' : ''}`}
        onClick={() => laserPopoverOpenAtom.set(!open)}
        title="Réglages du laser"
        aria-label="Réglages du laser"
        aria-expanded={open}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
          <path d="m6 15 6-6 6 6" />
        </svg>
      </button>

      {open && (
        <div className="laser-popover" role="dialog" aria-label="Réglages du laser">
          <LaserPreview color={settings.color} width={settings.width} />

          <p className="lp-label">Couleur</p>
          <div className="flex gap-1.5">
            {LASER_COLORS.map((c) => (
              <button
                key={c}
                className={`lp-swatch ${settings.color === c ? 'lp-swatch-active' : ''}`}
                style={{ background: c, boxShadow: `0 0 8px ${c}` }}
                onClick={() => updateLaserSettings({ color: c })}
                aria-label={`Couleur ${c}`}
              />
            ))}
            <label className="lp-swatch lp-custom" title="Autre couleur">
              <input
                type="color"
                value={settings.color}
                onChange={(e) => updateLaserSettings({ color: e.target.value })}
                aria-label="Couleur personnalisée"
              />
            </label>
          </div>

          <p className="lp-label">
            Épaisseur <span>{settings.width} px</span>
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
            Effacement après <span>{(settings.delayMs / 1000).toLocaleString('fr-FR')} s</span>
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
            Réinitialiser
          </button>
        </div>
      )}
    </div>
  )
}

/** Calque occultant à la volée, avec un bouton pour le retirer quand il est posé. */
function SpotControl({ editor }: { editor: Editor }) {
  const tool = useValue(spotToolAtom)
  const live = useValue(liveSpotAtom)
  return (
    <div className="relative flex items-center">
      <ToolBtn
        onClick={() => toggleSpotTool(editor)}
        active={tool || !!live}
        title={tool ? 'Terminer le réglage du calque (M)' : 'Calque occultant : tracer la zone à garder lisible (M)'}
        icon="spot"
      />
      {live && (
        <button className="spot-clear" onClick={clearLiveSpot} title="Retirer le calque (Échap)" aria-label="Retirer le calque">
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

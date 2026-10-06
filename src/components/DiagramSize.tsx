'use client'

import { useState } from 'react'
import { useT } from '@/i18n/client'
import { SIZE_LIMITS, hasSize, normalizeSize, type DiagramSize } from '@/lib/map/size'

/**
 * Taille des schémas créés par l'IA : éléments et niveaux, de… à… (vide : au choix de l'IA).
 * Dans les réglages de l'IA (valeurs par défaut) et, repliée, dans les fenêtres de création.
 */
export function DiagramSizeFields({ size, onChange }: { size: DiagramSize; onChange(size: DiagramSize): void }) {
  const t = useT()
  const field = (key: keyof DiagramSize, max: number, label: string) => (
    <input
      className="preset-input diagram-size-input"
      type="number"
      inputMode="numeric"
      min={1}
      max={max}
      value={size[key] ?? ''}
      placeholder="—"
      aria-label={label}
      onChange={(e) => {
        const v = e.target.value === '' ? undefined : Number(e.target.value)
        // Pas de remise en ordre min / max pendant la saisie : seulement les valeurs hors limites écartées.
        onChange({ ...size, [key]: v !== undefined && Number.isInteger(v) && v >= 1 && v <= max ? v : undefined })
      }}
    />
  )
  return (
    <div className="diagram-size">
      <span className="text-xs text-zinc-500">{t.ai.size.elements}</span>
      <span className="flex items-center gap-1 text-xs">
        {t.ai.size.from} {field('minElements', SIZE_LIMITS.elements, t.ai.size.minElements)} {t.ai.size.to}{' '}
        {field('maxElements', SIZE_LIMITS.elements, t.ai.size.maxElements)}
      </span>
      <span className="text-xs text-zinc-500" title={t.ai.size.levelsHint}>
        {t.ai.size.levels}
      </span>
      <span className="flex items-center gap-1 text-xs">
        {t.ai.size.from} {field('minLevels', SIZE_LIMITS.levels, t.ai.size.minLevels)} {t.ai.size.to}{' '}
        {field('maxLevels', SIZE_LIMITS.levels, t.ai.size.maxLevels)}
      </span>
    </div>
  )
}

/** « 15 à 30 éléments, 2 à 4 niveaux », ou « au choix de l'IA ». */
export function useSizeSummary() {
  const t = useT()
  return (size: DiagramSize) => {
    const s = normalizeSize(size)
    if (!hasSize(s)) return t.ai.size.free
    const part = (min: number | undefined, max: number | undefined, unit: (n: number) => string) =>
      min === undefined && max === undefined
        ? ''
        : min !== undefined && max !== undefined
          ? min === max
            ? unit(min)
            : t.ai.size.range(min, unit(max))
          : min !== undefined
            ? t.ai.size.atLeast(unit(min))
            : t.ai.size.atMost(unit(max!))
    return [part(s.minElements, s.maxElements, t.ai.size.elementsUnit), part(s.minLevels, s.maxLevels, t.ai.size.levelsUnit)]
      .filter(Boolean)
      .join(', ')
  }
}

/**
 * Rappel discret dans une fenêtre de création : la taille réglée (par défaut, celle des réglages de
 * l'IA), modifiable pour cette création seulement.
 */
export function DiagramSizeNote({ size, onChange, disabled }: { size: DiagramSize; onChange(size: DiagramSize): void; disabled?: boolean }) {
  const t = useT()
  const summary = useSizeSummary()
  const [open, setOpen] = useState(false)
  return (
    <div className="grid gap-1 text-xs text-zinc-500">
      <span className="flex flex-wrap items-center gap-1">
        {t.ai.size.note(summary(size))}
        <button className="underline" disabled={disabled} onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? t.ai.size.done : t.ai.size.change}
        </button>
      </span>
      {open && (
        <>
          <DiagramSizeFields size={size} onChange={onChange} />
          <span>{t.ai.size.thisTime}</span>
        </>
      )}
    </div>
  )
}

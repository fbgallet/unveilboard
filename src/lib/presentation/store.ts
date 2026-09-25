import { atom } from 'tldraw'

export type Mode = 'edit' | 'present'

/** Mode courant de l'application. */
export const modeAtom = atom<Mode>('mode', 'edit')

/** Index de la dernière étape appliquée (-1 = avant la première étape). */
export const stepIndexAtom = atom<number>('stepIndex', -1)

/** Vue d'ensemble temporaire (touche O) pendant la présentation. */
export const overviewAtom = atom<boolean>('overview', false)

/** Incrémenté pour demander à la caméra de se recaler sur l'étape courante (touche C). */
export const recenterAtom = atom<number>('recenter', 0)

/** Panneau de narration visible pendant la présentation. */
export const narrationVisibleAtom = atom<boolean>('narrationVisible', true)

/** Largeur du panneau de narration (px), réglable à la souris. */
export const NARRATION_WIDTH = { min: 280, default: 460 }
export const narrationWidthAtom = atom<number>('narrationWidth', readStoredWidth())

function readStoredWidth() {
  try {
    const v = Number(localStorage.getItem('narrationWidth'))
    return v >= NARRATION_WIDTH.min ? v : NARRATION_WIDTH.default
  } catch {
    return NARRATION_WIDTH.default
  }
}

export function storeNarrationWidth(width: number) {
  try {
    localStorage.setItem('narrationWidth', String(Math.round(width)))
  } catch {
    // stockage indisponible (navigation privée…) : la largeur ne sera pas mémorisée
  }
}

/** Document modifiable pendant la présentation (cadenas ouvert). */
export const editUnlockedAtom = atom<boolean>('editUnlocked', false)

/** Étape sélectionnée dans le panneau d'édition. */
export const activeStepIdAtom = atom<string | null>('activeStepId', null)

/**
 * Classes CSS à appliquer à chaque forme pendant la présentation.
 * null hors présentation : les formes s'affichent normalement.
 */
export interface ShapePresentation {
  className: string
  style?: Record<string, string>
}

export const shapeClassesAtom = atom<{ byId: Map<string, ShapePresentation>; fallback: ShapePresentation } | null>(
  'shapeClasses',
  null
)

// ---------- Pointeur laser ----------

export interface LaserSettings {
  color: string
  /** Épaisseur du trait, en pixels écran. */
  width: number
  /** Délai avant effacement après la dernière activité (ms). */
  delayMs: number
}

export const LASER_COLORS = ['#ff2a2a', '#ff3df2', '#ffb020', '#22e36b', '#2fb8ff', '#ffffff']
export const DEFAULT_LASER: LaserSettings = { color: '#ff2a2a', width: 5, delayMs: 1200 }

export const laserSettingsAtom = atom<LaserSettings>('laserSettings', readStored('laserSettings', DEFAULT_LASER))
export const laserPopoverOpenAtom = atom<boolean>('laserPopoverOpen', false)

export function updateLaserSettings(patch: Partial<LaserSettings>) {
  const next = { ...laserSettingsAtom.get(), ...patch }
  laserSettingsAtom.set(next)
  try {
    localStorage.setItem('laserSettings', JSON.stringify(next))
  } catch {
    // stockage indisponible : réglages valables pour la séance seulement
  }
}

function readStored<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

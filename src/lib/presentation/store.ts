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

/** Bornes de largeur d'un panneau latéral redimensionnable (px). */
export interface WidthLimits {
  min: number
  default: number
}

/** Largeur du panneau de narration (px), réglable à la souris. */
export const NARRATION_WIDTH: WidthLimits = { min: 280, default: 460 }
export const narrationWidthAtom = atom<number>('narrationWidth', readStoredWidth('narrationWidth', NARRATION_WIDTH))

/** Panneau des étapes (mode édition) : largeur réglable, repliable. */
export const SEQUENCE_PANEL_WIDTH: WidthLimits = { min: 300, default: 380 }
export const sequencePanelWidthAtom = atom<number>(
  'sequencePanelWidth',
  readStoredWidth('sequencePanelWidth', SEQUENCE_PANEL_WIDTH)
)
export const sequencePanelOpenAtom = atom<boolean>('sequencePanelOpen', readStoredValue('sequencePanelOpen') !== 'false')

function readStoredValue(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function readStoredWidth(key: string, limits: WidthLimits) {
  const v = Number(readStoredValue(key))
  return v >= limits.min ? v : limits.default
}

/** Mémorise un réglage d'affichage (largeur, panneau ouvert…). */
export function storeValue(key: string, value: number | boolean) {
  try {
    localStorage.setItem(key, String(typeof value === 'number' ? Math.round(value) : value))
  } catch {
    // stockage indisponible (navigation privée…) : le réglage ne sera pas mémorisé
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

// ---------- Calque occultant ----------

/** Rectangle en coordonnées de page (identique à BoxModel de tldraw). */
export interface PageRect {
  x: number
  y: number
  w: number
  h: number
}

/** Calques occultants (formes) actifs à l'étape courante, d'après la séquence. */
export const activeSpotsAtom = atom<string[]>('activeSpots', [])

/** Fenêtre tracée à la volée pendant la présentation (non enregistrée dans le document). */
export const liveSpotAtom = atom<PageRect | null>('liveSpot', null)

/** Outil de tracé de la fenêtre à la volée actif (poignées visibles, pointeur capturé). */
export const spotToolAtom = atom<boolean>('spotTool', false)

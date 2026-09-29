import { atom, type TLScribble } from 'tldraw'

export type Mode = 'edit' | 'present'

/** Mode courant de l'application. */
export const modeAtom = atom<Mode>('mode', 'edit')

/** Début de la présentation en cours (chronomètre de la vue présentateur). */
export const presentationStartedAtAtom = atom<number>('presentationStartedAt', 0)

/** Index de la dernière étape appliquée (-1 = avant la première étape). */
export const stepIndexAtom = atom<number>('stepIndex', -1)

/** Vue d'ensemble temporaire (touche O) pendant la présentation. */
export const overviewAtom = atom<boolean>('overview', false)

/** Incrémenté pour demander à la caméra de se recaler sur l'étape courante (touche C). */
export const recenterAtom = atom<number>('recenter', 0)

/** Panneau de narration visible pendant la présentation. */
export const narrationVisibleAtom = atom<boolean>('narrationVisible', true)

/** Légende des natures et relations utilisées (touche L). */
export const legendVisibleAtom = atom<boolean>('legendVisible', false)

/** Bornes de largeur d'un panneau latéral redimensionnable (px). */
export interface WidthLimits {
  min: number
  default: number
}

/** Largeur du panneau de narration (px), réglable à la souris. */
export const NARRATION_WIDTH: WidthLimits = { min: 280, default: 460 }
export const narrationWidthAtom = atom<number>('narrationWidth', readStoredWidth('narrationWidth', NARRATION_WIDTH))

/**
 * Taille du texte du panneau de narration (%). Chaque schéma a sa taille par défaut (enregistrée
 * dans sa séquence), appliquée en entrant en présentation ; les réglages faits pendant la
 * présentation (+, −, 0, Ctrl + molette) valent pour la séance, sauf si on les garde pour le schéma.
 */
export const NARRATION_SCALE = { min: 60, max: 250, step: 10, default: 100 }
export const narrationScaleAtom = atom<number>('narrationScale', NARRATION_SCALE.default)
/** Taille par défaut du schéma ouvert (celle à laquelle 0 revient). */
export const narrationScaleDefaultAtom = atom<number>('narrationScaleDefault', NARRATION_SCALE.default)

export function clampNarrationScale(v: number) {
  const { min, max } = NARRATION_SCALE
  return Math.round(Math.min(max, Math.max(min, v)))
}

/** Agrandit (+1) ou réduit (−1) le texte de la narration ; null : taille par défaut du schéma. */
export function changeNarrationScale(delta: number | null) {
  narrationScaleAtom.set(
    delta === null ? narrationScaleDefaultAtom.get() : clampNarrationScale(narrationScaleAtom.get() + delta * NARRATION_SCALE.step)
  )
}

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

/** Lecteur d'un lien partagé (/p) : présentation seule, sans retour à l'édition ni déverrouillage. */
export const viewerAtom = atom<boolean>('viewer', false)

/** Document modifiable pendant la présentation (cadenas ouvert). */
export const editUnlockedAtom = atom<boolean>('editUnlocked', false)

/**
 * Pastilles d'arbre pendant la présentation : nœuds repliés et visibles, avec le nombre de nœuds
 * qu'un dépliage montrerait (« +n »), et nœuds dépliés dont on peut replier la branche (« − »).
 */
export interface FoldBadgesState {
  folded: { id: string; n: number }[]
  open: string[]
}
export const foldBadgesAtom = atom<FoldBadgesState>('foldBadges', { folded: [], open: [] })

/**
 * Branches repliées ou dépliées à la main pendant la présentation, sans toucher au document :
 * nœud → repli voulu et étape du geste. Un geste vaut jusqu'à ce qu'une étape replie ou déplie
 * ce nœud ; revenir en arrière les efface tous.
 */
export type FoldOverrides = Record<string, { folded: boolean; step: number }>
export const foldOverridesAtom = atom<FoldOverrides>('foldOverrides', {})

export function setFoldOverride(id: string, folded: boolean) {
  foldOverridesAtom.set({ ...foldOverridesAtom.get(), [id]: { folded, step: stepIndexAtom.get() } })
}

/** Notes d'objets ouvertes à la main (double-clic) pendant l'étape courante. */
export const openedNotesAtom = atom<string[]>('openedNotes', [])

/** Onglet affiché dans le panneau de droite : la narration (null) ou la note d'un objet. */
export const activeNoteAtom = atom<string | null>('activeNote', null)

/** Ouvre la note d'un objet dans son onglet (et le panneau au besoin), ou la referme si elle est affichée. */
export function toggleOpenedNote(id: string) {
  const opened = openedNotesAtom.get()
  if (activeNoteAtom.get() === id) return closeNote(id)
  if (!opened.includes(id)) openedNotesAtom.set([...opened, id])
  activeNoteAtom.set(id)
  narrationVisibleAtom.set(true)
}

/** Referme l'onglet d'une note ouverte à la main ; s'il était affiché, on revient à la narration. */
export function closeNote(id: string) {
  openedNotesAtom.set(openedNotesAtom.get().filter((n) => n !== id))
  if (activeNoteAtom.get() === id) activeNoteAtom.set(null)
}

/** Étape sélectionnée dans le panneau d'édition. */
export const activeStepIdAtom = atom<string | null>('activeStepId', null)

/** Préréglages repliés dans le panneau de styles (seul leur en-tête reste visible). */
export const presetsCollapsedAtom = atom<boolean>('presetsCollapsed', readStoredValue('presetsCollapsed') === 'true')

/** Pastilles de numéro d'étape sur le canevas (mode édition). */
export const stepBadgesVisibleAtom = atom<boolean>('stepBadgesVisible', readStoredValue('stepBadgesVisible') !== 'false')

/**
 * Séquençage rapide (mode édition) : chaque nouvel objet est proposé au rattachement
 * à l'étape active, ou à une nouvelle étape juste avant / juste après.
 */
export const quickSequenceAtom = atom<boolean>('quickSequence', false)

/** Objets créés en séquençage rapide, en attente de rattachement. */
export const pendingShapesAtom = atom<string[]>('pendingShapes', [])

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
/** Aide des raccourcis de présentation (touche ?). */
export const shortcutsHelpOpenAtom = atom<boolean>('shortcutsHelpOpen', false)
/** Menu « ⋯ » de la barre de présentation ouvert (Échap le referme au lieu de quitter). */
export const moreMenuOpenAtom = atom<boolean>('moreMenuOpen', false)
/** Traces laser du présentateur, recopiées dans la fenêtre public du double affichage. */
export const remoteScribblesAtom = atom<TLScribble[]>('remoteScribbles', [])

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

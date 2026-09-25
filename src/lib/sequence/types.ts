// Modèle de séquence : données pures, indépendantes du moteur de canevas.
// Les objets sont désignés par leur identifiant (string) ; seul l'adaptateur
// sait ce qu'est une « forme » tldraw.

export type ShapeRef = string

/** Effet d'entrée d'un objet qui apparaît. */
export type Effect = 'fade' | 'draw' | 'rise' | 'none'

/**
 * Actions persistantes (restent actives aux étapes suivantes) :
 *   show, hide, dim, undim
 * Actions transitoires (valables uniquement pendant l'étape courante) :
 *   highlight, focus
 */
export type StepAction =
  | { type: 'show'; targets: ShapeRef[]; effect?: Effect }
  | { type: 'hide'; targets: ShapeRef[] }
  | { type: 'dim'; targets: ShapeRef[] }
  | { type: 'undim'; targets: ShapeRef[] }
  | { type: 'highlight'; targets: ShapeRef[] }
  | { type: 'focus'; targets: ShapeRef[] }

export type StepActionType = StepAction['type']

export type CameraMode = 'follow' | 'overview' | 'keep'

export interface StepCamera {
  mode: CameraMode
  /** Marge (px écran) autour de la zone cadrée. */
  padding?: number
  /** Zoom maximal, pour éviter de zoomer à outrance sur un petit objet. */
  maxZoom?: number
}

export interface Step {
  id: string
  title: string
  actions: StepAction[]
  camera: StepCamera
  /** Texte d'accompagnement affiché à la classe. */
  narration: string
}

export interface Sequence {
  /** Version du format (voir migrate.ts). Absente dans les documents d'avant la phase 2 : version 1. */
  version?: number
  id: string
  title: string
  steps: Step[]
}

export const ACTION_LABELS: Record<StepActionType, string> = {
  show: 'Apparaître',
  hide: 'Cacher',
  dim: 'Atténuer',
  undim: 'Rétablir',
  highlight: 'Surligner',
  focus: 'Focus',
}

export const CAMERA_LABELS: Record<CameraMode, string> = {
  follow: 'Suivre',
  overview: "Vue d'ensemble",
  keep: 'Ne pas bouger',
}

export const EFFECT_LABELS: Record<Effect, string> = {
  fade: 'Fondu',
  draw: 'Tracé',
  rise: 'Montée',
  none: 'Aucun',
}

/** Version courante du format de séquence. */
export const SEQUENCE_VERSION = 1

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function emptySequence(): Sequence {
  return { version: SEQUENCE_VERSION, id: newId('seq'), title: 'Nouvelle séquence', steps: [] }
}

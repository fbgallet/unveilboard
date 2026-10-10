// Modèle de séquence : données pures, indépendantes du moteur de canevas.
// Les objets sont désignés par leur identifiant (string) ; seul l'adaptateur
// sait ce qu'est une « forme » tldraw.

export type ShapeRef = string

/** Effet d'entrée d'un objet qui apparaît. */
export type Effect = 'fade' | 'draw' | 'rise' | 'none'

/**
 * Actions persistantes (restent actives aux étapes suivantes) :
 *   show, hide, dim, undim, fold, unfold (replier / déplier une branche d'arbre)
 * Actions transitoires (valables uniquement pendant l'étape courante) :
 *   highlight, focus, note (afficher la note des objets dans le panneau de narration)
 */
export type StepAction =
  | { type: 'show'; targets: ShapeRef[]; effect?: Effect }
  | { type: 'hide'; targets: ShapeRef[] }
  | { type: 'dim'; targets: ShapeRef[] }
  | { type: 'undim'; targets: ShapeRef[] }
  | { type: 'fold'; targets: ShapeRef[] }
  | { type: 'unfold'; targets: ShapeRef[] }
  | { type: 'highlight'; targets: ShapeRef[] }
  | { type: 'focus'; targets: ShapeRef[] }
  | { type: 'note'; targets: ShapeRef[] }

export type StepActionType = StepAction['type']

export type CameraMode = 'follow' | 'overview' | 'area' | 'keep'

/** Rectangle en coordonnées de page. */
export interface Area {
  x: number
  y: number
  w: number
  h: number
}

export interface StepCamera {
  mode: CameraMode
  /** Mode « zone » : rectangle cadré (centré, zoom adapté à sa taille). */
  area?: Area
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

/**
 * Manière de présenter : « reveal » (par défaut), chaque étape fait apparaître des objets, cachés
 * au départ ; « tour », tout est visible dès le départ et chaque étape cadre ses objets.
 */
export type SequenceMode = 'reveal' | 'tour'
export const SEQUENCE_MODES: SequenceMode[] = ['reveal', 'tour']

export interface Sequence {
  /** Manière de présenter (absente : « reveal »). Commune à toutes les pages du document. */
  mode?: SequenceMode
  /** Mode « tour » : atténuer légèrement ce que l'étape ne montre pas (par défaut : oui). */
  tourMute?: boolean
  /** Taille par défaut du texte du panneau de narration (%, 100 si absente). */
  narrationScale?: number
  /** Afficher le texte source (barre de gauche) au lancement de la présentation (par défaut : non). */
  sourceText?: boolean
  /** Version du format (voir migrate.ts). Absente dans les documents d'avant la phase 2 : version 1. */
  version?: number
  id: string
  title: string
  /** Texte d'accueil (Markdown), affiché au départ de la présentation, avant la première étape. */
  intro?: string
  steps: Step[]
}

/** Version courante du format de séquence. */
export const SEQUENCE_VERSION = 2

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function emptySequence(title = 'New sequence'): Sequence {
  return { version: SEQUENCE_VERSION, id: newId('seq'), title, steps: [] }
}

// Les libellés (actions, caméra, effets) sont dans src/i18n : t.actions, t.camera, t.effects.
export const EFFECTS: Effect[] = ['fade', 'draw', 'rise', 'none']
export const CAMERA_MODES: CameraMode[] = ['follow', 'overview', 'area', 'keep']

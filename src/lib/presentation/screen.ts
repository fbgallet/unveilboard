// Double affichage en classe : la fenêtre « public » (projecteur, /d/<id>/screen) suit la fenêtre
// du présentateur. Les deux fenêtres, dans le même navigateur, se parlent par un BroadcastChannel :
// aucun serveur. Le document lui-même est partagé par le cache local de tldraw (même persistenceKey).
// Le présentateur fait foi : il envoie l'état de la présentation ; le public renvoie les touches
// pressées chez lui (une télécommande agit sur la fenêtre active, souvent celle du projecteur).

import { atom, type TLScribble } from 'tldraw'
import type { FoldOverrides, LaserSettings, PageRect } from './store'
import type { StageView } from '../sequence/compute'

export interface ScreenState {
  presenting: boolean
  /** Page présentée : chaque page a sa séquence. */
  pageId: string
  stepIndex: number
  overview: boolean
  recenter: number
  liveSpot: PageRect | null
  openedNotes: string[]
  /** Onglet du panneau : narration (null) ou note d'un objet. */
  activeNote: string | null
  legend: boolean
  /** Narration affichée au projecteur (masquée par défaut : c'est le présentateur qui parle). */
  narration: boolean
  narrationScale: number
  laser: LaserSettings
  /** Branches repliées ou dépliées à la main. */
  foldOverrides: FoldOverrides
  /** Affichage par-dessus la séquence : tout le schéma, ou l'étape seule. */
  view?: StageView
}

export type ScreenMessage =
  | { type: 'hello' }
  | { type: 'bye' }
  | { type: 'key'; key: string; shiftKey: boolean }
  | { type: 'state'; state: ScreenState }
  | { type: 'scribbles'; scribbles: TLScribble[] }

export const screenChannelName = (docId: string) => `unveilboard:screen:${docId}`

/** Côté présentateur : une fenêtre public a donné signe de vie récemment. */
export const screenConnectedAtom = atom<boolean>('screenConnected', false)
/** Côté présentateur : narration projetée ou non (réglage de la vue présentateur). */
export const screenNarrationAtom = atom<boolean>('screenNarration', false)

/** Délai sans nouvelles au-delà duquel la fenêtre public est considérée fermée. */
export const SCREEN_HEARTBEAT_MS = 2000
export const SCREEN_TIMEOUT_MS = 5000

/**
 * Ouvre (ou ramène au premier plan) la fenêtre public. L'ouverture est immédiate, pour rester dans
 * le geste de l'utilisateur (sinon le navigateur bloque la fenêtre) ; sur Chrome et Edge, elle est
 * ensuite déplacée sur un autre écran s'il y en a un (le navigateur demande l'autorisation une fois).
 */
export function openScreen(docId: string) {
  const win = window.open(`/d/${docId}/screen`, `unveilboard-screen-${docId}`, 'popup,width=1280,height=720')
  if (!win) return false
  win.focus()
  void moveToOtherScreen(win)
  return true
}

interface ScreenDetailed {
  availLeft: number
  availTop: number
  availWidth: number
  availHeight: number
}

async function moveToOtherScreen(win: Window) {
  const getScreenDetails = (window as unknown as { getScreenDetails?: () => Promise<{ screens: ScreenDetailed[]; currentScreen: ScreenDetailed }> })
    .getScreenDetails
  if (!getScreenDetails) return
  try {
    const details = await getScreenDetails.call(window)
    const other = details.screens.find((s) => s !== details.currentScreen)
    if (!other) return
    win.moveTo(other.availLeft, other.availTop)
    win.resizeTo(other.availWidth, other.availHeight)
  } catch {
    // Autorisation refusée : la fenêtre reste où elle est, on la glisse à la main.
  }
}

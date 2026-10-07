// Application de bureau (desktop/) : les pages y sont servies sur la boucle locale de l'ordinateur,
// injoignable depuis un téléphone ou par un destinataire.

/** État de la connexion ChatGPT, tel que le donne le processus principal (desktop/chatgpt.js). */
export interface ChatGptState {
  /** none : jamais connecté ; signed_out : inscription gardée, jetons effacés. */
  status: 'none' | 'signed_out' | 'connecting' | 'connected'
  email?: string
  name?: string
  /** Permission d'utiliser le forfait ChatGPT accordée. */
  planUsage: boolean
  /** Identifiants chiffrés sur le disque (sinon, le temps de la séance). */
  persistent: boolean
  error?: { code: string; message: string; status?: number }
}

/** Réponse du processus principal à une demande ; les jetons n'en sortent jamais. */
export type ChatGptReply =
  | { ok: true }
  | { ok: false; status?: number; body?: string; requestId?: string | null; error?: { code: string; message: string; status?: number } }

export interface ChatGptBridge {
  state(): Promise<ChatGptState>
  signIn(options?: { newAccount?: boolean; consent?: boolean }): Promise<ChatGptState>
  cancelSignIn(): Promise<ChatGptState>
  signOut(): Promise<{ state: ChatGptState; revoked: boolean }>
  models(): Promise<{ ok: true; models: { slug: string; displayName: string }[] } | { ok: false; error: { code: string; message: string } }>
  /** Demande à l'API Responses ; le flux arrive par onChunk, la promesse se résout à la fin. */
  request(id: string, body: Record<string, unknown>): Promise<ChatGptReply>
  abort(id: string): Promise<void>
  onState(listener: (state: ChatGptState) => void): () => void
  onChunk(listener: (id: string, text: string) => void): () => void
}

declare global {
  interface Window {
    /** Posé par le preload d'Electron (desktop/preload.js). */
    unveilboardDesktop?: { platform: string; chatgpt?: ChatGptBridge }
  }
}

const SITE = 'https://unveilboard.com'

/** Installateurs de l'application de bureau (dernière version publiée). */
export const DESKTOP_DOWNLOAD_URL = 'https://github.com/fbgallet/unveilboard/releases/latest'

/**
 * Dans l'application de bureau ? Côté serveur, Electron le signale au serveur embarqué
 * (UNVEILBOARD_DESKTOP) ; côté navigateur, le preload, avant tout script de la page : les deux rendus
 * concordent dès l'hydratation.
 */
export const isDesktop = () =>
  typeof window === 'undefined' ? process.env.UNVEILBOARD_DESKTOP === '1' : !!window.unveilboardDesktop

/**
 * Origine des liens donnés à d'autres appareils (télécommande, partage par lien) : celle de la page,
 * sauf dans l'application de bureau, où c'est le site public, qui sert les mêmes pages.
 */
export const publicOrigin = () => (isDesktop() ? SITE : location.origin)

// Application de bureau (desktop/) : les pages y sont servies sur la boucle locale de l'ordinateur,
// injoignable depuis un téléphone ou par un destinataire.

declare global {
  interface Window {
    /** Posé par le preload d'Electron (desktop/preload.js). */
    unveilboardDesktop?: { platform: string }
  }
}

const SITE = 'https://unveilboard.com'

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

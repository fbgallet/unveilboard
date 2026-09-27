// Schéma importé (format JSON) à créer à l'ouverture d'un document neuf : l'import a besoin de
// l'éditeur (mesure des textes, mise en page), il se fait donc une fois le document ouvert.
// Gardé dans sessionStorage : l'onglet qui importe est celui qui ouvre le document.

import type { UnveilMap } from './format'

const key = (docId: string) => `pending-map:${docId}`

export function stashPendingMap(docId: string, map: UnveilMap) {
  sessionStorage.setItem(key(docId), JSON.stringify(map))
}

/** Schéma en attente pour ce document (retiré de la file), ou null. */
export function takePendingMap(docId: string): UnveilMap | null {
  try {
    const raw = sessionStorage.getItem(key(docId))
    sessionStorage.removeItem(key(docId))
    return raw ? (JSON.parse(raw) as UnveilMap) : null
  } catch {
    return null
  }
}

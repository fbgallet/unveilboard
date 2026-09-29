// Schéma importé (format JSON) à créer à l'ouverture d'un document neuf : l'import a besoin de
// l'éditeur (mesure des textes, mise en page), il se fait donc une fois le document ouvert.
// Gardé dans sessionStorage : l'onglet qui importe est celui qui ouvre le document.

import type { UnveilMap } from './format'
import type { PlanRecord } from './plan'

const key = (docId: string) => `pending-map:${docId}`

export interface PendingMap {
  map: UnveilMap
  /** Schéma tiré d'une source : éléments dont l'extrait n'a pas été retrouvé dans le texte. */
  unverified?: string[]
  /** Squelette d'un plan, à construire en direct : le plan, gardé dans le document. */
  plan?: PlanRecord
}

export function stashPendingMap(docId: string, pending: PendingMap) {
  sessionStorage.setItem(key(docId), JSON.stringify(pending))
}

/** Schéma en attente pour ce document (retiré de la file), ou null. */
export function takePendingMap(docId: string): PendingMap | null {
  try {
    const raw = sessionStorage.getItem(key(docId))
    sessionStorage.removeItem(key(docId))
    return raw ? (JSON.parse(raw) as PendingMap) : null
  } catch {
    return null
  }
}

import { cloudStore } from './cloud'
import { localStore } from './local'
import type { DocumentStore, StorageMode } from './types'

export function documentStore(mode: StorageMode): DocumentStore {
  return mode === 'cloud' ? cloudStore : localStore
}

/**
 * Après suppression d'un document : efface aussi son cache tldraw et sa mémoire de synchronisation.
 * Le nom de la base IndexedDB est un détail interne de tldraw (LocalIndexedDb) : effacement au mieux.
 */
export function forgetLocalCache(id: string) {
  try {
    indexedDB.deleteDatabase(`TLDRAW_DOCUMENT_v2doc:${id}`)
    localStorage.removeItem(`sync:${id}`)
  } catch {
    // stockage indisponible : rien à effacer
  }
}

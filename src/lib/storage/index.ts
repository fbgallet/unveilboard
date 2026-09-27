import { cloudSettings, cloudStore } from './cloud'
import { localSettings, localStore } from './local'
import { deleteLink } from './tldrFile'
import type { DocumentStore, SettingsStore, StorageMode } from './types'

export function documentStore(mode: StorageMode): DocumentStore {
  return mode === 'cloud' ? cloudStore : localStore
}

export function settingsStore(mode: StorageMode): SettingsStore {
  return mode === 'cloud' ? cloudSettings : localSettings
}

/**
 * Après suppression d'un document : efface aussi son cache tldraw, sa mémoire de synchronisation et son lien vers un fichier.
 * Le nom de la base IndexedDB est un détail interne de tldraw (LocalIndexedDb) : effacement au mieux.
 */
export function forgetLocalCache(id: string) {
  void deleteLink(id)
  try {
    indexedDB.deleteDatabase(`TLDRAW_DOCUMENT_v2doc:${id}`)
    localStorage.removeItem(`sync:${id}`)
  } catch {
    // stockage indisponible : rien à effacer
  }
}

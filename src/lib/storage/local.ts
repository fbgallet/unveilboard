// Stockage « local » : les documents restent dans ce navigateur (IndexedDB).
// Deux tables : un index léger (titre, version, date) pour la liste, et les instantanés.
// Le verrouillage optimiste fonctionne comme côté serveur : il départage deux onglets.

import { StorageError, type DocumentStore, type DocumentSummary, type SaveResult } from './types'

const DB_NAME = 'animated-tldraw'
const INDEX = 'documents'
const SNAPSHOTS = 'snapshots'

interface IndexEntry {
  id: string
  title: string
  version: number
  updatedAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(INDEX, { keyPath: 'id' })
      req.result.createObjectStore(SNAPSHOTS)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

const done = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

/** Exécute `fn` dans une transaction et attend qu'elle soit validée. */
async function transaction<T>(mode: IDBTransactionMode, fn: (index: IDBObjectStore, snapshots: IDBObjectStore) => Promise<T>) {
  try {
    const db = await openDb()
    const tx = db.transaction([INDEX, SNAPSHOTS], mode)
    const committed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    committed.catch(() => {}) // évite un rejet non géré si `fn` échoue avant
    const result = await fn(tx.objectStore(INDEX), tx.objectStore(SNAPSHOTS))
    await committed
    return result
  } catch (e) {
    const quota = e instanceof DOMException && e.name === 'QuotaExceededError'
    throw new StorageError('storage', quota ? 'Espace de stockage du navigateur plein.' : 'Stockage du navigateur indisponible.')
  }
}

export const localStore: DocumentStore = {
  mode: 'local',

  list() {
    return transaction('readonly', async (index) => {
      const entries = (await done(index.getAll())) as IndexEntry[]
      return entries
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((e): DocumentSummary => ({ id: e.id, title: e.title, updatedAt: new Date(e.updatedAt).toISOString() }))
    })
  },

  create(title, snapshotJson) {
    const id = crypto.randomUUID()
    return transaction('readwrite', async (index, snapshots) => {
      index.put({ id, title, version: 0, updatedAt: Date.now() } satisfies IndexEntry)
      if (snapshotJson) snapshots.put(snapshotJson, id)
      return id
    })
  },

  remove(id) {
    return transaction('readwrite', async (index, snapshots) => {
      index.delete(id)
      snapshots.delete(id)
    })
  },

  load(id) {
    return transaction('readonly', async (index, snapshots) => {
      const entry = (await done(index.get(id))) as IndexEntry | undefined
      if (!entry) return null
      const snapshotJson = ((await done(snapshots.get(id))) as string | undefined) ?? null
      return { version: entry.version, snapshotJson }
    })
  },

  version(id) {
    return transaction('readonly', async (index) => {
      const entry = (await done(index.get(id))) as IndexEntry | undefined
      return entry ? entry.version : null
    })
  },

  save(id, input) {
    return transaction('readwrite', async (index, snapshots): Promise<SaveResult> => {
      const entry = (await done(index.get(id))) as IndexEntry | undefined
      if (!entry) return { ok: false, reason: 'not_found' }
      if (!input.force && entry.version !== input.baseVersion) return { ok: false, reason: 'conflict', version: entry.version }
      const version = entry.version + 1
      index.put({ id, title: input.title.trim().slice(0, 200) || 'Sans titre', version, updatedAt: Date.now() } satisfies IndexEntry)
      snapshots.put(input.snapshotJson, id)
      return { ok: true, version }
    })
  },
}

// Fichiers .tldr (format natif de tldraw) : sauvegarde et transfert des schémas,
// indispensables en mode local où rien n'est stocké en ligne.
// Ce module ne dépend pas de tldraw (la page d'accueil l'utilise) ; l'enregistrement est dans tldrSave.ts.
//
// Fichiers liés (Chrome, Edge : File System Access API) : un schéma ouvert depuis un fichier, ou
// enregistré sous un fichier, garde un lien vers lui. Le fichier est alors tenu à jour
// automatiquement (fileSync.ts), ce qui permet de travailler directement sur un fichier placé
// dans un dossier synchronisé (Google Drive, Dropbox, iCloud Drive, OneDrive…).

import type { DocumentStore } from './types'
import { m } from '@/i18n/client'
import { snapshotTags } from '@/lib/tags'

// API de choix de fichier et permissions (Chrome, Edge) : absentes des types DOM de TypeScript.
interface FilePickerOptions {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}
interface FilePickerWindow {
  showSaveFilePicker?(opts: FilePickerOptions): Promise<FileSystemFileHandle>
  showOpenFilePicker?(opts: FilePickerOptions): Promise<FileSystemFileHandle[]>
}
interface PermissionHandle {
  queryPermission?(opts: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission?(opts: { mode: 'readwrite' }): Promise<PermissionState>
}
export const picker = () => window as unknown as FilePickerWindow
export const tldrTypes = () => [{ description: m().files.typeDescription, accept: { 'application/json': ['.tldr'] } }]
export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/** Un fichier choisi par l'utilisateur, avec son emplacement quand le navigateur le fournit. */
export interface PickedFile {
  file: File
  handle?: FileSystemFileHandle
}

/** Lit un fichier .tldr et le convertit en instantané de document (JSON), avec son titre. */
export async function readTldrFile(file: File): Promise<{ title: string; tags: string[]; snapshotJson: string }> {
  let data: { records?: { id: string; typeName: string; meta?: Record<string, unknown> }[]; schema?: unknown }
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error(m().errors.invalidTldr)
  }
  if (!Array.isArray(data?.records) || !data.schema) throw new Error(m().errors.invalidTldr)
  const store = Object.fromEntries(data.records.map((r) => [r.id, r]))
  // Titre : celui de la séquence enregistrée dans le document, sinon le nom du fichier.
  const sequence = data.records.find((r) => r.typeName === 'document')?.meta?.sequence as { title?: string } | undefined
  const title = sequence?.title || file.name.replace(/\.tldr$/i, '') || m().common.untitled
  const snapshot = { store, schema: data.schema }
  // Les migrations du schéma sont appliquées au chargement dans l'éditeur.
  return { title, tags: snapshotTags(snapshot), snapshotJson: JSON.stringify(snapshot) }
}

/** Demande un fichier .tldr à l'utilisateur ; null s'il annule. */
export async function pickTldrFile(): Promise<PickedFile | null> {
  const { showOpenFilePicker } = picker()
  if (showOpenFilePicker) {
    try {
      const [handle] = await showOpenFilePicker({ types: tldrTypes() })
      return { file: await handle.getFile(), handle }
    } catch (e) {
      if (isAbort(e)) return null
      throw e
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.tldr,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      resolve(file ? { file } : null)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/**
 * Fichier déposé sur la page, avec son emplacement si le navigateur le fournit.
 * À appeler pendant l'événement de dépôt (les données ne sont plus lisibles ensuite).
 */
export function droppedTldrFile(data: DataTransfer): Promise<PickedFile | null> {
  const file = data.files[0]
  if (!file) return Promise.resolve(null)
  const item = [...data.items].find((i) => i.kind === 'file') as
    | (DataTransferItem & { getAsFileSystemHandle?(): Promise<FileSystemHandle | null> })
    | undefined
  const pending = item?.getAsFileSystemHandle?.()
  if (!pending) return Promise.resolve({ file })
  return pending
    .then((h) => ({ file, handle: h?.kind === 'file' ? (h as FileSystemFileHandle) : undefined }))
    .catch(() => ({ file }))
}

/**
 * Ouvre un fichier .tldr ; renvoie l'identifiant du schéma.
 * Un fichier déjà lié à un schéma rouvre ce schéma (mis à jour si le fichier a changé ailleurs)
 * au lieu d'en créer un doublon ; un nouveau fichier est importé et lié.
 */
export async function openTldrFile(store: DocumentStore, { file, handle }: PickedFile) {
  if (!handle) return importTldrFile(store, file)
  const link = await findLink(handle)
  if (link && (await store.version(link.docId)) !== null) {
    if (file.lastModified !== link.lastModified) {
      // Modifié ailleurs (autre ordinateur, autre application) depuis la dernière lecture ou écriture.
      if (!link.pending || confirm(m().files.reopenConflict(file.name))) {
        const { title, tags, snapshotJson } = await readTldrFile(file)
        await store.save(link.docId, { snapshotJson, title, tags, baseVersion: 0, force: true })
        link.pending = false
      }
      // Sinon, on garde la version du schéma : elle remplacera le fichier au prochain enregistrement.
      link.lastModified = file.lastModified
    }
    await putLink({ ...link, handle, name: file.name })
    await allowWriting(handle, true)
    return link.docId
  }
  const id = await importTldrFile(store, file)
  await putLink({ docId: id, handle, name: file.name, lastModified: file.lastModified, pending: false })
  await allowWriting(handle, true)
  return id
}

/** Importe un fichier .tldr comme nouveau document ; renvoie son identifiant. */
export async function importTldrFile(store: DocumentStore, file: File) {
  const { title, snapshotJson } = await readTldrFile(file)
  return store.create(title, snapshotJson)
}

/**
 * Autorisation d'écrire dans le fichier. Le navigateur la redemande après chaque redémarrage ;
 * `ask` ne doit être vrai qu'en réponse à un geste de l'utilisateur (clic, raccourci).
 */
export async function allowWriting(handle: FileSystemFileHandle, ask: boolean) {
  const h = handle as FileSystemFileHandle & PermissionHandle
  try {
    if ((await h.queryPermission?.({ mode: 'readwrite' })) === 'granted') return true
    return ask && (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted'
  } catch {
    return false
  }
}

// ---------- Liens schéma → fichier (IndexedDB) ----------

export interface FileLink {
  docId: string
  handle: FileSystemFileHandle
  name: string
  /** Date de modification du fichier lors de notre dernière lecture ou écriture. */
  lastModified: number
  /** Le schéma a des modifications pas encore écrites dans le fichier. */
  pending: boolean
}

const LINKS_DB = 'unveilboard-files'
const LINKS = 'links'
let linksDb: Promise<IDBDatabase> | null = null

/**
 * Navigation privée : Chrome plante en relisant un emplacement de fichier enregistré dans IndexedDB.
 * Les liens y sont donc gardés en mémoire, le temps de la séance (qui ne laisse de toute façon rien derrière elle).
 * Détection par le quota de stockage, plafonné en navigation privée (méthode de detectIncognito).
 */
let privateMode: Promise<boolean> | null = null
const memoryLinks = new Map<string, FileLink>()

function isPrivate() {
  privateMode ??= (async () => {
    try {
      const { quota } = await navigator.storage.estimate()
      const heap = (performance as Performance & { memory?: { jsHeapSizeLimit: number } }).memory?.jsHeapSizeLimit ?? 2 ** 30
      return !!quota && quota < heap * 2
    } catch {
      return false
    }
  })()
  return privateMode
}

function openLinks(): Promise<IDBDatabase> {
  linksDb ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(LINKS_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(LINKS, { keyPath: 'docId' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      linksDb = null
      reject(req.error)
    }
  })
  return linksDb
}

async function links<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) {
  if (await isPrivate()) throw new Error('private browsing')
  const db = await openLinks()
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(LINKS, mode).objectStore(LINKS))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Lien du schéma ; null sans lien ou si les liens sont indisponibles (navigation privée…). */
export async function getLink(docId: string): Promise<FileLink | null> {
  if (!picker().showSaveFilePicker) return null
  try {
    return ((await links('readonly', (s) => s.get(docId))) as FileLink | undefined) ?? null
  } catch {
    return memoryLinks.get(docId) ?? null
  }
}

export async function putLink(link: FileLink) {
  try {
    await links('readwrite', (s) => s.put(link))
  } catch {
    // navigation privée ou liens indisponibles : en mémoire, le temps de la séance
    memoryLinks.set(link.docId, link)
  }
}

export async function deleteLink(docId: string) {
  memoryLinks.delete(docId)
  try {
    await links('readwrite', (s) => s.delete(docId))
  } catch {
    // rien à effacer
  }
}

/** Schéma déjà lié à ce fichier (même emplacement sur le disque), s'il y en a un. */
async function findLink(handle: FileSystemFileHandle): Promise<FileLink | null> {
  let all: FileLink[]
  try {
    all = (await links('readonly', (s) => s.getAll())) as FileLink[]
  } catch {
    all = [...memoryLinks.values()]
  }
  for (const link of all) {
    if (await link.handle.isSameEntry(handle).catch(() => false)) return link
  }
  return null
}

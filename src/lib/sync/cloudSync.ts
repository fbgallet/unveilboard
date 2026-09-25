// Synchronisation d'un document avec le serveur (Neon), par instantanés.
//
// - Le cache local de tldraw (IndexedDB, via persistenceKey) permet une ouverture
//   instantanée et un travail hors ligne.
// - Chaque modification de l'utilisateur déclenche une sauvegarde différée.
// - Verrouillage optimiste : le serveur refuse (409) une sauvegarde basée sur une
//   version dépassée, c'est-à-dire modifiée entre-temps sur un autre appareil.

import { atom, getSnapshot, loadSnapshot, type Editor, type TLStoreSnapshot } from 'tldraw'
import { readSequence, writeSequence } from '../canvas/adapter'
import { seedDemo } from '../demo'
import { emptySequence } from '../sequence/types'

export type SyncState = 'loading' | 'saved' | 'pending' | 'saving' | 'offline' | 'conflict' | 'error'

export interface SyncStatus {
  state: SyncState
  message?: string
}

export const syncStatusAtom = atom<SyncStatus>('syncStatus', { state: 'loading' })

/** Actions exposées à l'interface en cas de conflit. */
export const syncControls = atom<{ reloadFromServer(): void; overwriteServer(): void } | null>(
  'syncControls',
  null
)

interface LocalMeta {
  /** Version serveur sur laquelle repose le cache local. */
  version: number
  /** Modifications locales pas encore enregistrées sur le serveur. */
  dirty: boolean
}

const SAVE_DELAY_MS = 1200
const RETRY_DELAY_MS = 5000

export function startCloudSync(editor: Editor, docId: string, opts: { seedDemo: boolean }) {
  const metaKey = `sync:${docId}`
  let meta: LocalMeta = readMeta(metaKey) ?? { version: -1, dirty: false }
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let saving = false
  let saveAgain = false
  let disposed = false
  /** Contenu (JSON) de la dernière version synchronisée : évite d'envoyer un document inchangé. */
  let lastSyncedJson: string | null = null

  const setStatus = (state: SyncState, message?: string) => {
    if (!disposed) syncStatusAtom.set({ state, message })
  }
  const setMeta = (next: LocalMeta) => {
    meta = next
    writeMeta(metaKey, next)
  }

  const documentSnapshot = () => getSnapshot(editor.store).document
  const hasLocalContent = () => editor.store.allRecords().some((r) => r.typeName === 'shape') || !!readSequence(editor)

  /**
   * Remplace le document par la version serveur.
   * Chargé comme une modification « utilisateur » (hors historique d'annulation) : c'est la seule
   * façon pour que le cache local de tldraw l'enregistre. La sauvegarde qui s'ensuit est
   * neutralisée par la comparaison avec lastSyncedJson.
   */
  function applyServer(snapshot: TLStoreSnapshot, version: number) {
    editor.run(() => loadSnapshot(editor.store, { document: snapshot }), { history: 'ignore' })
    editor.clearHistory()
    lastSyncedJson = JSON.stringify(documentSnapshot())
    setMeta({ version, dirty: false })
  }

  async function fetchServer() {
    const res = await fetch(`/api/documents/${docId}`, { cache: 'no-store' })
    if (!res.ok) throw new HttpError(res.status)
    return (await res.json()) as { version: number; snapshot: TLStoreSnapshot | null }
  }

  // ---------- Chargement initial ----------

  async function init() {
    setStatus('loading')
    let server: Awaited<ReturnType<typeof fetchServer>>
    try {
      server = await fetchServer()
    } catch (e) {
      // Hors ligne : on travaille sur le cache local, la sauvegarde reprendra plus tard.
      ensureSequence()
      setStatus(e instanceof HttpError && e.status === 401 ? 'error' : 'offline', describe(e))
      if (meta.dirty) scheduleRetry()
      return
    }
    if (disposed) return

    if (!server.snapshot) {
      // Document neuf côté serveur.
      if (!hasLocalContent()) {
        writeSequence(editor, opts.seedDemo ? seedDemo(editor) : emptySequence())
        editor.zoomToFit()
      }
      setMeta({ version: server.version, dirty: true })
      return void save()
    }

    const localIsCurrent = meta.version === server.version && hasLocalContent()
    if (localIsCurrent) {
      if (meta.dirty) return void save()
      lastSyncedJson = JSON.stringify(documentSnapshot())
      setStatus('saved')
      return
    }
    if (meta.dirty && hasLocalContent()) keepLocalBackup(docId, documentSnapshot())
    applyServer(server.snapshot, server.version)
    ensureSequence()
    editor.zoomToFit()
    setStatus('saved')
  }

  function ensureSequence() {
    if (!readSequence(editor)) writeSequence(editor, emptySequence())
  }

  // ---------- Sauvegarde ----------

  function scheduleSave(delay = SAVE_DELAY_MS) {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void save(), delay)
  }

  function scheduleRetry() {
    scheduleSave(RETRY_DELAY_MS)
  }

  async function save(force = false) {
    if (disposed) return
    if (saving) {
      saveAgain = true
      return
    }
    clearTimeout(saveTimer)
    const json = JSON.stringify(documentSnapshot())
    if (!force && json === lastSyncedJson) {
      // Rien de neuf par rapport au serveur (ex. : version serveur tout juste chargée).
      setMeta({ ...meta, dirty: false })
      setStatus('saved')
      return
    }
    saving = true
    saveAgain = false
    setStatus('saving')
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: `{"snapshot":${json},${JSON.stringify({
          title: readSequence(editor)?.title ?? 'Sans titre',
          baseVersion: meta.version,
          force,
        }).slice(1)}`,
      })
      if (res.status === 409) {
        setStatus('conflict', 'Ce schéma a été modifié sur un autre appareil.')
        return
      }
      if (!res.ok) throw new HttpError(res.status)
      const { version } = (await res.json()) as { version: number }
      lastSyncedJson = json
      // Des modifications ont pu arriver pendant l'envoi : elles restent à enregistrer.
      setMeta({ version, dirty: saveAgain })
      setStatus(saveAgain ? 'pending' : 'saved')
    } catch (e) {
      setStatus(e instanceof HttpError && e.status < 500 ? 'error' : 'offline', describe(e))
      scheduleRetry()
    } finally {
      saving = false
      if (saveAgain && !disposed && syncStatusAtom.get().state !== 'conflict') scheduleSave(200)
    }
  }

  // ---------- Écoute des modifications et des retours sur l'onglet ----------

  const stopListening = editor.store.listen(
    () => {
      if (!meta.dirty) setMeta({ ...meta, dirty: true })
      if (syncStatusAtom.get().state === 'conflict') return
      setStatus('pending')
      scheduleSave()
    },
    { source: 'user', scope: 'document' }
  )

  /** Au retour sur l'onglet : récupérer une version plus récente enregistrée ailleurs. */
  async function checkForRemoteUpdate() {
    if (meta.dirty || saving) return
    try {
      const res = await fetch(`/api/documents/${docId}?meta=1`, { cache: 'no-store' })
      if (!res.ok) return
      const { version } = (await res.json()) as { version: number }
      if (version > meta.version) {
        const server = await fetchServer()
        if (!meta.dirty && server.snapshot) applyServer(server.snapshot, server.version)
      }
      setStatus('saved')
    } catch {
      // réseau indisponible : on réessaiera au prochain retour
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      if (meta.dirty) void save()
    } else {
      void checkForRemoteUpdate()
    }
  }
  const onOnline = () => {
    if (meta.dirty) void save()
    else void checkForRemoteUpdate()
  }
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (meta.dirty) {
      void save()
      e.preventDefault()
    }
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('online', onOnline)
  window.addEventListener('beforeunload', onBeforeUnload)

  syncControls.set({
    async reloadFromServer() {
      try {
        const server = await fetchServer()
        keepLocalBackup(docId, documentSnapshot())
        if (server.snapshot) applyServer(server.snapshot, server.version)
        setStatus('saved')
      } catch (e) {
        setStatus('offline', describe(e))
      }
    },
    overwriteServer() {
      void save(true)
    },
  })

  void init()

  return () => {
    disposed = true
    clearTimeout(saveTimer)
    stopListening()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('beforeunload', onBeforeUnload)
    syncControls.set(null)
    syncStatusAtom.set({ state: 'loading' })
  }
}

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`)
  }
}

function describe(e: unknown) {
  if (e instanceof HttpError) {
    if (e.status === 401) return 'Session expirée : reconnectez-vous.'
    if (e.status === 404) return 'Document introuvable sur le serveur.'
    return `Erreur serveur (${e.status}).`
  }
  return 'Pas de connexion : modifications conservées sur cet appareil.'
}

function readMeta(key: string): LocalMeta | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as LocalMeta) : null
  } catch {
    return null
  }
}

function writeMeta(key: string, meta: LocalMeta) {
  try {
    localStorage.setItem(key, JSON.stringify(meta))
  } catch {
    // stockage indisponible : la synchronisation fonctionne, sans mémoire entre les séances
  }
}

/** Avant d'écraser des modifications locales, on en garde une copie (au cas où). */
function keepLocalBackup(docId: string, snapshot: TLStoreSnapshot) {
  try {
    localStorage.setItem(`backup:${docId}`, JSON.stringify({ savedAt: Date.now(), snapshot }))
  } catch {
    // trop volumineux ou stockage indisponible
  }
}

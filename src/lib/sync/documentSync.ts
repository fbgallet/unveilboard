// Synchronisation d'un document avec son stockage (serveur ou navigateur), par instantanés.
//
// - Le cache local de tldraw (IndexedDB, via persistenceKey) permet une ouverture
//   instantanée et un travail hors ligne.
// - Chaque modification de l'utilisateur déclenche une sauvegarde différée.
// - Verrouillage optimiste : le stockage refuse une sauvegarde basée sur une version
//   dépassée, c'est-à-dire modifiée entre-temps sur un autre appareil.
// - Plusieurs onglets sur le même document : tldraw les synchronise entre eux, et un seul
//   (l'« enregistreur », désigné par un verrou du navigateur) enregistre pour tous.
//   Sans cela, chaque onglet se croirait modifié et ils entreraient en conflit.

import { atom, getSnapshot, loadSnapshot, type Editor, type TLStoreSnapshot } from 'tldraw'
import { readSequence, writeSequence } from '../canvas/adapter'
import { seedDemo } from '../demo'
import { seedMap } from '../canvas/mapImport'
import { takePendingMap } from '../map/pending'
import type { DemoName } from '../demoNames'
import { m } from '@/i18n/client'
import { emptySequence } from '../sequence/types'
import { normalizeTags } from '../tags'
import { StorageError, type DocumentStore, type StoredDocument } from '../storage/types'

export type SyncState = 'loading' | 'saved' | 'pending' | 'saving' | 'offline' | 'conflict' | 'error'

export interface SyncStatus {
  state: SyncState
  message?: string
  /** Nature de l'erreur, pour proposer la bonne action (ex. : se reconnecter). */
  kind?: StorageError['kind']
}

export const syncStatusAtom = atom<SyncStatus>('syncStatus', { state: 'loading' })

/** Actions exposées à l'interface en cas de conflit. */
export const syncControls = atom<{ reloadFromServer(): void; overwriteServer(): void } | null>(
  'syncControls',
  null
)

/** Mode de stockage du document ouvert (libellés de l'interface). */
export const storageModeAtom = atom<DocumentStore['mode']>('storageMode', 'cloud')

interface LocalMeta {
  /** Version enregistrée sur laquelle repose le cache local. */
  version: number
  /** Modifications locales pas encore enregistrées. */
  dirty: boolean
}

const SAVE_DELAY_MS = 1200
const RETRY_DELAY_MS = 5000

export function startDocumentSync(
  editor: Editor,
  docId: string,
  store: DocumentStore,
  /** onLoaded : document chargé (onglet enregistreur), pour les mises à niveau de contenu. */
  opts: { demo: DemoName | null; onLoaded?: () => void }
) {
  storageModeAtom.set(store.mode)
  const metaKey = `sync:${docId}`
  let meta: LocalMeta = readMeta(metaKey) ?? { version: -1, dirty: false }
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let saving = false
  let saveAgain = false
  let disposed = false
  /** Contenu (JSON) de la dernière version enregistrée : évite de réenregistrer un document inchangé. */
  let lastSyncedJson: string | null = null
  /** Cet onglet est celui qui enregistre ce document. */
  let leader = false
  let initialized = false

  const setStatus = (state: SyncState, message?: string, kind?: StorageError['kind']) => {
    if (!disposed) syncStatusAtom.set({ state, message, kind })
  }
  const setMeta = (next: LocalMeta) => {
    meta = next
    writeMeta(metaKey, next)
  }

  const documentSnapshot = () => getSnapshot(editor.store).document
  const hasLocalContent = () => editor.store.allRecords().some((r) => r.typeName === 'shape') || !!readSequence(editor)

  /**
   * Remplace le document par la version enregistrée.
   * Chargé comme une modification « utilisateur » (hors historique d'annulation) : c'est la seule
   * façon pour que le cache local de tldraw l'enregistre. La sauvegarde qui s'ensuit est
   * neutralisée par la comparaison avec lastSyncedJson.
   */
  function applyServer(snapshotJson: string, version: number) {
    const snapshot = JSON.parse(snapshotJson) as TLStoreSnapshot
    editor.run(() => loadSnapshot(editor.store, { document: snapshot }), { history: 'ignore' })
    editor.clearHistory()
    lastSyncedJson = JSON.stringify(documentSnapshot())
    setMeta({ version, dirty: false })
  }

  async function fetchServer(): Promise<StoredDocument> {
    const doc = await store.load(docId)
    if (!doc) throw new StorageError('missing', m().errors.notFound)
    return doc
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
      setStatus(stateFor(e), describe(e), kindOf(e))
      if (meta.dirty) scheduleRetry()
      return
    }
    if (disposed) return

    if (!server.snapshotJson) {
      // Document neuf.
      if (!hasLocalContent()) {
        // Schéma d'exemple, ou schéma importé (format JSON) en attente d'ouverture.
        const pending = opts.demo ? null : takePendingMap(docId)
        writeSequence(
          editor,
          opts.demo ? seedDemo(editor, opts.demo) : pending ? seedMap(editor, pending.map, { unverified: pending.unverified }) : emptySequence(m().sequence.defaultTitle)
        )
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
    applyServer(server.snapshotJson, server.version)
    ensureSequence()
    editor.zoomToFit()
    setStatus('saved')
  }

  function ensureSequence() {
    if (!readSequence(editor)) writeSequence(editor, emptySequence(m().sequence.defaultTitle))
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
    if (disposed || !leader) return
    if (saving) {
      saveAgain = true
      return
    }
    clearTimeout(saveTimer)
    const json = JSON.stringify(documentSnapshot())
    if (!force && json === lastSyncedJson) {
      // Rien de neuf par rapport à la version enregistrée (ex. : tout juste chargée).
      setMeta({ ...meta, dirty: false })
      setStatus('saved')
      return
    }
    saving = true
    saveAgain = false
    setStatus('saving')
    try {
      const result = await store.save(docId, {
        snapshotJson: json,
        title: readSequence(editor)?.title ?? m().common.untitled,
        tags: normalizeTags(editor.getDocumentSettings().meta.tags),
        baseVersion: meta.version,
        force,
      })
      if (!result.ok && result.reason === 'conflict') {
        setStatus('conflict', m().sync.modifiedElsewhere(store.mode === 'cloud'))
        return
      }
      if (!result.ok) throw new StorageError('missing', m().errors.notFound)
      const { version } = result
      lastSyncedJson = json
      // Des modifications ont pu arriver pendant l'envoi : elles restent à enregistrer.
      setMeta({ version, dirty: saveAgain })
      setStatus(saveAgain ? 'pending' : 'saved')
    } catch (e) {
      setStatus(stateFor(e), describe(e), kindOf(e))
      scheduleRetry()
    } finally {
      saving = false
      if (saveAgain && !disposed && syncStatusAtom.get().state !== 'conflict') scheduleSave(200)
    }
  }

  // ---------- Écoute des modifications et des retours sur l'onglet ----------

  // Toutes les modifications, y compris celles des autres onglets (reçues comme « remote ») :
  // l'enregistreur les sauvegarde pour tous.
  const stopListening = editor.store.listen(
    () => {
      if (!leader) return
      if (!meta.dirty) setMeta({ ...meta, dirty: true })
      if (syncStatusAtom.get().state === 'conflict') return
      setStatus('pending')
      scheduleSave()
    },
    { scope: 'document' }
  )

  /** Au retour sur l'onglet : récupérer une version plus récente enregistrée ailleurs. */
  async function checkForRemoteUpdate() {
    if (!leader || meta.dirty || saving) return
    try {
      const version = await store.version(docId)
      if (version === null) return
      if (version > meta.version) {
        const server = await fetchServer()
        if (!meta.dirty && server.snapshotJson) applyServer(server.snapshotJson, server.version)
      }
      setStatus('saved')
    } catch {
      // réseau indisponible : on réessaiera au prochain retour
    }
  }

  // Les autres onglets affichent l'état de l'enregistreur (mémorisé dans localStorage).
  const onStorage = (e: StorageEvent) => {
    if (leader || e.key !== metaKey || !e.newValue) return
    meta = JSON.parse(e.newValue) as LocalMeta
    setStatus(meta.dirty ? 'pending' : 'saved')
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
    if (leader && meta.dirty) {
      void save()
      e.preventDefault()
    }
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('online', onOnline)
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('storage', onStorage)

  syncControls.set({
    async reloadFromServer() {
      try {
        const server = await fetchServer()
        keepLocalBackup(docId, documentSnapshot())
        if (server.snapshotJson) applyServer(server.snapshotJson, server.version)
        setStatus('saved')
      } catch (e) {
        setStatus('offline', describe(e), kindOf(e))
      }
    },
    overwriteServer() {
      void save(true)
    },
  })

  // ---------- Enregistreur : un seul onglet par document ----------

  function becomeLeader() {
    leader = true
    if (!initialized) {
      initialized = true
      return void init().then(() => !disposed && opts.onLoaded?.())
    }
    // Relève d'un onglet fermé : reprendre là où il s'était arrêté.
    meta = readMeta(metaKey) ?? meta
    if (meta.dirty) void save()
    else {
      lastSyncedJson = JSON.stringify(documentSnapshot())
      setStatus('saved')
    }
  }

  const lockAbort = new AbortController()
  let releaseLock: (() => void) | undefined
  if (typeof navigator !== 'undefined' && navigator.locks) {
    navigator.locks
      .request(`sync:${docId}`, { signal: lockAbort.signal }, () => {
        if (disposed) return
        becomeLeader()
        // Verrou gardé jusqu'à la fermeture du document.
        return new Promise<void>((resolve) => (releaseLock = resolve))
      })
      .catch(() => {}) // demande annulée à la fermeture
    // En attendant : un autre onglet enregistre ce document.
    queueMicrotask(() => {
      if (!leader && !disposed) setStatus(meta.dirty ? 'pending' : 'saved')
    })
  } else {
    becomeLeader()
  }

  return () => {
    disposed = true
    lockAbort.abort()
    releaseLock?.()
    window.removeEventListener('storage', onStorage)
    clearTimeout(saveTimer)
    stopListening()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('beforeunload', onBeforeUnload)
    syncControls.set(null)
    syncStatusAtom.set({ state: 'loading' })
  }
}

/** Hors ligne ou serveur indisponible : on réessaiera ; les autres erreurs sont signalées. */
function stateFor(e: unknown): SyncState {
  return e instanceof StorageError && !['offline', 'server'].includes(e.kind) ? 'error' : 'offline'
}

function describe(e: unknown) {
  if (e instanceof StorageError) return e.message
  return m().errors.offline
}

function kindOf(e: unknown): StorageError['kind'] {
  return e instanceof StorageError ? e.kind : 'offline'
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

// Fichier .tldr lié au schéma ouvert (Chrome, Edge : File System Access API), tenu à jour automatiquement.
//
// - Chaque modification est écrite dans le fichier après un court délai ; Ctrl/⌘ + S l'écrit aussitôt.
// - Avant d'écrire, on vérifie que le fichier n'a pas été modifié ailleurs (dossier synchronisé
//   modifié sur un autre ordinateur, autre application) : on ne l'écrase jamais sans le demander.
// - Au retour sur l'onglet, une version plus récente du fichier est chargée.
// - Le navigateur redemande l'autorisation d'écrire après chaque redémarrage : un clic suffit.
// Indépendant de documentSync.ts : le schéma reste aussi enregistré dans son stockage habituel.

import { atom, getSnapshot, loadSnapshot, serializeTldrawJsonBlob, type Editor, type TLStoreSnapshot } from 'tldraw'
import { m } from '@/i18n/client'
import { allowWriting, deleteLink, getLink, putLink, readTldrFile, type FileLink } from '../storage/tldrFile'
import { saveTldrAs, writeTldr } from '../storage/tldrSave'

export type FileLinkState = 'saved' | 'pending' | 'saving' | 'permission' | 'changed' | 'error'

export interface FileLinkStatus {
  name: string
  state: FileLinkState
  message?: string
}

/** Fichier lié au schéma ouvert et état de son enregistrement ; null sans fichier lié. */
export const fileLinkAtom = atom<FileLinkStatus | null>('fileLink', null)

export interface FileActions {
  /** Enregistre dans le fichier lié, ou demande où enregistrer (Ctrl/⌘ + S). */
  save(): Promise<void>
  /** Enregistre dans un nouveau fichier, qui devient le fichier lié (Ctrl/⌘ + Maj + S). */
  saveAs(): Promise<void>
  /** Redonne l'autorisation d'écrire dans le fichier. */
  reconnect(): Promise<void>
  /** Remplace le schéma par le contenu du fichier (modifié ailleurs). */
  loadFile(): Promise<void>
  /** Remplace le fichier (modifié ailleurs) par le schéma. */
  overwriteFile(): Promise<void>
  /** Ne plus tenir le fichier à jour. */
  unlink(): Promise<void>
}

export const fileActionsAtom = atom<FileActions | null>('fileActions', null)

const WRITE_DELAY_MS = 1500

export function startFileSync(editor: Editor, docId: string) {
  let link: FileLink | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let writing = false
  let again = false
  let disposed = false
  /** Contenu (JSON) du schéma lors de la dernière écriture ou lecture du fichier. */
  let lastJson: string | null = null

  const documentJson = () => JSON.stringify(getSnapshot(editor.store).document)
  const state = () => fileLinkAtom.get()?.state
  const setState = (next: FileLinkState, message?: string) => {
    if (!disposed) fileLinkAtom.set(link ? { name: link.name, state: next, message } : null)
  }
  const update = async (patch: Partial<FileLink>) => {
    if (!link) return
    link = { ...link, ...patch }
    await putLink(link)
  }
  const markPending = () => (link && !link.pending ? update({ pending: true }) : Promise.resolve())
  const changedOutside = () => setState('changed', m().files.changedOutside(link?.name ?? ''))

  function fail(e: unknown) {
    const name = e instanceof DOMException ? e.name : ''
    if (name === 'NotAllowedError' || name === 'SecurityError') return setState('permission')
    setState('error', name === 'NotFoundError' ? m().files.missing : e instanceof Error ? e.message : String(e))
  }

  function schedule(delay = WRITE_DELAY_MS) {
    clearTimeout(timer)
    timer = setTimeout(() => void write(), delay)
  }

  async function init() {
    link = await getLink(docId)
    if (!link || disposed) return
    if (await allowWriting(link.handle, false)) await refresh()
    else setState('permission')
  }

  /** Compare au fichier : charge une version plus récente, ou reprend l'écriture en attente. */
  async function refresh() {
    if (!link || writing) return
    let file: File
    try {
      file = await link.handle.getFile()
    } catch (e) {
      return fail(e)
    }
    if (file.lastModified !== link.lastModified) return link.pending ? changedOutside() : load(file)
    if (link.pending) return write()
    setState('saved')
  }

  /** Remplace le schéma par le contenu du fichier (hors historique d'annulation). */
  async function load(file?: File) {
    if (!link) return
    try {
      file ??= await link.handle.getFile()
      const snapshot = JSON.parse((await readTldrFile(file)).snapshotJson) as TLStoreSnapshot
      editor.run(() => loadSnapshot(editor.store, { document: snapshot }), { history: 'ignore' })
      editor.clearHistory()
      lastJson = documentJson()
      await update({ lastModified: file.lastModified, pending: false })
      setState('saved')
    } catch (e) {
      fail(e)
    }
  }

  /** ask : demander l'autorisation si besoin (geste de l'utilisateur) ; force : écraser une version modifiée ailleurs. */
  async function write({ ask = false, force = false } = {}) {
    if (!link) return
    if (writing) {
      again = true
      return
    }
    clearTimeout(timer)
    if (!(await allowWriting(link.handle, ask))) {
      await markPending()
      return setState('permission')
    }
    writing = true
    again = false
    try {
      const json = documentJson()
      if (!force && json === lastJson) {
        await update({ pending: false })
        return setState('saved')
      }
      if (!force && (await link.handle.getFile()).lastModified !== link.lastModified) {
        await markPending()
        return changedOutside()
      }
      setState('saving')
      await writeTldr(link.handle, await serializeTldrawJsonBlob(editor))
      const { lastModified } = await link.handle.getFile()
      lastJson = json
      // Des modifications ont pu arriver pendant l'écriture : elles restent à écrire.
      await update({ lastModified, pending: again })
      setState(again ? 'pending' : 'saved')
    } catch (e) {
      await markPending()
      fail(e)
    } finally {
      writing = false
      if (again && !disposed) schedule(200)
    }
  }

  // Modifications faites dans cet onglet (celles des autres onglets y sont écrites par eux).
  const stopListening = editor.store.listen(
    () => {
      if (!link) return
      void markPending()
      const current = state()
      if (current === 'changed' || current === 'permission') return
      if (current !== 'saving') setState('pending')
      schedule()
    },
    { scope: 'document', source: 'user' }
  )

  async function onVisibility() {
    if (!link) return
    if (document.visibilityState === 'hidden') {
      if (link.pending && state() === 'pending') void write()
      return
    }
    if (state() === 'changed') return
    if (await allowWriting(link.handle, false)) void refresh()
    else setState('permission')
  }

  // Une modification en attente peut n'être que le chargement du fichier : on compare au dernier contenu écrit ou lu.
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (link?.pending && state() !== 'changed' && documentJson() !== lastJson) {
      void write()
      e.preventDefault()
    }
  }

  const actions: FileActions = {
    async save() {
      if (!link) return actions.saveAs()
      if (state() === 'permission') return actions.reconnect()
      if (state() === 'changed') return
      await write({ ask: true })
    },
    async saveAs() {
      const handle = await saveTldrAs(editor)
      if (!handle) return
      clearTimeout(timer)
      const { lastModified, name } = await handle.getFile()
      link = { docId, handle, name, lastModified, pending: false }
      await putLink(link)
      lastJson = documentJson()
      setState('saved')
    },
    async reconnect() {
      if (!link) return
      if (await allowWriting(link.handle, true)) await refresh()
      else setState('permission')
    },
    loadFile: () => load(),
    overwriteFile: () => write({ ask: true, force: true }),
    async unlink() {
      clearTimeout(timer)
      await deleteLink(docId)
      link = null
      fileLinkAtom.set(null)
    },
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() !== 's' || !(e.metaKey || e.ctrlKey) || e.altKey) return
    e.preventDefault()
    e.stopPropagation()
    void (e.shiftKey ? actions.saveAs() : actions.save()).catch((err) => alert(err instanceof Error ? err.message : err))
  }

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('keydown', onKeyDown, true)
  fileActionsAtom.set(actions)
  void init()

  return () => {
    // En quittant le schéma : dernière écriture en attente.
    if (link?.pending && state() === 'pending') void write()
    disposed = true
    clearTimeout(timer)
    stopListening()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('beforeunload', onBeforeUnload)
    window.removeEventListener('keydown', onKeyDown, true)
    fileActionsAtom.set(null)
    fileLinkAtom.set(null)
  }
}

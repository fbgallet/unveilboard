import { serializeTldrawJsonBlob, type Editor } from 'tldraw'
import { readSequence } from '../canvas/adapter'
import { m } from '@/i18n/client'
import { isAbort, picker, tldrTypes } from './tldrFile'

/**
 * Enregistre le document ouvert au format .tldr (séquence comprise, dans document.meta).
 * Chrome et Edge demandent où l'enregistrer et renvoient le fichier choisi (pour le lier au schéma) ;
 * ailleurs, le fichier est téléchargé. null : annulé, ou téléchargé.
 */
export async function saveTldrAs(editor: Editor): Promise<FileSystemFileHandle | null> {
  const blob = await serializeTldrawJsonBlob(editor)
  const fallback = m().files.defaultName
  const title = readSequence(editor)?.title || fallback
  const name = `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || fallback}.tldr`
  const { showSaveFilePicker } = picker()
  if (showSaveFilePicker) {
    let handle: FileSystemFileHandle
    try {
      handle = await showSaveFilePicker({ suggestedName: name, types: tldrTypes() })
    } catch (e) {
      if (isAbort(e)) return null
      throw e
    }
    await writeTldr(handle, blob)
    return handle
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  return null
}

/** Écrit le document dans un fichier .tldr déjà choisi. */
export async function writeTldr(handle: FileSystemFileHandle, blob: Blob) {
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}

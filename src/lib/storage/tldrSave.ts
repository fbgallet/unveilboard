import { serializeTldrawJsonBlob, type Editor } from 'tldraw'
import { readSequence } from '../canvas/adapter'
import { m } from '@/i18n/client'
import { isAbort, picker, tldrTypes } from './tldrFile'

/**
 * Enregistre le document ouvert au format .tldr (séquence comprise, dans document.meta).
 * Chrome et Edge demandent où l'enregistrer ; ailleurs, le fichier est téléchargé.
 */
export async function saveTldrAs(editor: Editor) {
  const blob = await serializeTldrawJsonBlob(editor)
  const fallback = m().files.defaultName
  const title = readSequence(editor)?.title || fallback
  const name = `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || fallback}.tldr`
  const { showSaveFilePicker } = picker()
  if (showSaveFilePicker) {
    try {
      const handle = await showSaveFilePicker({ suggestedName: name, types: tldrTypes() })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
    } catch (e) {
      if (!isAbort(e)) throw e
    }
    return
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

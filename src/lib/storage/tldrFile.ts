// Fichiers .tldr (format natif de tldraw) : sauvegarde et transfert des schémas,
// indispensables en mode local où rien n'est stocké en ligne.

import { serializeTldrawJsonBlob, type Editor } from 'tldraw'
import { readSequence } from '../canvas/adapter'
import type { DocumentStore } from './types'

// API de choix de fichier (Chrome, Edge) : absentes des types DOM de TypeScript.
interface FilePickerOptions {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}
interface FilePickerWindow {
  showSaveFilePicker?(opts: FilePickerOptions): Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>
  showOpenFilePicker?(opts: FilePickerOptions): Promise<{ getFile(): Promise<File> }[]>
}
const picker = () => window as unknown as FilePickerWindow
const TLDR_TYPES = [{ description: 'Schéma tldraw', accept: { 'application/json': ['.tldr'] } }]
const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/** Lit un fichier .tldr et le convertit en instantané de document (JSON), avec son titre. */
export async function readTldrFile(file: File): Promise<{ title: string; snapshotJson: string }> {
  let data: { records?: { id: string; typeName: string; meta?: Record<string, unknown> }[]; schema?: unknown }
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('Ce fichier n’est pas un fichier .tldr valide.')
  }
  if (!Array.isArray(data?.records) || !data.schema) throw new Error('Ce fichier n’est pas un fichier .tldr valide.')
  const store = Object.fromEntries(data.records.map((r) => [r.id, r]))
  // Titre : celui de la séquence enregistrée dans le document, sinon le nom du fichier.
  const sequence = data.records.find((r) => r.typeName === 'document')?.meta?.sequence as { title?: string } | undefined
  const title = sequence?.title || file.name.replace(/\.tldr$/i, '') || 'Sans titre'
  // Les migrations du schéma sont appliquées au chargement dans l'éditeur.
  return { title, snapshotJson: JSON.stringify({ store, schema: data.schema }) }
}

/**
 * Enregistre le document ouvert au format .tldr (séquence comprise, dans document.meta).
 * Chrome et Edge demandent où l'enregistrer ; ailleurs, le fichier est téléchargé.
 */
export async function saveTldrAs(editor: Editor) {
  const blob = await serializeTldrawJsonBlob(editor)
  const title = readSequence(editor)?.title || 'schéma'
  const name = `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'schéma'}.tldr`
  const { showSaveFilePicker } = picker()
  if (showSaveFilePicker) {
    try {
      const handle = await showSaveFilePicker({ suggestedName: name, types: TLDR_TYPES })
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

/** Demande un fichier .tldr à l'utilisateur ; null s'il annule. */
export async function pickTldrFile(): Promise<File | null> {
  const { showOpenFilePicker } = picker()
  if (showOpenFilePicker) {
    try {
      const [handle] = await showOpenFilePicker({ types: TLDR_TYPES })
      return await handle.getFile()
    } catch (e) {
      if (isAbort(e)) return null
      throw e
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.tldr,application/json'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/** Importe un fichier .tldr comme nouveau document ; renvoie son identifiant. */
export async function importTldrFile(store: DocumentStore, file: File) {
  const { title, snapshotJson } = await readTldrFile(file)
  return store.create(title, snapshotJson)
}

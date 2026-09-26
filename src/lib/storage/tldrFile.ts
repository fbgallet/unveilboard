// Fichiers .tldr (format natif de tldraw) : sauvegarde et transfert des schémas,
// indispensables en mode local où rien n'est stocké en ligne.

import { serializeTldrawJsonBlob, type Editor } from 'tldraw'
import { readSequence } from '../canvas/adapter'

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

/** Télécharge le document ouvert au format .tldr (séquence comprise, dans document.meta). */
export async function downloadTldr(editor: Editor) {
  const blob = await serializeTldrawJsonBlob(editor)
  const title = readSequence(editor)?.title || 'schéma'
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'schéma'}.tldr`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

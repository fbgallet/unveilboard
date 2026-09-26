// Notes d'objet : un texte (Markdown léger, comme la narration) attaché à une forme
// dans meta.note, affiché dans le panneau de narration pendant la présentation.
// Le schéma reste léger : le développement vit dans le panneau, pas sur le canevas.

import { renderPlaintextFromRichText, type Editor, type TLShape, type TLShapeId, type TLRichText } from 'tldraw'
import { readSequence, writeSequence } from './adapter'
import { SEQUENCE_VERSION } from '../sequence/types'

export function noteOf(shape: TLShape | undefined): string {
  const note = shape?.meta.note
  return typeof note === 'string' ? note : ''
}

export function setNote(editor: Editor, id: TLShapeId, note: string) {
  const shape = editor.getShape(id)
  if (!shape || noteOf(shape) === note) return
  editor.updateShape({ id, type: shape.type, meta: { ...shape.meta, note: note || null } })
}

/** Première ligne de la note, pour un titre ou une info-bulle. */
export function noteTitle(note: string) {
  return note.split('\n').find((l) => l.trim())?.replace(/^[#>*\s]+/, '').trim() ?? ''
}

/**
 * Documents d'avant les notes : chaque « détail » (forme texte rattachée sous une boîte,
 * meta.detailOf) devient la note de sa boîte, puis disparaît. La séquence migrée est
 * réenregistrée. Chargé hors historique : ce n'est pas une modification de l'utilisateur.
 */
export function convertLegacyDetails(editor: Editor) {
  const details = editor.getCurrentPageShapes().filter((s) => typeof s.meta.detailOf === 'string')
  const seq = readSequence(editor)
  const staleSequence = !!seq && (editor.getDocumentSettings().meta.sequence as { version?: number } | undefined)?.version !== SEQUENCE_VERSION
  if (!details.length && !staleSequence) return

  editor.run(
    () => {
      for (const detail of details) {
        const box = editor.getShape(detail.meta.detailOf as TLShapeId)
        const richText = (detail.props as { richText?: TLRichText }).richText
        const text = richText ? renderPlaintextFromRichText(editor, richText).trim() : ''
        if (box) {
          const note = [noteOf(box), text].filter(Boolean).join('\n\n')
          editor.updateShape({ id: box.id, type: box.type, meta: { ...box.meta, note: note || null, detailOpen: null } })
        }
      }
      editor.deleteShapes(details.map((d) => d.id))
      if (seq && staleSequence) writeSequence(editor, seq)
    },
    { history: 'ignore' }
  )
}

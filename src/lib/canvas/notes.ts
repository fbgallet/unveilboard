// Notes d'objet : un texte (Markdown léger, comme la narration) attaché à une forme
// dans meta.note, affiché dans le panneau de narration pendant la présentation.
// Le schéma reste léger : le développement vit dans le panneau, pas sur le canevas.

import {
  AssetRecordType,
  renderPlaintextFromRichText,
  type Editor,
  type TLAssetId,
  type TLRichText,
  type TLShape,
  type TLShapeId,
} from 'tldraw'
import { m } from '@/i18n/client'
import { MAX_INLINE_NOTE_IMAGE, fileToDataUrl, uploadImageOnline } from '../sync/assetStore'
import { readSequence, writeSequence } from './adapter'
import { SEQUENCE_VERSION, type Step } from '../sequence/types'

export function noteOf(shape: TLShape | undefined): string {
  const note = shape?.meta.note
  return typeof note === 'string' ? note : ''
}

export function setNote(editor: Editor, id: TLShapeId, note: string) {
  const shape = editor.getShape(id)
  if (!shape || noteOf(shape) === note) return
  editor.updateShape({ id, type: shape.type, meta: { ...shape.meta, note: note || null } })
}

/**
 * Notes à proposer en onglets dans le panneau : celles programmées à l'étape (« Afficher la note »),
 * puis celles ouvertes à la main ; seulement les objets qui ont bien une note.
 */
export function panelNoteIds(editor: Editor, step: Step | undefined, opened: string[]): string[] {
  return [...new Set([...plannedNoteIds(step), ...opened])].filter((id) => !!noteOf(editor.getShape(id as TLShapeId)))
}

/** Notes programmées à l'étape (sans bouton de fermeture : l'étape les montre). */
export function plannedNoteIds(step: Step | undefined): string[] {
  return step?.actions.filter((a) => a.type === 'note').flatMap((a) => a.targets) ?? []
}

// ---------- Images des notes et de la narration ----------

/**
 * Image insérée dans un texte Markdown : son adresse en ligne (Vercel Blob) ; sinon, une ressource
 * du document tldraw (partie avec lui, fichiers .tldr compris), désignée par « asset:<id> » pour
 * que le texte reste lisible.
 */
export async function storeTextImage(editor: Editor, file: File): Promise<string> {
  const online = await uploadImageOnline(file)
  if (online) return online
  if (file.size > MAX_INLINE_NOTE_IMAGE) throw new Error(m().errors.noteImageTooLarge)
  const src = await fileToDataUrl(file)
  const { w, h } = await imageSize(src)
  const id = AssetRecordType.createId()
  editor.createAssets([
    AssetRecordType.create({
      id,
      type: 'image',
      props: { name: file.name, src, w, h, mimeType: file.type, isAnimated: file.type === 'image/gif', fileSize: file.size },
    }),
  ])
  return id // « asset:… » : l'identifiant de la ressource tldraw
}

/** Adresse affichable d'une image de texte : résout les références « asset:<id> » du document. */
export function resolveTextImage(editor: Editor) {
  return (src: string) => {
    if (!src.startsWith('asset:')) return src
    const asset = editor.getAsset(src as TLAssetId)
    return asset && 'src' in asset.props ? (asset.props.src ?? undefined) : undefined
  }
}

function imageSize(src: string) {
  return new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve({ w: 1, h: 1 })
    img.src = src
  })
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

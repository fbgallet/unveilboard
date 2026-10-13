// Images ajoutées par l'IA ou trouvées : le style d'image du document, les images de départ (à
// modifier, à composer, ou le croquis d'une sélection), et l'image ajoutée, près d'un élément
// qu'elle illustre ou en tête d'un texte de la présentation (image d'ouverture). Une image générée
// est signalée (meta.generated : badge, identification) ; une image de Wikimedia Commons est citée
// (meta.credit : auteur, licence, page).

import { AssetRecordType, createShapeId, renderPlaintextFromRichText, type Editor, type JsonObject, type TLRichText, type TLShape, type TLShapeId } from 'tldraw'
import { m } from '@/i18n/client'
import { DEFAULT_IMAGE_STYLE, IMAGE_STYLES, MAX_REFERENCE, type AspectRatio, type ImageStyle } from '../ai/imageGen'
import { IMAGE_MODELS } from '../ai/models'
import { uploadImage } from '../sync/assetStore'
import { imageDataUri, isImage } from './imageReading'
import { contentLocale, createLink, presetResolver } from './mapImport'
import { creditOf, type CommonsImage } from '../images/commons'
import { emptySequence } from '../sequence/types'
import { readSequence, writeSequence } from './adapter'
import { storeTextImage } from './notes'
import { getTreeIndex } from './tree'

/** Image générée : par quel modèle, à partir de quoi, quand. */
export interface GeneratedMeta {
  model: string
  /** Ce qui a été demandé (le sujet, ou la consigne de modification). */
  request: string
  at: string
  /** Images de départ (modifiée, ou composée à partir d'elles). */
  from?: string[]
}

export function generatedOf(shape: TLShape | undefined): GeneratedMeta | undefined {
  const g = shape?.meta.generated as GeneratedMeta | undefined
  return g && typeof g === 'object' && typeof g.model === 'string' ? g : undefined
}

/** Style d'image du document (ses images vont ensemble), et sa précision en style libre. */
export function readImageStyle(editor: Editor): { style: ImageStyle; note: string } {
  const saved = editor.getDocumentSettings().meta.imageStyle as { style?: string; note?: string } | undefined
  const style = IMAGE_STYLES.find((s) => s === saved?.style) ?? DEFAULT_IMAGE_STYLE
  return { style, note: typeof saved?.note === 'string' ? saved.note : '' }
}

export function writeImageStyle(editor: Editor, value: { style: ImageStyle; note: string }) {
  const meta = editor.getDocumentSettings().meta
  editor.updateDocumentSettings({ meta: { ...meta, imageStyle: { style: value.style, ...(value.note.trim() && { note: value.note.trim() }) } } })
}

const plain = (editor: Editor, shape: TLShape | undefined) => {
  const rich = (shape?.props as { richText?: TLRichText } | undefined)?.richText
  return rich ? renderPlaintextFromRichText(editor, rich).trim() : ''
}

/** Sujet proposé pour mettre un élément en image (son texte), et ce qu'il illustre (son parent). */
export function pictureSubject(editor: Editor, id: TLShapeId): { subject: string; context: string } {
  const parent = getTreeIndex(editor).parent.get(id)
  return { subject: plain(editor, editor.getShape(id)), context: parent ? plain(editor, editor.getShape(parent)) : '' }
}

/** Images de départ, réduites, en « data: » URI ; une image trop lourde est une erreur. */
export async function referenceImages(editor: Editor, ids: TLShapeId[]): Promise<string[]> {
  const out: string[] = []
  for (const id of ids) {
    const shape = editor.getShape(id)
    if (!isImage(shape)) continue
    const uri = await imageDataUri(editor, shape)
    if (uri.length > MAX_REFERENCE) throw new Error(m().imageGen.referenceTooLarge)
    out.push(uri)
  }
  return out
}

/** Format le plus proche de celui d'objets (une image à modifier, un croquis), pour ne pas les déformer. */
export function aspectOf(editor: Editor, ids: TLShapeId[]): AspectRatio {
  const b = editor.getShapesPageBounds(ids)
  const ratio = b ? b.w / Math.max(1, b.h) : 4 / 3
  const choices: [AspectRatio, number][] = [
    ['16:9', 16 / 9],
    ['4:3', 4 / 3],
    ['1:1', 1],
    ['3:4', 3 / 4],
  ]
  return choices.reduce((best, c) => (Math.abs(c[1] - ratio) < Math.abs(best[1] - ratio) ? c : best))[0]
}

function imageSize(src: string) {
  return new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || 1024, h: img.naturalHeight || 1024 })
    img.onerror = () => resolve({ w: 1024, h: 1024 })
    img.src = src
  })
}

/** Texte de la présentation où insérer une image : l'accueil, ou la narration d'une étape. */
export interface TextTarget {
  step?: string
}

/**
 * Où va une image : près d'un élément (`near`, et reliée à `illustrates` par « illustre »), ou en
 * tête d'un texte de la présentation (image d'ouverture).
 */
export interface ImagePlace {
  near?: TLShapeId
  illustrates?: TLShapeId
  text?: TextTarget
}

/** Largeur d'une image ajoutée sur le canevas. */
const WIDTH = 360
const GAP = 80

/** Ajoute une image sur le canevas (meta : ce qu'on sait d'elle), sélectionnée. Renvoie son identifiant. */
async function addToCanvas(editor: Editor, blob: Blob, place: ImagePlace, meta: Record<string, unknown>, alt: string): Promise<TLShapeId> {
  const file = new File([blob], `image.${blob.type.split('/')[1] ?? 'jpg'}`, { type: blob.type })
  const src = await uploadImage(file)
  const local = URL.createObjectURL(blob)
  const { w, h } = await imageSize(local).finally(() => URL.revokeObjectURL(local))
  const assetId = AssetRecordType.createId()
  const id = createShapeId()
  const height = Math.round((h * WIDTH) / w)
  // Près de l'élément ; sinon à droite du contenu de la page (sans rien recouvrir), ou au centre d'une page vide.
  const near = place.near && editor.getShapePageBounds(place.near)
  const page = editor.getCurrentPageBounds()
  const center = editor.getViewportPageBounds().center
  const at = near
    ? { x: near.maxX + GAP, y: near.midY - height / 2 }
    : page
      ? { x: page.maxX + GAP, y: page.minY }
      : { x: center.x - WIDTH / 2, y: center.y - height / 2 }
  editor.markHistoryStoppingPoint('image ajoutée')
  editor.run(() => {
    editor.createAssets([AssetRecordType.create({ id: assetId, type: 'image', props: { name: file.name, src, w, h, mimeType: blob.type, isAnimated: false, fileSize: blob.size } })])
    const reading = meta.imageReading as Record<string, unknown> | undefined
    editor.createShape({
      id,
      type: 'image',
      x: at.x,
      y: at.y,
      props: { assetId, w: WIDTH, h: height, altText: alt.slice(0, 500) },
      meta: { ...meta, ...(reading && { imageReading: { ...reading, asset: assetId } }) } as JsonObject,
    })
    if (place.illustrates && editor.getShape(place.illustrates)) {
      const lang = editor.getDocumentSettings().meta.lang as string | undefined
      createLink(editor, { id: id.replace('shape:', 'l'), from: id, to: place.illustrates, relation: 'illustrates' }, id, place.illustrates, presetResolver(editor, undefined, lang), contentLocale(lang))
    }
  })
  editor.select(id)
  // Posée hors de la vue : on va la voir.
  const bounds = editor.getShapePageBounds(id)
  if (bounds && !editor.getViewportPageBounds().contains(bounds)) editor.centerOnPoint(bounds.center, { animation: { duration: 300 } })
  return id
}

/** Insère une image en tête d'un texte de la présentation, avec sa légende (son crédit). */
async function addToText(editor: Editor, blob: Blob, target: TextTarget, alt: string, caption: string) {
  const file = new File([blob], `image.${blob.type.split('/')[1] ?? 'jpg'}`, { type: blob.type })
  const src = await storeTextImage(editor, file)
  const seq = readSequence(editor) ?? emptySequence(m().sequence.defaultTitle)
  const block = `![${alt.replace(/[[\]\n]/g, ' ').slice(0, 200)}](${src})\n*${caption}*\n\n`
  const steps = target.step ? seq.steps.map((s) => (s.id === target.step ? { ...s, narration: block + s.narration } : s)) : seq.steps
  writeSequence(editor, { ...seq, steps, ...(!target.step && { intro: block + (seq.intro ?? '') }) }, { undoable: true })
}

async function place(editor: Editor, blob: Blob, where: ImagePlace, meta: Record<string, unknown>, alt: string, caption: string) {
  if (where.text) return void (await addToText(editor, blob, where.text, alt, caption))
  await addToCanvas(editor, blob, where, meta, alt)
}

/** Ajoute une image générée (sur le canevas, ou en tête d'un texte), signalée comme telle. */
export async function addGeneratedImage(editor: Editor, dataUri: string, opts: { model: string; request: string; place: ImagePlace; from?: TLShapeId[] }) {
  const blob = await (await fetch(dataUri)).blob()
  const label = IMAGE_MODELS.find((model) => model.id === opts.model)?.label ?? opts.model
  const identification = m().imageGen.identification(label)
  const generated: GeneratedMeta = { model: opts.model, request: opts.request, at: new Date().toISOString(), ...(opts.from?.length && { from: opts.from }) }
  await place(
    editor,
    blob,
    opts.place,
    // Sa lecture : ce qui a été demandé, et ce qu'elle est (générée par l'IA).
    { generated: { ...generated }, imageReading: { kind: 'illustration', description: opts.request, identification, certainty: 'established' } },
    opts.request,
    identification
  )
}

/** Image trouvée sur Wikimedia Commons : où on l'a trouvée, qui l'a faite, sous quelle licence. */
export interface CreditMeta {
  provider: 'Wikimedia Commons'
  author: string
  license: string
  licenseUrl?: string
  page: string
}

export function creditMetaOf(shape: TLShape | undefined): CreditMeta | undefined {
  const c = shape?.meta.credit as CreditMeta | undefined
  return c && typeof c === 'object' && typeof c.page === 'string' ? c : undefined
}

/**
 * Ajoute une image de Wikimedia Commons, citée : son auteur et sa licence (champ Source), sa page
 * (Page web), sa lecture (sa description, ce qu'elle est).
 */
export async function addCommonsImage(editor: Editor, image: CommonsImage, where: ImagePlace) {
  const blob = await (await fetch(image.thumb)).blob()
  const credit = creditOf(image)
  const identification = [image.title, image.author !== '?' && image.author, image.date].filter(Boolean).join(', ')
  await place(
    editor,
    blob,
    where,
    {
      ...(credit && { author: credit }),
      url: image.page,
      credit: { provider: 'Wikimedia Commons', author: image.author, license: image.license, ...(image.licenseUrl && { licenseUrl: image.licenseUrl }), page: image.page },
      imageReading: { description: image.description || image.title, identification: identification.slice(0, 300), certainty: 'established' },
    },
    image.title,
    `${[image.title, credit].filter(Boolean).join(' — ')} ([Wikimedia Commons](${image.page}))`
  )
}

/**
 * Une sélection du canevas (dessins, boîtes, flèches…) rendue en image : le croquis d'une image à
 * générer. JPEG sur fond blanc, au plus 1568 px de côté.
 */
export async function selectionSketch(editor: Editor, ids: TLShapeId[]): Promise<string> {
  const bounds = editor.getShapesPageBounds(ids)
  const scale = bounds ? Math.min(2, 1568 / Math.max(bounds.w, bounds.h, 1)) : 1
  const { blob } = await editor.toImage(ids, { format: 'jpeg', quality: 0.85, background: true, padding: 24, scale, pixelRatio: 1, darkMode: false })
  const uri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  if (uri.length > MAX_REFERENCE) throw new Error(m().imageGen.referenceTooLarge)
  return uri
}

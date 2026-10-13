// Images du schéma lues par l'IA (src/lib/ai/imageReading.ts) : la lecture est enregistrée avec
// l'image (meta.imageReading), avec la ressource lue ; une autre image à la place la rend caduque.
// Avant une demande à l'IA, les images qui n'ont pas encore été lues le sont, une fois pour toutes.

import { atom, type Editor, type TLImageShape, type TLShape, type TLShapeId } from 'tldraw'
import { clientLocale } from '@/i18n/client'
import { aiSettingsAtom, identifyImage, isAiReady, readImage, serverAiAtom, type AiSettings, type ServerAi } from '../ai/client'
import type { ImageIdentification } from '../ai/imageReading'
import { isLangCode } from '../ai/language'
import { ImageReadingSchema, type ImageReading } from '../map/format'
import { getTreeIndex } from './tree'

/** Côté le plus long de l'image envoyée : assez pour lire un texte, sans alourdir la demande. */
const MAX_SIDE = 1568
/** Images lues au plus avant une demande (les autres partent sans lecture). */
const MAX_READ = 8

export const isImage = (shape: TLShape | undefined): shape is TLImageShape => shape?.type === 'image'

/** Lecture enregistrée d'une image, si elle vaut pour l'image qu'elle montre encore. */
export function imageReadingOf(shape: TLShape | undefined): ImageReading | undefined {
  if (!isImage(shape)) return undefined
  const stored = shape.meta.imageReading as { asset?: unknown } | undefined
  if (!stored || stored.asset !== shape.props.assetId) return undefined
  const parsed = ImageReadingSchema.safeParse(stored)
  return parsed.success ? parsed.data : undefined
}

/**
 * Enregistre la lecture d'une image (null : l'efface). Celle de l'IA ne se défait pas (ce n'est
 * pas une modification de l'utilisateur) ; celle que l'utilisateur corrige, si.
 */
export function setImageReading(editor: Editor, id: TLShapeId, reading: ImageReading | null, opts: { byAi?: boolean } = {}) {
  const shape = editor.getShape(id)
  if (!isImage(shape)) return
  const imageReading = reading && { ...reading, asset: shape.props.assetId }
  const update = () => editor.updateShape({ id, type: 'image', meta: { ...shape.meta, imageReading } })
  if (opts.byAi) editor.run(update, { history: 'ignore' })
  else update()
}

/**
 * Modèle choisi pour lire les images (OpenRouter, instance), retenu sur l'appareil ; vide : celui de
 * transcription du catalogue.
 */
const READING_MODEL_KEY = 'image-reading-model'
export const readingModelAtom = atom<string>('readingModel', typeof window === 'undefined' ? '' : storedReadingModel())

function storedReadingModel() {
  try {
    return localStorage.getItem(READING_MODEL_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setReadingModel(model: string) {
  readingModelAtom.set(model)
  try {
    localStorage.setItem(READING_MODEL_KEY, model)
  } catch {
    // stockage indisponible : le choix vaut pour cette session
  }
}

/** Modèle de lecture à demander : celui choisi, s'il vaut pour ce fournisseur ; sinon celui par défaut. */
export function readingModel(settings: AiSettings, server: ServerAi | null): string | undefined {
  const model = readingModelAtom.get()
  if (!model) return undefined
  if (settings.kind === 'openrouter') return model
  if (settings.kind === 'server') return server?.models.includes(model) ? model : undefined
  return undefined
}

/** Images en cours de lecture (pour l'afficher, et ne pas lire deux fois la même). */
export const readingImagesAtom = atom<ReadonlySet<TLShapeId>>('readingImages', new Set())
const inFlight = new Map<TLShapeId, Promise<ImageReading>>()

/** Langue de la lecture : celle du schéma, sinon celle de l'interface. */
function readingLang(editor: Editor): string {
  const lang = editor.getDocumentSettings().meta.lang
  return typeof lang === 'string' && isLangCode(lang) ? lang : clientLocale()
}

/** Lit une image avec l'IA réglée, et enregistre sa lecture. */
export function readImageShape(editor: Editor, id: TLShapeId, opts: { settings?: AiSettings; signal?: AbortSignal } = {}): Promise<ImageReading> {
  const running = inFlight.get(id)
  if (running) return running
  const settings = opts.settings ?? aiSettingsAtom.get()
  const promise = (async () => {
    const shape = editor.getShape(id)
    if (!isImage(shape)) throw new Error('not an image')
    const dataUri = await imageDataUri(editor, shape)
    const model = readingModel(settings, serverAiAtom.get())
    const reading = await readImage(settings, dataUri, readingLang(editor), { signal: opts.signal, model })
    // L'image a pu être remplacée entre-temps : la lecture ne vaut que pour celle qui a été lue.
    if (editor.getShape<TLImageShape>(id)?.props.assetId === shape.props.assetId) setImageReading(editor, id, reading, { byAi: true })
    return reading
  })()
  inFlight.set(id, promise)
  readingImagesAtom.set(new Set([...readingImagesAtom.get(), id]))
  const done = () => {
    inFlight.delete(id)
    const still = new Set(readingImagesAtom.get())
    still.delete(id)
    readingImagesAtom.set(still)
  }
  promise.then(done, done)
  return promise
}

/** Identifie une image (avec le modèle de lecture) : la meilleure proposition, et d'autres possibles. */
export async function identifyImageShape(editor: Editor, id: TLShapeId, opts: { signal?: AbortSignal } = {}): Promise<ImageIdentification> {
  const shape = editor.getShape(id)
  if (!isImage(shape)) throw new Error('not an image')
  const settings = aiSettingsAtom.get()
  const dataUri = await imageDataUri(editor, shape)
  return identifyImage(settings, dataUri, readingLang(editor), { signal: opts.signal, model: readingModel(settings, serverAiAtom.get()) })
}

/**
 * Lit, avant une demande, les images qui ne l'ont pas encore été (`ids` : celles qui comptent, la
 * plus importante d'abord). Une image illisible n'empêche pas la demande : elle part sans lecture.
 */
export async function readMissingImages(editor: Editor, ids: TLShapeId[], opts: { settings?: AiSettings; signal?: AbortSignal } = {}) {
  const settings = opts.settings ?? aiSettingsAtom.get()
  if (!isAiReady(settings, serverAiAtom.get())) return
  const todo = [...new Set(ids)].filter((id) => {
    const shape = editor.getShape(id)
    return isImage(shape) && !!shape.props.assetId && !imageReadingOf(shape)
  })
  await Promise.all(todo.slice(0, MAX_READ).map((id) => readImageShape(editor, id, { settings, signal: opts.signal }).catch(() => undefined)))
  opts.signal?.throwIfAborted()
}

/** Images de la page, celles de la sélection d'abord. */
export function pageImages(editor: Editor): TLShapeId[] {
  const selected = new Set(editor.getSelectedShapeIds())
  const images = editor.getCurrentPageShapes().filter((s) => isImage(s) && !s.meta.suggestion)
  return [...images.filter((s) => selected.has(s.id)), ...images.filter((s) => !selected.has(s.id))].map((s) => s.id)
}

/** Images qu'une demande à partir d'un élément envoie : l'élément, sa lignée et sa branche ; tout le schéma au besoin. */
export function imagesAround(editor: Editor, focus: TLShapeId, wholeMap: boolean): TLShapeId[] {
  const { parent, children } = getTreeIndex(editor)
  const near: TLShapeId[] = [focus]
  for (let p = parent.get(focus); p; p = parent.get(p)) near.push(p)
  const visit = (id: TLShapeId) => (children.get(id) ?? []).forEach((c) => (near.push(c), visit(c)))
  visit(focus)
  const images = near.filter((id) => isImage(editor.getShape(id)))
  return wholeMap ? [...images, ...pageImages(editor)] : images
}

/** Dernières images préparées (par ressource) : compléter ou régénérer ne les refait pas. */
const prepared = new Map<string, Promise<string>>()

/** L'image, réduite et en JPEG (« data: » URI), pour le modèle. */
export function imageDataUri(editor: Editor, shape: TLImageShape): Promise<string> {
  const key = shape.props.assetId ?? shape.id
  let uri = prepared.get(key)
  if (!uri) {
    uri = prepareImage(editor, shape)
    uri.catch(() => prepared.delete(key))
    prepared.set(key, uri)
    if (prepared.size > 4) prepared.delete(prepared.keys().next().value!)
  }
  return uri
}

async function prepareImage(editor: Editor, shape: TLImageShape): Promise<string> {
  const url = await editor.resolveAssetUrl(shape.props.assetId, { shouldResolveToOriginal: true })
  if (!url) throw new Error('image not found')
  const blob = await (await fetch(url)).blob()
  const objectUrl = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('unreadable image'))
      el.src = objectUrl
    })
    const w = img.naturalWidth || 1024
    const h = img.naturalHeight || 1024
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    const ctx = canvas.getContext('2d')!
    // Fond blanc : la transparence d'un PNG deviendrait du noir en JPEG.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

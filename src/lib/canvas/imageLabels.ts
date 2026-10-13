// Légendes d'une image : une boîte reliée par une flèche (meta.imageMark) à un point précis de
// l'image (ancrage précis de tldraw, qui suit l'image), ou à une zone qu'entoure un contour (forme
// « zone », meta.imageArea : sa place relative dans l'image, qu'elle garde quand l'image bouge).
// La flèche et la zone vont avec leur boîte : suggestions, export, présentation.

import { createShapeId, toRichText, type Editor, type TLArrowBinding, type TLShape, type TLShapeId } from 'tldraw'
import { isImage } from './imageReading'

/** Point d'une image, en fractions de sa largeur et de sa hauteur depuis son coin supérieur gauche. */
export interface ImagePoint {
  x: number
  y: number
}
/** Zone d'une image (coin supérieur gauche, largeur, hauteur), en fractions de l'image. */
export interface ImageArea extends ImagePoint {
  w: number
  h: number
}

/** Une légende : vers un point, ou une zone, de l'image. */
export type ImageMark = { point: ImagePoint; area?: undefined } | { area: ImageArea; point?: undefined }

interface AreaMeta extends ImageArea {
  /** L'image entourée, et la boîte de la légende. */
  image: TLShapeId
  label: TLShapeId
}

const clamp = (v: number) => Math.min(1, Math.max(0, v))

/** Forme « zone » d'une légende. */
export function areaMetaOf(shape: TLShape | undefined): AreaMeta | undefined {
  const a = shape?.meta.imageArea as AreaMeta | undefined
  return a && typeof a === 'object' && typeof a.image === 'string' ? a : undefined
}
export const isImageArea = (shape: TLShape | undefined) => !!areaMetaOf(shape)
export const isImageMark = (shape: TLShape | undefined) => shape?.type === 'arrow' && !!shape.meta.imageMark

/** Place d'une zone sur la page, d'après l'image. */
function areaBounds(editor: Editor, image: TLShapeId, area: ImageArea) {
  const b = editor.getShapePageBounds(image)
  return b && { x: b.minX + area.x * b.w, y: b.minY + area.y * b.h, w: Math.max(8, area.w * b.w), h: Math.max(8, area.h * b.h) }
}

/**
 * Relie une boîte à un point ou à une zone de l'image (`ref` : l'identifiant du lien dans le
 * schéma). Renvoie la flèche, et la zone s'il y en a une.
 */
export function createImageMark(editor: Editor, ref: string, from: TLShapeId, image: TLShapeId, mark: ImageMark): { arrow: TLShapeId; area?: TLShapeId } {
  let area: TLShapeId | undefined
  if (mark.area) {
    const a = { x: clamp(mark.area.x), y: clamp(mark.area.y), w: clamp(mark.area.w), h: clamp(mark.area.h) }
    const at = areaBounds(editor, image, a)
    if (at) {
      area = createShapeId()
      editor.createShape({
        id: area,
        type: 'geo',
        x: at.x,
        y: at.y,
        props: { geo: 'ellipse', w: at.w, h: at.h, fill: 'none', dash: 'dashed', color: 'red', size: 's', richText: toRichText('') },
        meta: { imageArea: { image, label: from, ...a } },
      })
    }
  }
  const arrow = createShapeId()
  editor.createShape({
    id: arrow,
    type: 'arrow',
    props: { color: 'red', size: 's', dash: 'solid', arrowheadStart: 'none', arrowheadEnd: area ? 'arrow' : 'dot' },
    meta: { ref, imageMark: true },
  })
  const point = mark.point ? { x: clamp(mark.point.x), y: clamp(mark.point.y) } : { x: 0.5, y: 0.5 }
  editor.createBindings([
    { type: 'arrow', fromId: arrow, toId: from, props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' } },
    area
      ? { type: 'arrow', fromId: arrow, toId: area, props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' } }
      : { type: 'arrow', fromId: arrow, toId: image, props: { terminal: 'end', normalizedAnchor: point, isExact: true, isPrecise: true, snap: 'none' } },
  ])
  return { arrow, ...(area && { area }) }
}

/** Ce que désigne une flèche de légende : la boîte, l'image, et le point ou la zone. */
export function markOf(editor: Editor, arrow: TLShape): { from: TLShapeId; image: TLShapeId; mark: ImageMark; area?: TLShapeId } | undefined {
  if (!isImageMark(arrow)) return undefined
  const bindings = editor.getBindingsFromShape<TLArrowBinding>(arrow, 'arrow')
  const start = bindings.find((b) => b.props.terminal === 'start')
  const end = bindings.find((b) => b.props.terminal === 'end')
  if (!start || !end) return undefined
  const target = editor.getShape(end.toId)
  const area = areaMetaOf(target)
  if (area && isImage(editor.getShape(area.image))) {
    return { from: start.toId, image: area.image, mark: { area: { x: area.x, y: area.y, w: area.w, h: area.h } }, area: end.toId }
  }
  if (!isImage(target)) return undefined
  const round = (v: number) => Math.round(v * 1000) / 1000
  return { from: start.toId, image: end.toId, mark: { point: { x: round(end.props.normalizedAnchor.x), y: round(end.props.normalizedAnchor.y) } } }
}

/** Flèches et zones des légendes d'une boîte (elles vont avec elle). */
export function marksOfLabel(editor: Editor, box: TLShapeId): TLShapeId[] {
  const out: TLShapeId[] = []
  for (const shape of editor.getCurrentPageShapes()) {
    if (areaMetaOf(shape)?.label === box) out.push(shape.id)
    else if (isImageMark(shape) && editor.getBindingsFromShape<TLArrowBinding>(shape, 'arrow').some((b) => b.props.terminal === 'start' && b.toId === box)) out.push(shape.id)
  }
  return out
}

const LABEL_GAP = 80
const LABEL_SPACING = 16

/**
 * Range des légendes autour de leur image : à gauche ou à droite selon le côté du point (ou du
 * centre de la zone), de haut en bas dans l'ordre des points, pour que les flèches ne se croisent pas.
 */
export function placeLabels(editor: Editor, image: TLShapeId, labels: { box: TLShapeId; at: ImagePoint }[]) {
  const b = editor.getShapePageBounds(image)
  if (!b) return
  for (const left of [true, false]) {
    let bottom = -Infinity
    const side = labels.filter((l) => l.at.x < 0.5 === left).sort((p, q) => p.at.y - q.at.y)
    for (const { box, at } of side) {
      const shape = editor.getShape(box)
      const size = editor.getShapePageBounds(box)
      if (!shape || !size) continue
      const y = Math.max(b.minY + at.y * b.h - size.h / 2, bottom + LABEL_SPACING)
      const x = left ? b.minX - LABEL_GAP - size.w : b.maxX + LABEL_GAP
      editor.updateShape({ id: box, type: shape.type, x, y })
      bottom = y + size.h
    }
  }
}

/** Point visé par une légende (le centre d'une zone). */
export function markPoint(mark: ImageMark): ImagePoint {
  return mark.point ?? { x: mark.area.x + mark.area.w / 2, y: mark.area.y + mark.area.h / 2 }
}

/**
 * Les zones suivent leur image (déplacée, redimensionnée) ; une zone retouchée à la main garde sa
 * nouvelle place relative. Une zone part avec son image ou sa légende.
 */
export function registerImageAreaSideEffects(editor: Editor) {
  let syncing = false
  const sync = (fn: () => void) => {
    syncing = true
    try {
      fn()
    } finally {
      syncing = false
    }
  }
  const areasOf = (image: TLShapeId) => editor.getCurrentPageShapes().filter((s) => areaMetaOf(s)?.image === image)
  const cleanups = [
    editor.sideEffects.registerAfterChangeHandler('shape', (prev, next) => {
      if (syncing) return
      if (isImage(next)) {
        const p = prev as typeof next
        if (p.x === next.x && p.y === next.y && p.props.w === next.props.w && p.props.h === next.props.h && p.rotation === next.rotation) return
        sync(() => {
          for (const s of areasOf(next.id)) {
            const at = areaBounds(editor, next.id, areaMetaOf(s)!)
            if (at) editor.updateShape({ id: s.id, type: 'geo', x: at.x, y: at.y, props: { w: at.w, h: at.h } })
          }
        })
        return
      }
      const area = areaMetaOf(next)
      if (!area || (prev.x === next.x && prev.y === next.y && JSON.stringify(prev.props) === JSON.stringify(next.props))) return
      const b = editor.getShapePageBounds(area.image)
      const own = editor.getShapePageBounds(next.id)
      if (!b || !own || !b.w || !b.h) return
      const r = (v: number) => Math.round(v * 1000) / 1000
      sync(() =>
        editor.updateShape({
          id: next.id,
          type: next.type,
          meta: { ...next.meta, imageArea: { ...area, x: r((own.minX - b.minX) / b.w), y: r((own.minY - b.minY) / b.h), w: r(own.w / b.w), h: r(own.h / b.h) } },
        })
      )
    }),
    editor.sideEffects.registerAfterDeleteHandler('shape', (shape) => {
      const gone = editor.getCurrentPageShapes().filter((s) => {
        const a = areaMetaOf(s)
        return a && (a.image === shape.id || a.label === shape.id)
      })
      if (gone.length) editor.deleteShapes(gone.map((s) => s.id))
    }),
  ]
  return () => cleanups.forEach((c) => c())
}

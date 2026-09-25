// Seul module qui connaît tldraw côté moteur de présentation.
// Si le moteur de canevas change un jour, c'est ce fichier qu'il faudra réécrire.

import { Box, getArrowInfo, type Editor, type JsonObject, type TLArrowBinding, type TLShapeId } from 'tldraw'
import { computeStage, stateOf, stepFocusTargets, type Stage } from '../sequence/compute'
import type { Sequence, ShapeRef, StepCamera } from '../sequence/types'

const META_KEY = 'sequence'

export function readSequence(editor: Editor): Sequence | null {
  const meta = editor.getDocumentSettings().meta
  return (meta[META_KEY] as unknown as Sequence | undefined) ?? null
}

export function writeSequence(editor: Editor, seq: Sequence) {
  const meta = editor.getDocumentSettings().meta
  editor.updateDocumentSettings({ meta: { ...meta, [META_KEY]: seq as unknown as JsonObject } })
}

/** Un cadre ou un groupe entraîne ses descendants ; les objets supprimés sont ignorés. */
export function makeExpand(editor: Editor) {
  return (refs: ShapeRef[]): ShapeRef[] => {
    const existing = (refs as TLShapeId[]).filter((id) => editor.getShape(id))
    return [...editor.getShapeAndDescendantIds(existing)]
  }
}

/** Flèches liées à des objets : elles suivent la visibilité de leurs extrémités. */
function arrowDependencies(editor: Editor): Map<ShapeRef, ShapeRef[]> {
  const deps = new Map<ShapeRef, ShapeRef[]>()
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== 'arrow') continue
    const bindings = editor.getBindingsFromShape<TLArrowBinding>(shape, 'arrow')
    if (bindings.length) deps.set(shape.id, bindings.map((b) => b.toId))
  }
  return deps
}

export function computeEditorStage(editor: Editor, seq: Sequence, index: number): Stage {
  return computeStage(seq, index, {
    expand: makeExpand(editor),
    dependencies: arrowDependencies(editor),
  })
}

export type DrawDirection = 'r' | 'l' | 'd' | 'u'

/** Sens du tracé pour l'effet « draw » : suit la direction des flèches. */
function drawDirection(editor: Editor, id: TLShapeId): DrawDirection {
  const shape = editor.getShape(id)
  if (shape?.type !== 'arrow') return 'r'
  const info = getArrowInfo(editor, shape)
  if (!info) return 'r'
  const dx = info.end.point.x - info.start.point.x
  const dy = info.end.point.y - info.start.point.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'r' : 'l'
  return dy >= 0 ? 'd' : 'u'
}

/**
 * Paramètres de découpe (clip-path) pour l'effet « draw ».
 * Le conteneur DOM d'une forme est placé à son origine, mais son dessin peut déborder
 * (c'est le cas des flèches) : on exprime donc la découpe à partir de la géométrie réelle.
 */
export function drawClip(editor: Editor, ref: ShapeRef): { direction: DrawDirection; vars: Record<string, string> } {
  const id = ref as TLShapeId
  const direction = drawDirection(editor, id)
  const b = editor.getShapeGeometry(id).bounds
  const W = Math.max(b.w, 1)
  const H = Math.max(b.h, 1)
  const m = 80 // marge pour l'épaisseur du trait, les pointes et les étiquettes
  const final = { t: b.minY - m, l: b.minX - m, r: -b.minX - m, bt: -b.minY - m }
  const start = { r: W - b.minX, l: b.maxX, d: H - b.minY, u: b.maxY }[direction]
  const px = (n: number) => `${n}px`
  return {
    direction,
    vars: {
      '--clip-t': px(final.t),
      '--clip-l': px(final.l),
      '--clip-r': px(final.r),
      '--clip-b': px(final.bt),
      '--clip-start': px(start),
    },
  }
}

function boundsOf(editor: Editor, ids: ShapeRef[]): Box | null {
  const boxes = ids
    .map((id) => editor.getShapePageBounds(id as TLShapeId))
    .filter((b): b is Box => !!b)
  return boxes.length ? Box.Common(boxes) : null
}

function visibleShapeIds(editor: Editor, stage: Stage): ShapeRef[] {
  return [...editor.getCurrentPageShapeIds()].filter(
    (id) => stateOf(stage, id).visibility !== 'hidden'
  )
}

const DEFAULT_CAMERA: Required<StepCamera> = { mode: 'follow', padding: 96, maxZoom: 1.4 }

export function moveCamera(
  editor: Editor,
  seq: Sequence,
  index: number,
  stage: Stage,
  override?: 'overview'
) {
  const step = seq.steps[index]
  const cam = { ...DEFAULT_CAMERA, ...step?.camera }
  const mode = override ?? (step ? cam.mode : 'overview')
  if (mode === 'keep') return

  let bounds: Box | null = null
  if (mode === 'follow' && step) bounds = boundsOf(editor, stepFocusTargets(step, makeExpand(editor)))
  if (!bounds) bounds = boundsOf(editor, visibleShapeIds(editor, stage))
  if (!bounds) return

  editor.zoomToBounds(bounds, {
    inset: cam.padding,
    targetZoom: mode === 'overview' ? 1 : cam.maxZoom,
    animation: { duration: 700, easing: easeInOutCubic },
  })
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

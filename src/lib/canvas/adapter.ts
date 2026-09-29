// Seul module qui connaît tldraw côté moteur de présentation.
// Si le moteur de canevas change un jour, c'est ce fichier qu'il faudra réécrire.

import { Box, getArrowInfo, type Editor, type JsonObject, type TLArrowBinding, type TLPageId, type TLShapeId } from 'tldraw'
import { computeStage, latestShown, stateOf, stepFocusTargets, type ComputeOptions, type Stage } from '../sequence/compute'
import { migrateSequence } from '../sequence/migrate'
import { toJson } from '../json'
import type { Sequence, ShapeRef, Step, StepCamera } from '../sequence/types'
import { SPOTLIGHT_TYPE } from './spotlight'
import { getTreeIndex } from './tree'

const META_KEY = 'sequence'

/**
 * Séquence enregistrée dans le document : titre et réglages communs, étapes et texte d'accueil propres
 * à chaque page. `steps` et `intro` sont ceux d'une page (`stepsPage`, la première à l'enregistrement) :
 * un document d'une seule page reste lisible tel quel par les versions antérieures. `pages` et `intros`
 * ont ceux des autres pages. Avant les séquences par page, les étapes étaient communes (`steps` sans
 * `stepsPage`) : elles reviennent à la page de leurs objets.
 */
interface StoredSequence extends Sequence {
  stepsPage?: string
  pages?: Record<string, Step[]>
  intros?: Record<string, string>
}

/** Ce qui est propre à une page. */
type PageSequence = Pick<Sequence, 'steps' | 'intro'>

function readStored(editor: Editor): StoredSequence | null {
  const raw = editor.getDocumentSettings().meta[META_KEY] as unknown as StoredSequence | undefined
  return raw ? migrateSequence(raw) : null
}

function byPage(editor: Editor, stored: StoredSequence): Record<string, PageSequence> {
  const pages: Record<string, PageSequence> = {}
  for (const [id, steps] of Object.entries(stored.pages ?? {})) pages[id] = { steps }
  for (const [id, intro] of Object.entries(stored.intros ?? {})) pages[id] = { steps: pages[id]?.steps ?? [], intro }
  if (stored.steps.length || stored.intro) {
    pages[stored.stepsPage ?? legacyPageOf(editor, stored.steps)] = { steps: stored.steps, intro: stored.intro }
  }
  return pages
}

/** Page des anciennes étapes communes : celle du premier objet ciblé qui existe encore. */
function legacyPageOf(editor: Editor, steps: Step[]): TLPageId {
  for (const id of steps.flatMap((s) => s.actions.flatMap((a) => a.targets))) {
    const shape = editor.getShape(id as TLShapeId)
    if (shape) return editor.getAncestorPageId(shape) ?? editor.getCurrentPageId()
  }
  return editor.getPages()[0]?.id ?? editor.getCurrentPageId()
}

/** Séquence d'une page (par défaut, la page courante) : ses étapes et son accueil, avec le titre et les réglages du document. */
export function readSequence(editor: Editor, pageId: TLPageId = editor.getCurrentPageId()): Sequence | null {
  const stored = readStored(editor)
  if (!stored) return null
  const page = byPage(editor, stored)[pageId]
  const seq: StoredSequence = { ...stored, steps: page?.steps ?? [], intro: page?.intro }
  if (!seq.intro) delete seq.intro
  delete seq.stepsPage
  delete seq.pages
  delete seq.intros
  return seq
}

/** Pages du document qui ont des étapes, dans l'ordre des pages. */
export function pagesWithSteps(editor: Editor): TLPageId[] {
  const stored = readStored(editor)
  const pages = stored ? byPage(editor, stored) : {}
  return editor.getPages().filter((p) => pages[p.id]?.steps.length).map((p) => p.id)
}

/**
 * Enregistre la séquence de la page courante dans le document. tldraw écrit les réglages du document hors historique ;
 * `undoable` l'inscrit dans l'historique (Ctrl+Z la rétablit avec les formes modifiées en même temps).
 */
export function writeSequence(editor: Editor, seq: Sequence, opts: { undoable?: boolean } = {}) {
  const settings = editor.getDocumentSettings()
  const stored = readStored(editor)
  const all = { ...(stored && byPage(editor, stored)), [editor.getCurrentPageId()]: { steps: seq.steps, intro: seq.intro } }
  const [first, ...others] = editor.getPages().map((p) => p.id)
  const pages = Object.fromEntries(others.filter((id) => all[id]?.steps.length).map((id) => [id, all[id].steps]))
  const intros = Object.fromEntries(others.filter((id) => all[id]?.intro).map((id) => [id, all[id].intro!]))
  const value: StoredSequence = {
    ...seq,
    steps: all[first]?.steps ?? [],
    intro: all[first]?.intro || undefined,
    stepsPage: first,
    ...(Object.keys(pages).length && { pages }),
    ...(Object.keys(intros).length && { intros }),
  }
  const meta = { ...settings.meta, [META_KEY]: toJson(value) as unknown as JsonObject }
  if (opts.undoable) editor.store.put([{ ...settings, meta }])
  else editor.updateDocumentSettings({ meta })
}

/** Un cadre ou un groupe entraîne ses descendants ; les objets supprimés sont ignorés. */
export function resolveTargets(editor: Editor) {
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

/** Arbres : parent de chaque nœud, et nœuds repliés dans le document (état de départ). */
function treeOptions(editor: Editor) {
  const { parent } = getTreeIndex(editor)
  const folded = new Set<ShapeRef>()
  for (const id of new Set(parent.values())) if (editor.getShape(id)?.meta.folded) folded.add(id)
  return { tree: parent as Map<ShapeRef, ShapeRef>, folded }
}

export function computeEditorStage(
  editor: Editor,
  seq: Sequence,
  index: number,
  live?: Pick<ComputeOptions, 'foldOverrides' | 'liveUnfolds'>
): Stage {
  return computeStage(seq, index, {
    resolve: resolveTargets(editor),
    dependencies: arrowDependencies(editor),
    ...treeOptions(editor),
    ...live,
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

export function boundsOf(editor: Editor, ids: ShapeRef[]): Box | null {
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

/** Calques occultants actifs : visibles, et apparus le plus récemment. */
export function activeSpotlights(editor: Editor, seq: Sequence, index: number, stage: Stage): ShapeRef[] {
  const visible = editor
    .getCurrentPageShapes()
    .filter((s) => s.type === SPOTLIGHT_TYPE && stateOf(stage, s.id).visibility !== 'hidden')
    .map((s) => s.id)
  return latestShown(seq, index, visible, resolveTargets(editor))
}

const DEFAULT_CAMERA: Required<Omit<StepCamera, 'area'>> = { mode: 'follow', padding: 96, maxZoom: 1.4 }

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
  // Zone définie : cadrée telle quelle, sans marge ni plafond de zoom.
  const area = mode === 'area' ? cam.area : undefined
  if (area) bounds = Box.From(area)
  if (mode === 'follow' && step) bounds = boundsOf(editor, stepFocusTargets(step, resolveTargets(editor), stage))
  if (!bounds) bounds = boundsOf(editor, visibleShapeIds(editor, stage))
  if (!bounds) return

  // Cadrage calculé ici plutôt que par zoomToBounds : la marge suit la taille de l'écran (téléphone)
  // et la barre de progression, posée sur le bas du canevas, ne doit rien masquer.
  const viewport = editor.getViewportScreenBounds()
  const height = Math.max(viewport.h - PROGRESS_BAR_HEIGHT, 1)
  const inset = area ? 0 : Math.min(cam.padding, Math.round(Math.min(viewport.w, height) * 0.12))
  const fit = Math.min((viewport.w - 2 * inset) / Math.max(bounds.w, 1), (height - 2 * inset) / Math.max(bounds.h, 1))
  const z = Math.max(0.05, area ? Math.min(fit, 8) : Math.min(fit, mode === 'overview' ? 1 : cam.maxZoom))
  editor.setCamera(
    { x: viewport.w / 2 / z - bounds.midX, y: height / 2 / z - bounds.midY, z },
    { animation: { duration: 700, easing: easeInOutCubic } }
  )
}

/** Hauteur de la barre de progression (PresenterUI), en bas du canevas pendant la présentation. */
const PROGRESS_BAR_HEIGHT = 48

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

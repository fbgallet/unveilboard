// Relecture critique du schéma ouvert : les remarques de l'IA (gardées sur cet appareil, par
// schéma, dans localStorage : elles ne partent ni dans le document ni dans les partages), et
// l'application d'une correction, contrôlée de nouveau sur le schéma tel qu'il est devenu.

import { atom, type Editor, type TLShapeId } from 'tldraw'
import type { MapIssue } from '../map/check'
import { PATCH_FORMAT, PATCH_VERSION } from '../map/patch'
import type { Remark } from '../map/review'
import { readPasted } from './assistant'
import { exportMap } from './mapExport'
import { applyPatch } from './mapPatch'

export interface ReviewState {
  summary?: string
  remarks: Remark[]
}

export const reviewOpenAtom = atom<boolean>('reviewOpen', false)
export const reviewAtom = atom<ReviewState>('review', { remarks: [] })
/** Document ouvert (clé de la relecture gardée). */
export const reviewDocAtom = atom<string | null>('reviewDoc', null)

const key = (docId: string) => `review:${docId}`

/** Relecture gardée pour ce schéma (à l'ouverture du document). */
export function loadReview(docId: string) {
  reviewDocAtom.set(docId)
  try {
    const raw = JSON.parse(localStorage.getItem(key(docId)) ?? 'null') as ReviewState | null
    reviewAtom.set(raw && Array.isArray(raw.remarks) ? raw : { remarks: [] })
  } catch {
    reviewAtom.set({ remarks: [] })
  }
}

function save(next: ReviewState) {
  reviewAtom.set(next)
  const docId = reviewDocAtom.get()
  if (!docId) return
  try {
    if (next.remarks.length || next.summary) localStorage.setItem(key(docId), JSON.stringify(next))
    else localStorage.removeItem(key(docId))
  } catch {
    // stockage indisponible : la relecture dure le temps de la séance
  }
}

/** Nouvelle relecture de l'IA : remplace la précédente, et ouvre le panneau. */
export function setReview(summary: string | undefined, remarks: Remark[]) {
  save({ ...(summary && { summary }), remarks })
  reviewOpenAtom.set(true)
}

/** Écarte une remarque (sans rien changer au schéma). */
export function dismissRemark(id: string) {
  const current = reviewAtom.get()
  save({ ...current, remarks: current.remarks.filter((r) => r.id !== id) })
}

export function clearReview() {
  save({ remarks: [] })
}

/**
 * Applique la correction d'une remarque, après l'avoir contrôlée sur le schéma tel qu'il est
 * maintenant (il a pu changer depuis la relecture). Renvoie les problèmes, s'il y en a.
 */
export function applyRemark(editor: Editor, remark: Remark): MapIssue[] {
  if (!remark.operations?.length) return []
  const result = readPasted(editor, { format: PATCH_FORMAT, version: PATCH_VERSION, operations: remark.operations })
  if (!result.ok || result.kind !== 'patch') return result.issues.filter((i) => i.level === 'error')
  applyPatch(editor, result.patch)
  // Les remarques auto seront recalculées ; celle de l'IA est traitée.
  if (remark.origin === 'ai') dismissRemark(remark.id)
  return []
}

/** Formes visées par une remarque (identifiants du format → formes). */
export function remarkShapes(editor: Editor, remark: Remark): TLShapeId[] {
  const shapes = exportMap(editor).shapes
  return remark.targets.flatMap((t) => {
    const s = shapes.get(t)
    return s ? [s.node as TLShapeId] : []
  })
}

/** Sélectionne et cadre les éléments visés. */
export function focusRemark(editor: Editor, remark: Remark) {
  const ids = remarkShapes(editor, remark)
  if (!ids.length) return
  editor.select(...ids)
  editor.zoomToSelection({ animation: { duration: 400 } })
}

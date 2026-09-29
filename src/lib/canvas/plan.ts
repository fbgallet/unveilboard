// Construction « en direct » d'un schéma riche : le plan (src/lib/map/plan.ts) est gardé dans le
// document, et chaque section se développe sur le canevas, en suggestions à accepter ou écarter
// (ou directement), à partir de sa tête, repérée par l'identifiant reçu à l'import (meta.ref).

import type { Editor, JsonObject, TLShape, TLShapeId, TLShapePartial } from 'tldraw'
import type { MapStore } from '../ai/staged'
import { PlanSchema, type PlanRecord } from '../map/plan'
import { exportMap, textOf } from './mapExport'
import { applyPatch } from './mapPatch'
import { isSuggestion } from './suggestions'
import { getTreeIndex } from './tree'

const META_KEY = 'aiPlan'

/** Le plan gardé dans le document, s'il y en a un (et s'il est lisible). */
export function readPlanRecord(editor: Editor): PlanRecord | null {
  const raw = editor.getDocumentSettings().meta[META_KEY] as unknown as PlanRecord | undefined
  const plan = raw && PlanSchema.safeParse(raw.plan)
  return raw && plan?.success ? { ...raw, plan: plan.data } : null
}

/** Garde le plan dans le document (null : le retire). */
export function writePlanRecord(editor: Editor, record: PlanRecord | null) {
  const meta = { ...editor.getDocumentSettings().meta }
  if (record) meta[META_KEY] = JSON.parse(JSON.stringify(record)) as JsonObject
  else delete meta[META_KEY]
  editor.updateDocumentSettings({ meta })
}

/** La forme qui porte un identifiant du format (meta.ref), sur la page courante. */
export function shapeOfRef(editor: Editor, ref: string): TLShape | undefined {
  return editor.getCurrentPageShapes().find((s) => s.meta.ref === ref && s.type !== 'arrow')
}

export interface SectionState {
  id: string
  /** Texte de la tête sur le canevas (il l'emporte sur celui du plan), ou celui du plan si elle a disparu. */
  text: string
  /** La tête est encore sur le canevas. */
  exists: boolean
  /** Éléments acceptés sous la tête, et suggestions en attente. */
  developed: number
  pending: number
}

/** L'état de chaque section du plan, lu sur le canevas. */
export function sectionStates(editor: Editor, record: PlanRecord): SectionState[] {
  const { children } = getTreeIndex(editor)
  return record.plan.sections.map((section) => {
    const head = shapeOfRef(editor, section.id)
    let developed = 0
    let pending = 0
    const visit = (id: TLShapeId) => {
      for (const child of children.get(id) ?? []) {
        if (isSuggestion(editor.getShape(child))) pending++
        else developed++
        visit(child)
      }
    }
    if (head) visit(head.id)
    return { id: section.id, text: (head && textOf(editor, head)) || section.text, exists: !!head, developed, pending }
  })
}

/**
 * Le canevas comme schéma en construction : l'export (sans les suggestions), les identifiants des
 * suggestions en attente (à ne pas reprendre), et chaque étape appliquée en suggestions ou directement.
 */
export function canvasStore(editor: Editor, opts: { ghost: boolean }): MapStore {
  return {
    get: () => exportMap(editor).map,
    taken: () =>
      editor
        .getCurrentPageShapes()
        .filter(isSuggestion)
        .map((s) => s.meta.ref)
        .filter((ref): ref is string => typeof ref === 'string'),
    commit: (result) => {
      applyPatch(editor, result.patch, { ghost: opts.ghost })
      // Tiré d'un texte : les éléments dont l'extrait est introuvable portent l'étiquette « à vérifier ».
      const unverified = new Set(result.unverified)
      const marks = editor
        .getCurrentPageShapes()
        .filter((s) => typeof s.meta.ref === 'string' && unverified.has(s.meta.ref) && s.type !== 'arrow')
        .map((s) => ({ id: s.id, type: s.type, meta: { ...s.meta, excerptUnverified: true } }) as TLShapePartial)
      if (marks.length) editor.updateShapes(marks)
    },
  }
}

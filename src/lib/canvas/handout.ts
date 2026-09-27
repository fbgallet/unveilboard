// Polycopié : pour chaque étape, une image du schéma tel qu'il apparaît à cette étape, et la narration.
// L'export de tldraw ignore l'état « atténué » de la séquence (des classes CSS, pas le document) :
// on exporte à part les objets actifs et les objets atténués, sur le même cadre, et la page les
// superpose, les seconds en transparence. Le document n'est jamais modifié.

import { Box, type Editor, type TLShapeId } from 'tldraw'
import { stateOf } from '../sequence/compute'
import type { Sequence } from '../sequence/types'
import { computeEditorStage } from './adapter'
import { SPOTLIGHT_TYPE } from './spotlight'

export interface HandoutStep {
  number: number
  title: string
  narration: string
  /** Images (URL d'objet) sur le même cadre : objets actifs, objets atténués. */
  active: string | null
  dimmed: string | null
  /** Taille du cadre, en pixels CSS. */
  width: number
  height: number
}

const PADDING = 24

export async function buildHandout(editor: Editor, seq: Sequence): Promise<HandoutStep[]> {
  const ids = [...editor.getCurrentPageShapeIds()].filter((id) => editor.getShape(id)?.type !== SPOTLIGHT_TYPE)
  const steps: HandoutStep[] = []
  for (let i = 0; i < seq.steps.length; i++) {
    const stage = computeEditorStage(editor, seq, i)
    const active: TLShapeId[] = []
    const dimmed: TLShapeId[] = []
    for (const id of ids) {
      const { visibility } = stateOf(stage, id)
      if (visibility === 'visible') active.push(id)
      else if (visibility === 'dim') dimmed.push(id)
    }
    const boxes = [...active, ...dimmed].flatMap((id) => editor.getShapePageBounds(id) ?? [])
    const step = seq.steps[i]
    const base = { number: i + 1, title: step.title, narration: step.narration }
    if (!boxes.length) {
      steps.push({ ...base, active: null, dimmed: null, width: 0, height: 0 })
      continue
    }
    const bounds = Box.Common(boxes).expandBy(PADDING)
    const image = async (shapes: TLShapeId[]) => {
      if (!shapes.length) return null
      const { blob } = await editor.toImage(shapes, { format: 'png', bounds, padding: 0, background: false, scale: 1, pixelRatio: 2, darkMode: false })
      return URL.createObjectURL(blob)
    }
    steps.push({ ...base, active: await image(active), dimmed: await image(dimmed), width: bounds.w, height: bounds.h })
  }
  return steps
}

export function releaseHandout(steps: HandoutStep[]) {
  for (const s of steps) {
    if (s.active) URL.revokeObjectURL(s.active)
    if (s.dimmed) URL.revokeObjectURL(s.dimmed)
  }
}

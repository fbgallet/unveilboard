'use client'

import { useEditor, useValue, type TLShapeId } from 'tldraw'
import { readSequence } from '@/lib/canvas/adapter'
import { appearances } from '@/lib/sequence/edit'
import { activeStepIdAtom, modeAtom, stepBadgesVisibleAtom } from '@/lib/presentation/store'

/**
 * Pastilles numérotées sur le canevas, en mode édition : à quelle(s) étape(s) chaque objet apparaît
 * (plusieurs s'il réapparaît après avoir été caché). Seule la séquence de la page courante compte.
 */
export function StepBadges() {
  const editor = useEditor()
  const badges = useValue(
    'step badges',
    () => {
      if (modeAtom.get() !== 'edit' || !stepBadgesVisibleAtom.get()) return []
      const seq = readSequence(editor)
      if (!seq) return []
      const activeId = activeStepIdAtom.get()
      const activeTargets = new Set(seq.steps.find((s) => s.id === activeId)?.actions.flatMap((a) => a.targets))
      return [...appearances(seq)].flatMap(([id, steps]) => {
        const bounds = editor.getShapePageBounds(id as TLShapeId)
        if (!bounds) return []
        const isArrow = editor.getShape(id as TLShapeId)?.type === 'arrow'
        const at = isArrow ? bounds.center : { x: bounds.minX, y: bounds.minY }
        return [{ id, label: steps.join(' · '), x: at.x, y: at.y, active: activeTargets.has(id) }]
      })
    },
    [editor]
  )
  const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor])

  return (
    <>
      {badges.map((b) => (
        <div
          key={b.id}
          className={`step-badge ${b.active ? 'step-badge-active' : ''}`}
          style={{ left: b.x, top: b.y, transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
        >
          {b.label}
        </div>
      ))}
    </>
  )
}

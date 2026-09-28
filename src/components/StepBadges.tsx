'use client'

import { useEditor, useValue, type TLShapeId } from 'tldraw'
import { readSequence } from '@/lib/canvas/adapter'
import { appearances } from '@/lib/sequence/edit'
import { activeStepIdAtom, modeAtom, stepBadgesVisibleAtom } from '@/lib/presentation/store'
import { useT } from '@/i18n/client'

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
      <CameraArea />
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

/** Zone cadrée par la caméra à l'étape active, quand elle est en mode « zone ». */
function CameraArea() {
  const t = useT()
  const editor = useEditor()
  const area = useValue(
    'camera area',
    () => {
      if (modeAtom.get() !== 'edit') return null
      const seq = readSequence(editor)
      const index = seq?.steps.findIndex((s) => s.id === activeStepIdAtom.get()) ?? -1
      const camera = seq?.steps[index]?.camera
      return camera?.mode === 'area' && camera.area ? { ...camera.area, n: index + 1 } : null
    },
    [editor]
  )
  const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor])
  if (!area) return null
  return (
    <div className="camera-area" style={{ left: area.x, top: area.y, width: area.w, height: area.h, borderWidth: 2 / zoom }}>
      <span className="camera-area-label" style={{ scale: `${1 / zoom}` }}>
        {t.step.cameraAreaLabel(area.n)}
      </span>
    </div>
  )
}

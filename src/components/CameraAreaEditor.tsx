'use client'

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useEditor, usePassThroughWheelEvents, useValue } from 'tldraw'
import { readSequence, writeSequence } from '@/lib/canvas/adapter'
import { updateStep } from '@/lib/sequence/edit'
import type { Area } from '@/lib/sequence/types'
import { activeStepIdAtom, modeAtom } from '@/lib/presentation/store'
import { useT } from '@/i18n/client'
import { HANDLES, drag, resizeRect, toViewport, type Handle } from './SpotlightOverlay'

/** Taille minimale de la zone (px écran). */
const MIN_SIZE = 24

/**
 * Zone cadrée par la caméra à l'étape active (mode « zone »), en mode édition :
 * poignées pour la redimensionner, étiquette pour la déplacer. L'intérieur laisse passer
 * les clics vers le canevas. Enregistrée à la fin du geste.
 */
export function CameraAreaEditor() {
  const t = useT()
  const editor = useEditor()
  const stored = useValue(
    'camera area',
    () => {
      if (modeAtom.get() !== 'edit') return null
      const seq = readSequence(editor)
      const index = seq?.steps.findIndex((s) => s.id === activeStepIdAtom.get()) ?? -1
      const camera = seq?.steps[index]?.camera
      return camera?.mode === 'area' && camera.area ? { area: camera.area, n: index + 1 } : null
    },
    [editor]
  )
  // Pendant un geste : la zone en cours, pas encore enregistrée.
  const [draft, setDraft] = useState<Area | null>(null)
  // Re-rendu à chaque mouvement de caméra : le cadre suit le canevas.
  useValue('camera', () => editor.getCamera(), [editor])
  const ref = useRef<HTMLDivElement>(null)
  usePassThroughWheelEvents(ref)
  if (!stored) return null

  const area = draft ?? stored.area
  const toPage = (e: PointerEvent | ReactPointerEvent) => editor.screenToPage({ x: e.clientX, y: e.clientY })

  function commit(next: Area) {
    setDraft(null)
    const seq = readSequence(editor)
    const step = seq?.steps.find((s) => s.id === activeStepIdAtom.get())
    if (!seq || !step) return
    const rounded = { x: Math.round(next.x), y: Math.round(next.y), w: Math.round(next.w), h: Math.round(next.h) }
    writeSequence(editor, updateStep(seq, step.id, { camera: { ...step.camera, area: rounded } }))
  }

  function gesture(e: ReactPointerEvent, update: (p: { x: number; y: number }) => Area, frameEl?: HTMLElement | null) {
    if (e.button !== 0) return
    e.stopPropagation()
    let last = area
    frameEl?.classList.add('spot-frame-resizing')
    drag(e, {
      move: (ev) => {
        last = update(toPage(ev))
        setDraft(last)
      },
      end: () => {
        frameEl?.classList.remove('spot-frame-resizing')
        commit(last)
      },
    })
  }

  const startMove = (e: ReactPointerEvent) => {
    const origin = toPage(e)
    const initial = area
    gesture(e, (p) => ({ ...initial, x: initial.x + p.x - origin.x, y: initial.y + p.y - origin.y }))
  }

  const startResize = (e: ReactPointerEvent, handle: Handle) => {
    const initial = area
    const min = MIN_SIZE / editor.getZoomLevel()
    gesture(e, (p) => resizeRect(initial, handle, p, min), e.currentTarget.parentElement)
  }

  const frame = toViewport(editor, area)
  return (
    <div
      ref={ref}
      className="spot-frame camera-area"
      style={{ transform: `translate(${frame.x}px, ${frame.y}px)`, width: frame.w, height: frame.h }}
    >
      <span className="camera-area-label" onPointerDown={startMove} title={t.step.cameraAreaHint}>
        {t.step.cameraAreaLabel(stored.n)}
      </span>
      {HANDLES.map((h) => (
        <div key={h} className={`spot-zone spot-zone-${h}`} onPointerDown={(e) => startResize(e, h)}>
          <span className="spot-dot" />
        </div>
      ))}
    </div>
  )
}

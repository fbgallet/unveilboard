'use client'

import type { Atom } from 'tldraw'
import { storeValue, type WidthLimits } from '@/lib/presentation/store'

/**
 * Poignée sur le bord gauche d'un panneau placé à droite :
 * glisser pour redimensionner, double-clic pour réinitialiser.
 */
export function ResizeHandle({
  width,
  limits,
  storageKey,
  onResized,
}: {
  width: Atom<number>
  limits: WidthLimits
  /** Clé localStorage où mémoriser la largeur. */
  storageKey: string
  onResized?(): void
}) {
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    document.body.classList.add('is-resizing')
    const onMove = (ev: PointerEvent) => {
      const max = window.innerWidth * 0.7
      width.set(Math.min(max, Math.max(limits.min, window.innerWidth - ev.clientX)))
    }
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      document.body.classList.remove('is-resizing')
      storeValue(storageKey, width.get())
      onResized?.()
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
  }

  return (
    <div
      className="resize-handle"
      onPointerDown={onPointerDown}
      onDoubleClick={() => {
        width.set(limits.default)
        storeValue(storageKey, limits.default)
        onResized?.()
      }}
      title="Glisser pour redimensionner · double-clic pour réinitialiser"
      role="separator"
      aria-orientation="vertical"
    />
  )
}

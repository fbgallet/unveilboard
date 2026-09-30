'use client'

import type { Atom } from 'tldraw'
import { useT } from '@/i18n/client'
import { storeValue, type WidthLimits } from '@/lib/presentation/store'

/**
 * Poignée sur le bord intérieur d'un panneau latéral (le gauche d'un panneau placé à droite, le droit
 * d'un panneau placé à gauche) : glisser pour redimensionner, double-clic pour réinitialiser.
 */
export function ResizeHandle({
  width,
  limits,
  storageKey,
  onResized,
  side = 'right',
}: {
  /** Côté de l'écran où se trouve le panneau. */
  side?: 'left' | 'right'
  width: Atom<number>
  limits: WidthLimits
  /** Clé localStorage où mémoriser la largeur. */
  storageKey: string
  onResized?(): void
}) {
  const t = useT()
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    document.body.classList.add('is-resizing')
    const onMove = (ev: PointerEvent) => {
      const max = window.innerWidth * 0.7
      const wanted = side === 'left' ? ev.clientX - handle.parentElement!.getBoundingClientRect().left : window.innerWidth - ev.clientX
      width.set(Math.min(max, Math.max(limits.min, wanted)))
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
      className={`resize-handle ${side === 'left' ? 'resize-handle-left' : ''}`}
      onPointerDown={onPointerDown}
      onDoubleClick={() => {
        width.set(limits.default)
        storeValue(storageKey, limits.default)
        onResized?.()
      }}
      title={t.common.resizeHandle}
      role="separator"
      aria-orientation="vertical"
    />
  )
}

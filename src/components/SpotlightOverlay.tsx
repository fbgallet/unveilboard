'use client'

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useT } from '@/i18n/client'
import { react, useEditor, usePassThroughWheelEvents, useValue, type Editor, type TLShapeId } from 'tldraw'
import {
  activeSpotsAtom,
  liveSpotAtom,
  modeAtom,
  spotToolAtom,
  type PageRect,
} from '@/lib/presentation/store'

/** Durée du glissement d'une fenêtre à la suivante (ms). */
const TWEEN_MS = 650
/** Arrondi des coins de la fenêtre (px écran). */
const RADIUS = 10

/**
 * Calque occultant, posé devant le canevas pendant la présentation :
 * tout est flouté sauf la ou les fenêtres actives (calques de la séquence,
 * ou fenêtre tracée à la volée, qui a priorité).
 */
export function SpotlightOverlay() {
  const presenting = useValue(modeAtom) === 'present'
  if (!presenting) return null
  return (
    <>
      <SpotlightVeil />
      <LiveSpotEditor />
    </>
  )
}

// ---------- Voile flouté ----------

interface Target {
  key: string
  rects: PageRect[]
}

function readTarget(editor: Editor): Target | null {
  const live = liveSpotAtom.get()
  if (live) return { key: 'live', rects: [live] }
  const ids = activeSpotsAtom.get()
  const rects = ids.flatMap((id) => {
    const b = editor.getShapePageBounds(id as TLShapeId)
    return b ? [b.toJson()] : []
  })
  return rects.length ? { key: ids.join(','), rects } : null
}

/**
 * Rendu impératif : la découpe suit la caméra à chaque image, sans passer par React.
 * Quand la fenêtre change (autre calque, autre étape), elle glisse de l'ancienne position à la nouvelle.
 */
function SpotlightVeil() {
  const editor = useEditor()
  const veilRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const veil = veilRef.current
    if (!veil) return
    let key: string | null = null
    let from: PageRect[] = []
    let to: PageRect[] = []
    let shown: PageRect[] = []
    let start = 0
    let raf = 0

    function paint() {
      const p = start ? Math.min(1, (performance.now() - start) / TWEEN_MS) : 1
      shown = p < 1 ? to.map((r, i) => lerpRect(from[i], r, easeInOutCubic(p))) : to
      const { w, h } = editor.getViewportScreenBounds()
      const holes = shown.map((r) => toViewport(editor, r))
      const outer = `M-2 -2H${w + 2}V${h + 2}H-2Z`
      veil!.style.clipPath = `path(evenodd, "${outer} ${holes.map(roundedRect).join(' ')}")`
      const filter = `blur(${blurFor(editor.getZoomLevel())}px) saturate(0.6)`
      veil!.style.backdropFilter = filter
      veil!.style.setProperty('-webkit-backdrop-filter', filter)
      paintRings(veil!, holes)
      if (p < 1) raf = requestAnimationFrame(paint)
      else start = 0
    }

    const stopTarget = react('spotlight target', () => {
      const target = readTarget(editor)
      cancelAnimationFrame(raf)
      if (!target) {
        // On garde la dernière découpe pendant le fondu de sortie.
        key = null
        start = 0
        veil.classList.remove('spot-veil-on')
        return
      }
      const glide =
        key !== null && key !== target.key && shown.length === target.rects.length && !prefersReducedMotion()
      from = shown
      to = target.rects
      start = glide ? performance.now() : 0
      key = target.key
      paint()
      veil.classList.add('spot-veil-on')
    })

    const stopCamera = react('spotlight camera', () => {
      editor.getCamera()
      editor.getViewportScreenBounds()
      if (!start) paint()
    })

    return () => {
      stopTarget()
      stopCamera()
      cancelAnimationFrame(raf)
    }
  }, [editor])

  return <div ref={veilRef} className="spot-veil" aria-hidden="true" />
}

/** Liseré ombré autour de chaque fenêtre (enfants du voile : l'ombre, à l'extérieur, n'est pas découpée). */
function paintRings(veil: HTMLDivElement, holes: PageRect[]) {
  while (veil.children.length > holes.length) veil.lastElementChild!.remove()
  while (veil.children.length < holes.length) {
    const ring = document.createElement('div')
    ring.className = 'spot-ring'
    veil.appendChild(ring)
  }
  holes.forEach((r, i) => {
    const ring = veil.children[i] as HTMLDivElement
    ring.style.transform = `translate(${r.x}px, ${r.y}px)`
    ring.style.width = `${r.w}px`
    ring.style.height = `${r.h}px`
  })
}

// ---------- Tracé à la volée ----------

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Taille minimale d'une fenêtre (px écran). */
const MIN_SIZE = 12

/**
 * Outil actif : glisser sur le canevas trace une nouvelle fenêtre ;
 * glisser la fenêtre la déplace ; les poignées la redimensionnent.
 */
function LiveSpotEditor() {
  const t = useT()
  const editor = useEditor()
  const active = useValue(spotToolAtom)
  const live = useValue(liveSpotAtom)
  // Re-rendu à chaque mouvement de caméra : le cadre suit le canevas.
  useValue('camera', () => editor.getCamera(), [editor])
  const ref = useRef<HTMLDivElement>(null)
  usePassThroughWheelEvents(ref)
  if (!active) return null

  const toPage = (e: PointerEvent | ReactPointerEvent) => editor.screenToPage({ x: e.clientX, y: e.clientY })
  const minPage = MIN_SIZE / editor.getZoomLevel()

  function startCreate(e: ReactPointerEvent) {
    if (e.button !== 0) return
    const origin = toPage(e)
    const previous = liveSpotAtom.get()
    const sx = e.clientX
    const sy = e.clientY
    drag(e, {
      move: (ev) => liveSpotAtom.set(rectFrom(origin, toPage(ev))),
      end: (ev) => {
        // Simple clic, ou tracé trop petit : on conserve la fenêtre précédente.
        if (Math.abs(ev.clientX - sx) < MIN_SIZE || Math.abs(ev.clientY - sy) < MIN_SIZE) liveSpotAtom.set(previous)
      },
    })
  }

  function startMove(e: ReactPointerEvent) {
    if (e.button !== 0 || !live) return
    e.stopPropagation()
    const origin = toPage(e)
    const initial = live
    drag(e, {
      move: (ev) => {
        const p = toPage(ev)
        liveSpotAtom.set({ ...initial, x: initial.x + p.x - origin.x, y: initial.y + p.y - origin.y })
      },
    })
  }

  function startResize(e: ReactPointerEvent, handle: Handle) {
    if (e.button !== 0 || !live) return
    e.stopPropagation()
    const initial = live
    // Les poignées restent visibles pendant le redimensionnement, même si le pointeur quitte le bord.
    const frameEl = e.currentTarget.parentElement
    frameEl?.classList.add('spot-frame-resizing')
    drag(e, {
      end: () => frameEl?.classList.remove('spot-frame-resizing'),
      move: (ev) => liveSpotAtom.set(resizeRect(initial, handle, toPage(ev), minPage)),
    })
  }

  const frame = live ? toViewport(editor, live) : null

  return (
    <div ref={ref} className="spot-editor" onPointerDown={startCreate}>
      {!live && <div className="spot-hint">{t.spotlight.hint}</div>}
      {frame && (
        <div
          className="spot-frame"
          style={{ transform: `translate(${frame.x}px, ${frame.y}px)`, width: frame.w, height: frame.h }}
          onPointerDown={startMove}
        >
          {HANDLES.map((h) => (
            <div key={h} className={`spot-zone spot-zone-${h}`} onPointerDown={(e) => startResize(e, h)}>
              <span className="spot-dot" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function drag(e: ReactPointerEvent, on: { move(ev: PointerEvent): void; end?(ev: PointerEvent): void }) {
  e.preventDefault()
  const onMove = (ev: PointerEvent) => on.move(ev)
  const onUp = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    on.end?.(ev)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}

// ---------- Géométrie ----------

/** Rectangle redimensionné par une poignée tirée jusqu'au point p (coordonnées de page). */
export function resizeRect(initial: PageRect, handle: Handle, p: { x: number; y: number }, min: number): PageRect {
  let minX = initial.x
  let minY = initial.y
  let maxX = initial.x + initial.w
  let maxY = initial.y + initial.h
  if (handle.includes('w')) minX = Math.min(p.x, maxX - min)
  if (handle.includes('e')) maxX = Math.max(p.x, minX + min)
  if (handle.includes('n')) minY = Math.min(p.y, maxY - min)
  if (handle.includes('s')) maxY = Math.max(p.y, minY + min)
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }): PageRect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}

/** Rectangle de page → coordonnées dans le conteneur de l'éditeur. */
export function toViewport(editor: Editor, r: PageRect): PageRect {
  const a = editor.pageToViewport({ x: r.x, y: r.y })
  const b = editor.pageToViewport({ x: r.x + r.w, y: r.y + r.h })
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }
}

function roundedRect({ x, y, w, h }: PageRect) {
  const r = Math.max(0, Math.min(RADIUS, w / 2, h / 2))
  const arc = (px: number, py: number) => `A${r} ${r} 0 0 1 ${px} ${py}`
  return (
    `M${x + r} ${y}H${x + w - r}${arc(x + w, y + r)}V${y + h - r}${arc(x + w - r, y + h)}` +
    `H${x + r}${arc(x, y + h - r)}V${y + r}${arc(x + r, y)}Z`
  )
}

/**
 * Intensité du flou, proportionnelle au zoom : la taille des textes à l'écran
 * suit le zoom, le flou doit donc la suivre pour qu'ils restent illisibles.
 */
function blurFor(zoom: number) {
  return Math.min(40, Math.max(4, 10 * zoom))
}

function lerpRect(a: PageRect, b: PageRect, t: number): PageRect {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t }
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

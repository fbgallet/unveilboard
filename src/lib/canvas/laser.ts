// Rendu « laser » des traces du pointeur laser tldraw, et réglage de leur durée.

import { ScribbleOverlayUtil, atom, react, type Editor, type TLScribble, type VecModel } from 'tldraw'
import { laserSettingsAtom, remoteScribblesAtom, type LaserSettings } from '../presentation/store'

// ---------- Point laser au survol ----------
// Laser actif, sans clic : le curseur devient un point lumineux de la couleur du laser, qui laisse
// une traînée très courte, aussitôt effacée, comme un vrai pointeur. Le clic-glisser garde les traces
// de tldraw (durée réglable). La fenêtre du projecteur reçoit les mêmes points.

/** Point du pointeur (coordonnées de page) et l'instant où il y était (ms, performance.now). */
export interface TrailPoint {
  x: number
  y: number
  t: number
}

/** Durée de la traînée (ms) : presque instantanée. */
const TRAIL_MS = 140

/** Points récents du pointeur ; le dernier porte le point lumineux. Vide : rien à dessiner. */
export const laserTrailAtom = atom<TrailPoint[]>('laserTrail', [])

let decay = 0
/** Remplace la traînée, et l'efface au fil du temps (une image sur deux suffit à l'œil). */
export function setLaserTrail(points: TrailPoint[]) {
  laserTrailAtom.set(points)
  if (decay || points.length < 2) return
  const tick = () => {
    const now = performance.now()
    const current = laserTrailAtom.get()
    // Le dernier point (le pointeur) reste ; les autres partent avec l'âge.
    const kept = current.filter((p, i) => i === current.length - 1 || now - p.t < TRAIL_MS)
    if (kept.length !== current.length) laserTrailAtom.set(kept)
    decay = kept.length > 1 ? requestAnimationFrame(tick) : 0
  }
  decay = requestAnimationFrame(tick)
}

/**
 * Suit le pointeur tant que l'outil laser est actif (présentateur) : la traînée de survol, et le
 * curseur du système masqué (classe sur le conteneur). `onTrail` : la recopier ailleurs (projecteur).
 */
export function followLaserPointer(editor: Editor, active: () => boolean, onTrail?: (points: TrailPoint[]) => void) {
  const container = editor.getContainer()
  const set = (points: TrailPoint[]) => {
    setLaserTrail(points)
    onTrail?.(points)
  }
  const clear = () => {
    container.classList.remove('laser-hover')
    if (laserTrailAtom.get().length) set([])
  }
  const onMove = (e: PointerEvent) => {
    // Seulement sur le canevas : au-dessus d'un menu, d'un popover ou d'un bouton (dessinés par-dessus
    // le point), la flèche du système revient.
    if (!active() || e.pointerType === 'touch' || !overCanvas(e.target)) return clear()
    container.classList.add('laser-hover')
    const p = editor.screenToPage({ x: e.clientX, y: e.clientY })
    const now = performance.now()
    set([...laserTrailAtom.get().filter((q) => now - q.t < TRAIL_MS), { x: p.x, y: p.y, t: now }])
  }
  container.addEventListener('pointermove', onMove)
  container.addEventListener('pointerleave', clear)
  // Laser désactivé (touche K, fin de la présentation) sans bouger : le point disparaît aussitôt.
  const stopWatch = react('laser hover active', () => {
    if (!active()) clear()
  })
  return () => {
    container.removeEventListener('pointermove', onMove)
    container.removeEventListener('pointerleave', clear)
    stopWatch()
    clear()
  }
}

/** Éléments d'interface au-dessus du canevas (menus, popovers, boutons, champs) : pas de point laser. */
const UI = 'button, a, input, select, textarea, [role="menu"], [role="dialog"], [role="toolbar"], [class*="tlui-"], .tree-toolbar, .tree-popover'

function overCanvas(target: EventTarget | null) {
  const el = target instanceof Element ? target : null
  return !!el?.closest('.tl-canvas') && !el.closest(UI)
}

/** Point lumineux et traînée de survol (le contexte est en coordonnées de page). */
function drawTrail(ctx: CanvasRenderingContext2D, points: TrailPoint[], zoom: number, s: LaserSettings) {
  const head = points[points.length - 1]
  if (!head) return
  const now = performance.now()
  const w = s.width / zoom
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
  ctx.shadowColor = s.color
  // Traînée : un seul trait lissé (pas de surépaisseur aux jonctions), qui s'efface vers la queue ;
  // elle pâlit tout entière à mesure que sa queue vieillit.
  if (points.length > 1) {
    const tail = points[0]
    const gradient = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y)
    gradient.addColorStop(0, 'transparent')
    gradient.addColorStop(1, s.color)
    ctx.strokeStyle = gradient
    ctx.globalAlpha = 0.5 * (1 - Math.min(1, (now - tail.t) / TRAIL_MS) * 0.5)
    ctx.shadowBlur = s.width * 0.8
    ctx.lineWidth = w * 0.8
    ctx.stroke(smoothPath(points))
  }
  // Point lumineux : un halo, puis un cœur plus clair.
  ctx.globalAlpha = 0.35
  ctx.shadowBlur = s.width * 2
  ctx.beginPath()
  ctx.arc(head.x, head.y, w * 1.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 0.95
  ctx.shadowBlur = s.width
  ctx.beginPath()
  ctx.arc(head.x, head.y, w * 0.75, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Trace factice qui porte la traînée de survol jusqu'au rendu (tldraw ne dessine que des traces). */
const TRAIL_SCRIBBLE = { id: 'laser-hover', points: [], size: 0, color: 'laser-hover', opacity: 1, state: 'active', delay: 0, shrink: 0, taper: false } as unknown as TLScribble

type ScribbleOverlays = Parameters<ScribbleOverlayUtil['render']>[1]

/** Opacité initiale donnée par tldraw aux traces laser (sert à normaliser le fondu). */
const TLDRAW_LASER_OPACITY = 0.7

/**
 * Remplace le rendu des traces laser (les autres traces, gomme ou lasso, gardent le rendu tldraw).
 * Même type que l'util par défaut : tldraw le substitue automatiquement.
 */
export class LaserOverlayUtil extends ScribbleOverlayUtil {
  // Traces venues du présentateur (double affichage) : dessinées comme les traces locales.
  // Elles ne passent pas par l'état de l'instance, que le gestionnaire de traces de tldraw réécrit.
  override isActive() {
    return super.isActive() || remoteScribblesAtom.get().length > 0 || laserTrailAtom.get().length > 0
  }

  override getOverlays() {
    const remote = remoteScribblesAtom.get().map((scribble) => ({
      id: `scribble:remote:${scribble.id}`,
      type: 'scribble' as const,
      props: { scribble },
    }))
    const trail = laserTrailAtom.get().length ? [{ id: 'scribble:laser-hover', type: 'scribble' as const, props: { scribble: TRAIL_SCRIBBLE } }] : []
    return [...super.getOverlays(), ...remote, ...trail]
  }

  override render(ctx: CanvasRenderingContext2D, overlays: ScribbleOverlays): void {
    const others = overlays.filter((o) => o.props.scribble.color !== 'laser' && o.props.scribble !== TRAIL_SCRIBBLE)
    if (others.length) super.render(ctx, others)

    const zoom = this.editor.getZoomLevel()
    const settings = laserSettingsAtom.get()
    for (const o of overlays) {
      if (o.props.scribble.color === 'laser') drawLaser(ctx, o.props.scribble, zoom, settings)
    }
    if (overlays.some((o) => o.props.scribble === TRAIL_SCRIBBLE)) drawTrail(ctx, laserTrailAtom.get(), zoom, settings)
  }
}

function drawLaser(ctx: CanvasRenderingContext2D, scribble: TLScribble, zoom: number, s: LaserSettings) {
  const pts = scribble.points
  if (!pts.length) return
  const fade = Math.min(1, Math.max(0, scribble.opacity / TLDRAW_LASER_OPACITY))
  if (fade <= 0) return

  const w = s.width / zoom // le contexte est en coordonnées de page
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const path = smoothPath(pts)
  ctx.strokeStyle = s.color
  ctx.shadowColor = s.color

  // Bords adoucis : un liseré large et léger sous le trait principal.
  ctx.globalAlpha = 0.3 * fade
  ctx.shadowBlur = s.width * 1.2
  ctx.lineWidth = w * 1.8
  ctx.stroke(path)
  // Trait principal, couleur homogène.
  ctx.globalAlpha = 0.9 * fade
  ctx.shadowBlur = s.width * 0.6
  ctx.lineWidth = w
  ctx.stroke(path)

  ctx.restore()
}

/** Courbe lissée passant par les milieux des segments. */
function smoothPath(pts: VecModel[]): Path2D {
  const path = new Path2D()
  path.moveTo(pts[0].x, pts[0].y)
  if (pts.length === 1) {
    path.lineTo(pts[0].x + 0.01, pts[0].y)
    return path
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2
    path.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
  }
  const last = pts[pts.length - 1]
  path.lineTo(last.x, last.y)
  return path
}

/**
 * Durée avant effacement. L'outil laser de tldraw lit `editor.options.laserDelayMs`
 * à chaque nouvelle session : on ajuste donc cette option à chaud.
 */
export function applyLaserTiming(editor: Editor, s: LaserSettings) {
  const options = editor.options as { laserDelayMs: number; laserFadeoutMs: number }
  options.laserDelayMs = s.delayMs
  options.laserFadeoutMs = Math.min(900, Math.max(300, s.delayMs / 3))
}

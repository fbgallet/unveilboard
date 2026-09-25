// Rendu « laser » des traces du pointeur laser tldraw, et réglage de leur durée.

import { ScribbleOverlayUtil, type Editor, type TLScribble, type VecModel } from 'tldraw'
import { laserSettingsAtom, type LaserSettings } from '../presentation/store'

type ScribbleOverlays = Parameters<ScribbleOverlayUtil['render']>[1]

/** Opacité initiale donnée par tldraw aux traces laser (sert à normaliser le fondu). */
const TLDRAW_LASER_OPACITY = 0.7

/**
 * Remplace le rendu des traces laser (les autres traces, gomme ou lasso, gardent le rendu tldraw).
 * Même type que l'util par défaut : tldraw le substitue automatiquement.
 */
export class LaserOverlayUtil extends ScribbleOverlayUtil {
  override render(ctx: CanvasRenderingContext2D, overlays: ScribbleOverlays): void {
    const others = overlays.filter((o) => o.props.scribble.color !== 'laser')
    if (others.length) super.render(ctx, others)

    const zoom = this.editor.getZoomLevel()
    const settings = laserSettingsAtom.get()
    for (const o of overlays) {
      if (o.props.scribble.color === 'laser') drawLaser(ctx, o.props.scribble, zoom, settings)
    }
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

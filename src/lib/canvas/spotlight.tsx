// Forme « calque occultant » : un rectangle qui, pendant la présentation, reste net
// tandis que tout le reste du canevas est flouté (voir SpotlightOverlay).
// La forme elle-même ne dessine qu'un cadre en pointillés, visible en édition.

import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  createShapePropsMigrationSequence,
  resizeBox,
  useValue,
  type TLResizeInfo,
  type TLShape,
} from 'tldraw'
import { editUnlockedAtom, modeAtom } from '../presentation/store'
import { useT } from '@/i18n/client'

export const SPOTLIGHT_TYPE = 'spotlight'

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [SPOTLIGHT_TYPE]: { w: number; h: number }
  }
}

export type SpotlightShape = TLShape<typeof SPOTLIGHT_TYPE>

// Migrations des propriétés, déclarées dès la première version. Pour faire évoluer la forme :
// ids = createShapePropsMigrationIds(SPOTLIGHT_TYPE, { AddX: 1 }), puis { id: ids.AddX, up, down }.
const spotlightMigrations = createShapePropsMigrationSequence({ sequence: [] })

export class SpotlightShapeUtil extends ShapeUtil<SpotlightShape> {
  static override type = SPOTLIGHT_TYPE
  static override props = { w: T.number, h: T.number }
  static override migrations = spotlightMigrations

  getDefaultProps(): SpotlightShape['props'] {
    return { w: 480, h: 300 }
  }

  // Creux : un clic à l'intérieur atteint les objets situés dessous.
  getGeometry(shape: SpotlightShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: false })
  }

  component(shape: SpotlightShape) {
    return <SpotlightFrame w={shape.props.w} h={shape.props.h} />
  }

  getIndicatorPath(shape: SpotlightShape) {
    const path = new Path2D()
    path.rect(0, 0, shape.props.w, shape.props.h)
    return path
  }

  override onResize(shape: SpotlightShape, info: TLResizeInfo<SpotlightShape>) {
    return resizeBox(shape, info)
  }

  override canBind() {
    return false
  }

  // Le flou suit la boîte englobante : pas de rotation.
  override hideRotateHandle() {
    return true
  }
}

function SpotlightFrame({ w, h }: { w: number; h: number }) {
  const t = useT()
  const presenting = useValue(modeAtom) === 'present'
  const unlocked = useValue(editUnlockedAtom)
  // En présentation verrouillée, seul le flou autour du cadre est visible.
  if (presenting && !unlocked) return null
  return (
    <HTMLContainer className={`spotlight-frame ${presenting ? 'spotlight-frame-live' : ''}`} style={{ width: w, height: h }}>
      {!presenting && <span className="spotlight-label">{t.spotlight.shapeLabel}</span>}
    </HTMLContainer>
  )
}

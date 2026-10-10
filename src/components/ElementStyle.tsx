'use client'

import { DefaultColorStyle, getColorValue, useValue, type Editor, type TLDefaultColorStyle, type TLShape, type TLShapeId, type TLShapePartial } from 'tldraw'
import { useT } from '@/i18n/client'

const COLORS = DefaultColorStyle.values
/** Fond pâle (teinte de la couleur) ou vif (couleur pleine), comme les fonds « solid » et « fill » de tldraw. */
type Intensity = 'solid' | 'fill'
const MIXED = 'mixed'

/**
 * Fond d'une forme : sa couleur quand elle est remplie (`none` : sans fond). Pour une boîte, la
 * couleur du fond est aussi celle du contour (tldraw n'en distingue pas). Undefined : pas de fond.
 */
function backgroundOf(s: TLShape): string | undefined {
  const props = s.props as { color?: string; fill?: string }
  if (s.type === 'geo') return props.fill === 'none' ? 'none' : props.color
  if (s.type === 'note') return props.color
}

/** Couleur du texte : `labelColor` des boîtes, notes et flèches ; `color` d'un texte seul. */
function textColorOf(s: TLShape): string | undefined {
  const props = s.props as { color?: string; labelColor?: string }
  if ('labelColor' in props) return props.labelColor
  if (s.type === 'text') return props.color
}

function intensityOf(s: TLShape): Intensity | undefined {
  const fill = (s.props as { fill?: string }).fill
  return s.type === 'geo' && (fill === 'solid' || fill === 'fill') ? fill : undefined
}

/** Valeur commune aux formes concernées, `mixed` si elles diffèrent, undefined si aucune n'est concernée. */
function common<T extends string>(shapes: TLShape[], read: (s: TLShape) => T | undefined): T | typeof MIXED | undefined {
  const values = new Set(shapes.map(read).filter((v): v is T => v !== undefined))
  return values.size > 1 ? MIXED : [...values][0]
}

function setBackground(editor: Editor, ids: TLShapeId[], color: TLDefaultColorStyle | 'none', intensity?: Intensity) {
  editor.markHistoryStoppingPoint('fond')
  editor.updateShapes(
    ids.flatMap((id): TLShapePartial[] => {
      const s = editor.getShape(id)
      if (!s) return []
      if (s.type === 'geo') {
        const fill = s.props.fill
        const props = color === 'none' ? { fill: 'none' as const } : { color, fill: intensity ?? (fill === 'none' || fill === 'semi' ? 'solid' : fill) }
        return [{ id, type: 'geo', props }]
      }
      return s.type === 'note' && color !== 'none' ? [{ id, type: s.type, props: { color } }] : []
    })
  )
}

function setTextColor(editor: Editor, ids: TLShapeId[], color: TLDefaultColorStyle) {
  editor.markHistoryStoppingPoint('couleur du texte')
  editor.updateShapes(
    ids.flatMap((id): TLShapePartial[] => {
      const s = editor.getShape(id)
      if (!s) return []
      if ('labelColor' in s.props) return [{ id, type: s.type, props: { labelColor: color } } as TLShapePartial]
      return s.type === 'text' ? [{ id, type: s.type, props: { color } }] : []
    })
  )
}

/** Fond et couleur du texte des formes, tels que l'onglet et la barre les affichent. */
export function useElementStyle(editor: Editor, ids: TLShapeId[]) {
  return useValue(
    'element style',
    () => {
      const shapes = ids.flatMap((id) => editor.getShape(id) ?? [])
      const colors = editor.getCurrentTheme().colors[editor.getColorMode()]
      const intensity = common(shapes, intensityOf)
      return {
        background: common(shapes, backgroundOf),
        text: common(shapes, textColorOf),
        intensity: intensity === MIXED ? undefined : intensity,
        swatch: (color: string, variant: 'solid' | 'semi' | 'fill') => getColorValue(colors, color as TLDefaultColorStyle, variant),
      }
    },
    [editor, ids]
  )
}

/**
 * Pastilles de fond (avec « sans fond » et l'intensité pâle / vive) et de couleur du texte,
 * pour une ou plusieurs formes. Les lignes sans objet (pas de fond pour une flèche) sont omises.
 */
export function ElementStyleControls({ editor, ids }: { editor: Editor; ids: TLShapeId[] }) {
  const t = useT()
  const style = useElementStyle(editor, ids)
  const intensity = style.intensity ?? 'solid'
  const bgVariant = intensity === 'fill' ? 'fill' : 'semi'
  if (style.background === undefined && style.text === undefined) return <p className="text-[11px] text-zinc-400">{t.elementStyle.none}</p>
  return (
    <div className="element-style">
      {style.background !== undefined && (
        <div className="element-style-row">
          <span className="element-style-label" title={t.elementStyle.backgroundHint}>
            {t.elementStyle.background}
          </span>
          <div className="element-swatches" role="radiogroup" aria-label={t.elementStyle.background}>
            <button
              className={`element-swatch element-swatch-none ${style.background === 'none' ? 'element-swatch-on' : ''}`}
              onClick={() => setBackground(editor, ids, 'none')}
              role="radio"
              aria-checked={style.background === 'none'}
              title={t.elementStyle.noBackground}
              aria-label={t.elementStyle.noBackground}
            />
            {COLORS.map((c) => (
              <button
                key={c}
                className={`element-swatch ${style.background === c ? 'element-swatch-on' : ''}`}
                style={{ background: style.swatch(c, bgVariant), borderColor: style.swatch(c, 'solid') }}
                onClick={() => setBackground(editor, ids, c)}
                role="radio"
                aria-checked={style.background === c}
                title={t.elementStyle.colors[c]}
                aria-label={t.elementStyle.colors[c]}
              />
            ))}
          </div>
          {style.background !== 'none' && style.background !== MIXED && style.intensity !== undefined && (
            <span className="tree-dirs element-intensity" role="group" aria-label={t.elementStyle.intensity}>
              {(['solid', 'fill'] as const).map((i) => (
                <button
                  key={i}
                  className={`tree-dir ${intensity === i ? 'tree-dir-active' : ''}`}
                  onClick={() => setBackground(editor, ids, style.background as TLDefaultColorStyle, i)}
                  aria-pressed={intensity === i}
                >
                  {t.elementStyle[i === 'solid' ? 'pale' : 'vivid']}
                </button>
              ))}
            </span>
          )}
        </div>
      )}
      {style.text !== undefined && (
        <div className="element-style-row">
          <span className="element-style-label">{t.elementStyle.text}</span>
          <div className="element-swatches" role="radiogroup" aria-label={t.elementStyle.text}>
            {COLORS.map((c) => (
              <button
                key={c}
                className={`element-swatch element-swatch-text ${style.text === c ? 'element-swatch-on' : ''}`}
                style={{ color: style.swatch(c, 'solid') }}
                onClick={() => setTextColor(editor, ids, c)}
                role="radio"
                aria-checked={style.text === c}
                title={t.elementStyle.colors[c]}
                aria-label={t.elementStyle.colors[c]}
              >
                A
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Aperçu compact (« A » sur le fond) : bouton de la barre d'action qui ouvre les pastilles. */
export function ElementStylePreview({ editor, ids }: { editor: Editor; ids: TLShapeId[] }) {
  const style = useElementStyle(editor, ids)
  const bg = style.background
  const filled = bg !== undefined && bg !== 'none' && bg !== MIXED
  return (
    <span
      className="element-style-preview"
      style={{
        background: filled ? style.swatch(bg, style.intensity === 'fill' ? 'fill' : 'semi') : undefined,
        borderColor: filled ? style.swatch(bg, 'solid') : undefined,
        color: style.text && style.text !== MIXED ? style.swatch(style.text, 'solid') : undefined,
      }}
    >
      A
    </span>
  )
}

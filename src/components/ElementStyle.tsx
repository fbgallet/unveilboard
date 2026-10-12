'use client'

import { DefaultColorStyle, getColorValue, useValue, type Editor, type TLDefaultColorStyle, type TLShape, type TLShapeId, type TLShapePartial } from 'tldraw'
import { useT } from '@/i18n/client'

const COLORS = DefaultColorStyle.values
/**
 * Fond coloré d'une boîte, comme les remplissages de tldraw : pâle (« solid » : teinte de la
 * couleur), vif (« fill » : couleur pleine), hachuré (« pattern »).
 */
type Intensity = 'solid' | 'fill' | 'pattern'
const INTENSITIES: Intensity[] = ['solid', 'fill', 'pattern']
const MIXED = 'mixed'
/** Fond uni : opaque, de la couleur du canevas (le remplissage « semi » de tldraw, qui n'est pas teinté). */
const PLAIN = 'plain'

/**
 * Fond d'une forme : `none` (transparent), `plain` (uni, couleur du canevas) ou sa couleur quand il
 * est teinté. Pour une boîte, cette couleur est aussi celle du contour (tldraw n'en distingue pas) :
 * sans fond ou en fond uni, le contour garde sa couleur, qui n'est pas celle du fond. Undefined : pas de fond.
 */
function backgroundOf(s: TLShape): string | undefined {
  const props = s.props as { color?: string; fill?: string }
  if (s.type === 'geo') return props.fill === 'none' ? 'none' : props.fill === 'semi' ? PLAIN : props.color
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
  return s.type === 'geo' && INTENSITIES.includes(fill as Intensity) ? (fill as Intensity) : undefined
}

/** Valeur commune aux formes concernées, `mixed` si elles diffèrent, undefined si aucune n'est concernée. */
function common<T extends string>(shapes: TLShape[], read: (s: TLShape) => T | undefined): T | typeof MIXED | undefined {
  const values = new Set(shapes.map(read).filter((v): v is T => v !== undefined))
  return values.size > 1 ? MIXED : [...values][0]
}

function setBackground(editor: Editor, ids: TLShapeId[], color: TLDefaultColorStyle | 'none' | typeof PLAIN, intensity?: Intensity) {
  editor.markHistoryStoppingPoint('fond')
  editor.updateShapes(
    ids.flatMap((id): TLShapePartial[] => {
      const s = editor.getShape(id)
      if (!s) return []
      if (s.type === 'geo') {
        const fill = s.props.fill
        if (color === 'none' || color === PLAIN) return [{ id, type: 'geo', props: { fill: color === 'none' ? 'none' : 'semi' } }]
        // Une couleur choisie sur une boîte sans fond (ou au fond uni) la teinte, en pâle.
        return [{ id, type: 'geo', props: { color, fill: intensity ?? (fill === 'none' || fill === 'semi' ? 'solid' : fill) } }]
      }
      return s.type === 'note' && color !== 'none' && color !== PLAIN ? [{ id, type: s.type, props: { color } }] : []
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
        /** Des boîtes dans la sélection : « sans fond » et « fond uni » s'appliquent. */
        boxes: shapes.some((s) => s.type === 'geo'),
        /** Couleur du canevas (fond uni). */
        paper: colors.solid,
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
  const tinted = style.background !== undefined && style.background !== 'none' && style.background !== PLAIN && style.background !== MIXED
  if (style.background === undefined && style.text === undefined) return <p className="text-[11px] text-zinc-400">{t.elementStyle.none}</p>
  return (
    <div className="element-style">
      {style.background !== undefined && (
        <div className="element-style-row">
          <span className="element-style-label" title={t.elementStyle.backgroundHint}>
            {t.elementStyle.background}
          </span>
          <div className="element-swatches" role="radiogroup" aria-label={t.elementStyle.background}>
            {style.boxes && (
              <>
                <button
                  className={`element-swatch element-swatch-none ${style.background === 'none' ? 'element-swatch-on' : ''}`}
                  onClick={() => setBackground(editor, ids, 'none')}
                  role="radio"
                  aria-checked={style.background === 'none'}
                  title={t.elementStyle.noBackground}
                  aria-label={t.elementStyle.noBackground}
                />
                <button
                  className={`element-swatch element-swatch-plain ${style.background === PLAIN ? 'element-swatch-on' : ''}`}
                  style={{ background: style.paper }}
                  onClick={() => setBackground(editor, ids, PLAIN)}
                  role="radio"
                  aria-checked={style.background === PLAIN}
                  title={t.elementStyle.plainBackground}
                  aria-label={t.elementStyle.plainBackground}
                />
              </>
            )}
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
          {tinted && style.boxes && (
            <span className="tree-dirs element-intensity" role="group" aria-label={t.elementStyle.intensity}>
              {INTENSITIES.map((i) => (
                <button
                  key={i}
                  className={`tree-dir ${intensity === i ? 'tree-dir-active' : ''}`}
                  onClick={() => setBackground(editor, ids, style.background as TLDefaultColorStyle, i)}
                  aria-pressed={intensity === i}
                >
                  {t.elementStyle.intensities[i]}
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
  const filled = bg !== undefined && bg !== 'none' && bg !== PLAIN && bg !== MIXED
  return (
    <span
      className="element-style-preview"
      style={{
        background: filled ? style.swatch(bg, style.intensity === 'fill' ? 'fill' : 'semi') : bg === PLAIN ? style.paper : undefined,
        borderColor: filled ? style.swatch(bg, 'solid') : undefined,
        color: style.text && style.text !== MIXED ? style.swatch(style.text, 'solid') : undefined,
      }}
    >
      A
    </span>
  )
}

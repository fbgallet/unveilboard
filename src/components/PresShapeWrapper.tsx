'use client'

import { forwardRef } from 'react'
import { DefaultShapeWrapper, useEditor, useValue, type TLShape, type TLShapeWrapperProps } from 'tldraw'
import { useT } from '@/i18n/client'
import { presetById, presetSettingsAtom, swatchColor } from '@/lib/canvas/presets'
import { functionOf } from '@/lib/canvas/tree'
import { shapeClassesAtom } from '@/lib/presentation/store'

/**
 * Enveloppe chaque forme rendue et lui ajoute les classes de présentation
 * (cachée, atténuée, surlignée, effet d'entrée). Le document n'est jamais modifié :
 * tout passe par le CSS. Elle porte aussi l'étiquette de nature, qui suit ainsi
 * exactement la forme (apparition, atténuation, tracé).
 */
export const PresShapeWrapper = forwardRef<HTMLDivElement, TLShapeWrapperProps>(
  function PresShapeWrapper(props, ref) {
    const id = props.shape.id
    const pres = useValue(
      'pres-class',
      () => {
        const classes = shapeClassesAtom.get()
        if (!classes) return null
        return classes.byId.get(id) ?? classes.fallback
      },
      [id]
    )
    const className = [props.className, pres?.className].filter(Boolean).join(' ')
    const style = pres?.style ? { ...props.style, ...pres.style } : props.style
    return (
      <DefaultShapeWrapper ref={ref} {...props} style={style} className={className || undefined}>
        {props.children}
        {!props.isBackground && props.shape.type === 'geo' && <NatureTag shape={props.shape} />}
      </DefaultShapeWrapper>
    )
  }
)

/**
 * Étiquette au-dessus de la forme : sa nature (« QUESTION », « ÉNONCÉ NORMATIF · Hobbes »),
 * ou, pour un nœud relié dans un arbre argumentatif, sa fonction seule (« OBJECTION · Aristote »),
 * dans la couleur de la relation. Les citations reçoivent en plus des guillemets.
 */
function NatureTag({ shape }: { shape: TLShape }) {
  const t = useT()
  const editor = useEditor()
  const tag = useValue(
    'nature tag',
    () => {
      if (!presetSettingsAtom.get().showTags) return null
      const nature = presetById(editor, shape.meta.preset as string | undefined)
      const relation = functionOf(editor, shape.id)
      const author = typeof shape.meta.author === 'string' ? shape.meta.author.trim() : ''
      const quote = nature?.id === 'quote'
      if (relation) return { text: [relation.role, author].filter(Boolean).join(' · '), color: swatchColor(editor, relation), quote }
      if (!nature || nature.target !== 'shape' || nature.tag === false) return quote ? { text: '', color: '', quote } : null
      const modality = shape.meta.modality === 'descriptive' || shape.meta.modality === 'prescriptive' ? t.presets.modalities[shape.meta.modality] : ''
      return { text: [[nature.name, modality].filter(Boolean).join(' '), author].filter(Boolean).join(' · '), color: swatchColor(editor, nature), quote }
    },
    [editor, shape.id, shape.meta.preset, shape.meta.modality, shape.meta.author, t]
  )
  if (!tag) return null
  return (
    <>
      {tag.text && (
        <div className="nature-tag" style={{ color: tag.color }}>
          {tag.text}
        </div>
      )}
      {tag.quote && <div className="quote-mark" aria-hidden>“</div>}
    </>
  )
}

'use client'

import { forwardRef } from 'react'
import { DefaultShapeWrapper, useEditor, useValue, type TLShape, type TLShapeWrapperProps } from 'tldraw'
import { useT } from '@/i18n/client'
import { presetById, presetSettingsAtom, swatchColor } from '@/lib/canvas/presets'
import { functionColorOf, functionOf, isThesisRoot } from '@/lib/canvas/tree'
import { presetName, presetRole } from '@/lib/presets/labels'
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
    // Suggestion de l'IA en attente : estompée (et étiquetée « suggestion », voir NatureTag).
    const pending = props.shape.meta.suggestion ? 'ai-suggestion' : ''
    const className = [props.className, pres?.className, pending].filter(Boolean).join(' ')
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
      // Modalité : une pastille à part (« normatif »), et non un adjectif accolé au nom de la nature,
      // pour rester correcte dans toutes les langues (accord, place de l'adjectif).
      const modality = shape.meta.modality === 'descriptive' || shape.meta.modality === 'prescriptive' ? t.presets.modalities[shape.meta.modality] : ''
      const label = (name: string | undefined, color: string) => ({ text: [name, author].filter(Boolean).join(' · '), color, modality, quote })
      if (relation) {
        const color = functionColorOf(editor, shape.id) ?? relation.style.color
        return label(presetRole(relation, t), swatchColor(editor, { ...relation, style: { ...relation.style, color } }))
      }
      // Racine d'une carte d'argument de type Énoncé : la thèse à discuter.
      if (isThesisRoot(editor, shape.id)) return label(t.tree.thesis, nature ? swatchColor(editor, nature) : 'var(--color-stone-500)')
      if (!nature || nature.target !== 'shape' || nature.tag === false) return quote ? { text: '', color: '', modality: '', quote } : null
      return label(presetName(nature, t), swatchColor(editor, nature))
    },
    [editor, shape.id, shape.meta.preset, shape.meta.modality, shape.meta.author, t]
  )
  const pending = !!shape.meta.suggestion
  // Extrait introuvable dans la source : « à vérifier », écrit sur l'étiquette.
  const unverified = !!shape.meta.excerptUnverified
  if (!tag && !pending && !unverified) return null
  return (
    <>
      {(tag?.text || pending || unverified) && (
        <div className="nature-tag" style={{ color: tag?.color }}>
          {pending && <span className="suggestion-pill">{t.suggestions.tag}</span>}
          {unverified && <span className="unverified-pill">{t.source.toCheck}</span>}
          {tag?.text}
          {tag?.modality && <span className="nature-modality">{tag.modality}</span>}
        </div>
      )}
      {tag?.quote && <div className="quote-mark" aria-hidden>“</div>}
    </>
  )
}

'use client'

import { forwardRef } from 'react'
import { DefaultShapeWrapper, useEditor, useValue, type TLShape, type TLShapeWrapperProps } from 'tldraw'
import { useT } from '@/i18n/client'
import { presetById, presetSettingsAtom, swatchColor } from '@/lib/canvas/presets'
import { functionColorOf, functionOf, isThesisRoot } from '@/lib/canvas/tree'
import { presetName, presetRole } from '@/lib/presets/labels'
import { LINKED } from '@/lib/presets/presets'
import { shapeClassesAtom } from '@/lib/presentation/store'
import { taskOf, toggleTask } from '@/lib/canvas/tasks'

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
    // Case cochée : le texte est barré et estompé.
    const task = props.shape.type === 'geo' && !props.isBackground ? taskOf(props.shape.meta) : undefined
    const className = [props.className, pres?.className, pending, task === 'done' && 'task-done'].filter(Boolean).join(' ')
    const style = pres?.style ? { ...props.style, ...pres.style } : props.style
    return (
      <DefaultShapeWrapper ref={ref} {...props} style={style} className={className || undefined}>
        {props.children}
        {!props.isBackground && props.shape.type === 'geo' && <NatureTag shape={props.shape} />}
        {task && <TaskBox id={props.shape.id} done={task === 'done'} />}
      </DefaultShapeWrapper>
    )
  }
)

/** Case à cocher, dans le coin de la boîte : un clic la coche ou la décoche (sauf en lecture seule). */
function TaskBox({ id, done }: { id: TLShape['id']; done: boolean }) {
  const t = useT()
  const editor = useEditor()
  const readonly = useValue('readonly', () => editor.getIsReadonly(), [editor])
  return (
    <button
      className={`task-box ${done ? 'task-box-done' : ''}`}
      role="checkbox"
      aria-checked={done}
      aria-label={done ? t.tasks.uncheck : t.tasks.check}
      title={readonly ? undefined : done ? t.tasks.uncheck : t.tasks.check}
      disabled={readonly}
      // Le clic reste à la case : ni sélection, ni déplacement de la boîte.
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        toggleTask(editor, id)
      }}
    >
      {done && (
        <svg viewBox="0 0 16 16" aria-hidden>
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

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
      // Pastille de prémisses liées : un point, sans étiquette (la fonction se lit sur sa flèche).
      if (nature?.id === LINKED) return null
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
      {tag?.quote && (
        <>
          <div className="quote-mark quote-mark-open" aria-hidden>“</div>
          <div className="quote-mark quote-mark-close" aria-hidden>”</div>
        </>
      )}
    </>
  )
}

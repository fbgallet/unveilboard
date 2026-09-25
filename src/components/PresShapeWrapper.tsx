'use client'

import { forwardRef } from 'react'
import { DefaultShapeWrapper, useValue, type TLShapeWrapperProps } from 'tldraw'
import { shapeClassesAtom } from '@/lib/presentation/store'

/**
 * Enveloppe chaque forme rendue et lui ajoute les classes de présentation
 * (cachée, atténuée, surlignée, effet d'entrée). Le document n'est jamais modifié :
 * tout passe par le CSS.
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
    return <DefaultShapeWrapper ref={ref} {...props} style={style} className={className || undefined} />
  }
)

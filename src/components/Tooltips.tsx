'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Infobulles de l'app : à la place de l'infobulle native (lente, et différente d'un système à l'autre),
// une bulle discrète qui apparaît vite, pour tout élément qui a un `title` (boutons en icône surtout).
// Un seul écouteur pour toute la page : aucun composant à envelopper. Pendant le survol, le `title`
// est retiré (sinon l'infobulle native s'afficherait aussi), puis remis au départ du pointeur ; un
// élément qui n'avait que lui pour nom reçoit un `aria-label`. Les menus de tldraw ont les leurs ;
// nos composants placés dans une zone de tldraw (en haut à droite…) s'y soustraient avec `data-app-tips`.

const DELAY = 300
const GAP = 6

/** Marge entre la bulle et les bords de la fenêtre. */
const EDGE = 6

interface Tip {
  text: string
  /** L'élément survolé (coordonnées de la fenêtre). */
  anchor: { left: number; right: number; top: number; bottom: number }
}

export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    let current: HTMLElement | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    const restore = () => {
      clearTimeout(timer)
      if (current?.dataset.tip !== undefined) {
        current.setAttribute('title', current.dataset.tip)
        delete current.dataset.tip
      }
      current = null
      setTip(null)
    }

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[title]')
      if (!el || el === current) return
      // Les composants de tldraw ont leurs propres infobulles.
      if (el.closest('[class*="tlui-"]') && !el.closest('[data-app-tips]')) return
      const text = el.getAttribute('title')?.trim()
      if (!text) return
      restore()
      current = el
      el.dataset.tip = text
      el.removeAttribute('title')
      if (!el.getAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', text)
      timer = setTimeout(() => {
        if (current !== el || !el.isConnected) return
        const { left, right, top, bottom } = el.getBoundingClientRect()
        setTip({ text, anchor: { left, right, top, bottom } })
      }, DELAY)
    }

    const onOut = (e: PointerEvent) => {
      if (!current) return
      const to = e.relatedTarget as Node | null
      if (to && current.contains(to)) return
      restore()
    }

    document.addEventListener('pointerover', onOver, true)
    document.addEventListener('pointerout', onOut, true)
    document.addEventListener('pointerdown', restore, true)
    document.addEventListener('keydown', restore, true)
    window.addEventListener('scroll', restore, true)
    window.addEventListener('blur', restore)
    return () => {
      restore()
      document.removeEventListener('pointerover', onOver, true)
      document.removeEventListener('pointerout', onOut, true)
      document.removeEventListener('pointerdown', restore, true)
      document.removeEventListener('keydown', restore, true)
      window.removeEventListener('scroll', restore, true)
      window.removeEventListener('blur', restore)
    }
  }, [])

  // Placement une fois la bulle mesurée : au-dessus de l'élément s'il y a la place, sinon
  // au-dessous ; centrée sur lui, sans sortir de la fenêtre (une bulle de plusieurs lignes aussi).
  const bubble = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = bubble.current
    if (!tip || !el) return
    const { width, height } = el.getBoundingClientRect()
    const { anchor } = tip
    const above = anchor.top - GAP - height
    const below = anchor.bottom + GAP
    const top = above >= EDGE || below + height > window.innerHeight - EDGE ? Math.max(EDGE, above) : below
    const center = (anchor.left + anchor.right) / 2
    const left = Math.min(Math.max(center - width / 2, EDGE), window.innerWidth - EDGE - width)
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    el.style.visibility = 'visible'
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div ref={bubble} className="app-tooltip" role="tooltip" style={{ left: 0, top: 0, visibility: 'hidden' }}>
      {tip.text}
    </div>,
    document.body
  )
}

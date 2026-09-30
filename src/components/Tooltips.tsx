'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Infobulles de l'app : à la place de l'infobulle native (lente, et différente d'un système à l'autre),
// une bulle discrète qui apparaît vite, pour tout élément qui a un `title` (boutons en icône surtout).
// Un seul écouteur pour toute la page : aucun composant à envelopper. Pendant le survol, le `title`
// est retiré (sinon l'infobulle native s'afficherait aussi), puis remis au départ du pointeur ; un
// élément qui n'avait que lui pour nom reçoit un `aria-label`. Les menus de tldraw ont les leurs.

const DELAY = 300
const GAP = 6

interface Tip {
  text: string
  x: number
  y: number
  below: boolean
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
      if (el.closest('[class*="tlui-"]')) return
      const text = el.getAttribute('title')?.trim()
      if (!text) return
      restore()
      current = el
      el.dataset.tip = text
      el.removeAttribute('title')
      if (!el.getAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', text)
      timer = setTimeout(() => {
        if (current !== el || !el.isConnected) return
        const r = el.getBoundingClientRect()
        const below = r.top < 48
        setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + GAP : r.top - GAP, below })
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

  if (!tip) return null
  return createPortal(
    <div
      className="app-tooltip"
      role="tooltip"
      style={{
        // Centrée sur l'élément, sans sortir de l'écran (la bulle fait au plus 260 px).
        left: Math.min(Math.max(tip.x, 136), window.innerWidth - 136),
        top: tip.y,
        transform: `translate(-50%, ${tip.below ? '0' : '-100%'})`,
      }}
    >
      {tip.text}
    </div>,
    document.body
  )
}

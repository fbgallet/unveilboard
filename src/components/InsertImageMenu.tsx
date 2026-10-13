'use client'

import { useEffect, useRef } from 'react'
import { atom, useValue } from 'tldraw'
import { useT } from '@/i18n/client'
import { aiSettingsAtom, imageGenerationAvailable, serverAiAtom } from '@/lib/ai/client'
import { imageGenAtom } from './ImageGen'
import { imageSearchAtom } from './ImageSearch'

/**
 * Bouton « image » de la barre d'outils de tldraw : au lieu d'ouvrir tout de suite le sélecteur de
 * fichiers, il propose de quoi insérer une image : un fichier, une image de Wikimedia Commons, ou
 * une image générée par l'IA. Le raccourci Ctrl/⌘ + U ouvre toujours le sélecteur de fichiers.
 */
export const insertImageMenuAtom = atom<boolean>('insertImageMenu', false)

/** Le sélecteur de fichiers de tldraw (posé par la surcharge de l'outil, dans Studio). */
let insertFile: (() => void) | null = null
export function setInsertFile(fn: () => void) {
  insertFile = fn
}

/** Le bouton « image » de la barre d'outils (ou du menu « plus » de la barre, s'il y est rangé). */
const toolButton = () =>
  [...document.querySelectorAll<HTMLElement>('[data-testid="tools.asset"], [data-value="asset"]')].find((el) => el.offsetParent !== null)

export function InsertImageMenu() {
  const t = useT()
  const open = useValue(insertImageMenuAtom)
  const settings = useValue(aiSettingsAtom)
  const server = useValue(serverAiAtom)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      // Un clic sur le bouton lui-même le referme déjà (bascule) : ne pas le rouvrir aussitôt.
      const target = e.target as Node
      if (!ref.current?.contains(target) && !toolButton()?.contains(target)) insertImageMenuAtom.set(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && insertImageMenuAtom.set(false)
    window.addEventListener('pointerdown', onDown, { capture: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, { capture: true })
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  if (!open) return null
  // Au-dessus du bouton de la barre d'outils (en bas de l'écran), sinon au milieu.
  const button = toolButton()?.getBoundingClientRect()
  const style = button ? { left: button.left + button.width / 2, top: button.top - 8 } : { left: window.innerWidth / 2, top: window.innerHeight - 80 }
  const canDraw = imageGenerationAvailable(settings, server)
  const choose = (action: () => void) => () => {
    insertImageMenuAtom.set(false)
    action()
  }
  return (
    <div ref={ref} className="insert-image-menu" style={style} role="menu" aria-label={t.insertImage.title} data-app-tips>
      <button role="menuitem" onClick={choose(() => insertFile?.())}>
        {t.insertImage.file}
      </button>
      <button role="menuitem" onClick={choose(() => imageSearchAtom.set({ query: '' }))} title={t.imageSearch.searchHint}>
        {t.insertImage.commons}
      </button>
      <button
        role="menuitem"
        disabled={!canDraw}
        onClick={choose(() => imageGenAtom.set({ sources: [] }))}
        title={canDraw ? t.imageGen.pictureHint : t.imageGen.unavailable}
      >
        {t.insertImage.generate}
      </button>
    </div>
  )
}

// Utilitaire clavier partagé.

/**
 * Ignore le prochain relâchement de `key`. tldraw réagit à certaines touches au relâchement
 * (Tab : sélection de la forme suivante, et la caméra la suit) : quand l'appui a déjà été traité
 * par l'application, le relâchement ne doit pas l'être une seconde fois.
 */
export function swallowNextKeyUp(key: string) {
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key !== key) return
    e.preventDefault()
    e.stopPropagation()
    window.removeEventListener('keyup', onKeyUp, { capture: true })
  }
  window.addEventListener('keyup', onKeyUp, { capture: true })
}

'use client'

// Langue côté navigateur : un contexte React (rendu serveur correct, chaque requête a sa
// langue), doublé d'une variable de module pour le code hors React (messages d'erreur,
// valeurs par défaut). Pas d'atome tldraw ici : ce module est chargé sur toutes les pages.

import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { DEFAULT_LOCALE, LOCALE_COOKIE, messagesFor, type Locale, type Messages } from './config'

let currentLocale: Locale = DEFAULT_LOCALE

/**
 * Libellés de la langue courante, pour le code hors React qui s'exécute dans le navigateur.
 * Les composants utilisent useT(), qui les fait se redessiner au changement de langue.
 */
export function m(): Messages {
  return messagesFor(currentLocale)
}

interface I18nContextValue {
  locale: Locale
  t: Messages
  setLocale(locale: Locale): void
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ locale: initial, children }: { locale: Locale; children: React.ReactNode }) {
  const router = useRouter()
  const [locale, setState] = useState<Locale>(() => {
    if (typeof window !== 'undefined') currentLocale = initial
    return initial
  })

  const setLocale = useCallback(
    (next: Locale) => {
      currentLocale = next
      setState(next)
      document.documentElement.lang = next
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
      // Les pages rendues côté serveur (accueil, connexion, métadonnées) suivent.
      router.refresh()
    },
    [router]
  )

  const value = useMemo(() => ({ locale, t: messagesFor(locale), setLocale }), [locale, setLocale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('I18nProvider manquant')
  return ctx
}

/** Libellés de la langue courante. */
export function useT(): Messages {
  return useI18n().t
}

export function useLocale(): [Locale, (locale: Locale) => void] {
  const { locale, setLocale } = useI18n()
  return [locale, setLocale]
}

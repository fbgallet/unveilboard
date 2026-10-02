// Langues de l'interface. Le contenu des schémas n'est jamais traduit : seuls les libellés
// et les valeurs par défaut (titres, préréglages de départ, exemple) suivent la langue.

import { en, type Messages } from './en'
import { fr } from './fr'
import { DESKTOP_MESSAGES, withOverrides } from './desktop'
import { isDesktop } from '@/lib/desktop'

export const LOCALES = ['en', 'fr'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE = 'locale'

export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français' }

const MESSAGES: Record<Locale, Messages> = { en, fr }

const desktopMessages: Partial<Record<Locale, Messages>> = {}

/** Libellés d'une langue ; dans l'application de bureau, avec ses propres variantes (desktop.ts). */
export function messagesFor(locale: Locale): Messages {
  if (!isDesktop()) return MESSAGES[locale]
  return (desktopMessages[locale] ??= withOverrides(MESSAGES[locale], DESKTOP_MESSAGES[locale]))
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * Première langue prise en charge parmi les préférences (en-tête Accept-Language
 * ou navigator.languages) ; anglais par défaut.
 */
export function matchLocale(preferences: readonly string[]): Locale {
  for (const pref of preferences) {
    const base = pref.split(';')[0].trim().toLowerCase().split('-')[0]
    if (isLocale(base)) return base
  }
  return DEFAULT_LOCALE
}

export function parseAcceptLanguage(header: string | null): string[] {
  return header ? header.split(',') : []
}

export type { Messages }

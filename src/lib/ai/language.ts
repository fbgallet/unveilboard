// Langue du contenu écrit par l'IA (textes des boîtes, notes, narration), distincte de celle de
// l'interface. Pur : utilisé par les consignes (aussi côté serveur) et par les réglages.

/** Écrire dans la langue de la demande ou du texte source (pour un schéma existant : la sienne). */
export const AUTO_LANG = 'auto'
/** Réglage : la langue de l'interface. */
export const UI_LANG = 'ui'

/** Langues proposées dans les menus ; toute autre peut être saisie par son code (ISO 639-1). */
export const CONTENT_LANGS = ['fr', 'en', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ro', 'el', 'ca', 'sv', 'da', 'no', 'fi', 'cs', 'tr', 'ar', 'he', 'ru', 'uk', 'zh', 'ja', 'ko'] as const

/** Langues dans lesquelles l'app a ses propres libellés (src/i18n/config.ts) : les relations y sont traduites. */
export const APP_LANGS = ['en', 'fr']

/** Code de langue plausible (« de », « pt-BR »). */
export function isLangCode(value: string): boolean {
  return /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(value)
}

export const baseLang = (code: string) => code.toLowerCase().split('-')[0]

/** Nom d'une langue (« German », « allemand ») dans la langue donnée ; le code s'il est inconnu. */
export function languageName(code: string, inLocale = 'en'): string {
  try {
    const name = new Intl.DisplayNames([inLocale], { type: 'language' }).of(code)
    return name && name !== code ? name : code
  } catch {
    return code
  }
}

/** Langue à demander pour un réglage : « auto », celle de l'interface, ou une langue choisie. */
export function resolveContentLang(setting: string | undefined, uiLocale: string): string {
  if (setting === UI_LANG) return uiLocale
  return setting && isLangCode(setting) ? setting : AUTO_LANG
}

/** Réglage valide (sinon : automatique). */
export function normalizeContentLang(value: unknown): string {
  return typeof value === 'string' && (value === AUTO_LANG || value === UI_LANG || isLangCode(value)) ? value : AUTO_LANG
}

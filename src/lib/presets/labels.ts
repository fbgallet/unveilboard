// Noms affichés des préréglages. Les préréglages de départ sont enregistrés avec les noms de la
// langue active à leur création : tant que l'utilisateur ne les a pas renommés, on les affiche
// dans la langue courante. Un nom personnalisé reste tel quel.

import { LOCALES, messagesFor, type Messages } from '@/i18n/config'
import { LEGACY_DEFAULT_NAMES, type Preset } from './presets'

function localized(value: string | undefined, id: string, table: (t: Messages) => Record<string, string>, t: Messages, legacy: string[] = []) {
  const current = table(t)[id]
  if (!current) return value
  const defaults = [...LOCALES.map((l) => table(messagesFor(l))[id]), ...legacy]
  return !value || defaults.includes(value) ? current : value
}

const names = (m: Messages) => m.presetDefaults as Record<string, string>

/**
 * Noms de départ d'un préréglage, dans toutes les langues et d'avant : un nom (ou une étiquette de
 * flèche) qui en fait partie n'a pas été choisi par l'utilisateur.
 */
export function defaultNamesOf(id: string): string[] {
  return [...LOCALES.map((l) => names(messagesFor(l))[id]), ...(LEGACY_DEFAULT_NAMES[id] ?? [])].filter(Boolean)
}

/** Nom affiché d'un préréglage (type d'élément ou relation). */
export function presetName(p: Preset, t: Messages): string {
  return localized(p.name, p.id, names, t, LEGACY_DEFAULT_NAMES[p.id]) ?? p.name
}

/** Étiquette écrite sur une flèche (le nom de la relation), dans la langue des messages donnés. */
export function presetLabel(p: Preset, t: Messages): string | undefined {
  return p.label === undefined ? undefined : (localized(p.label, p.id, names, t, LEGACY_DEFAULT_NAMES[p.id]) ?? p.label)
}

/** Fonction affichée d'une relation (« Objection »…). */
export function presetRole(p: Preset, t: Messages): string | undefined {
  return localized(p.role, p.id, (m) => m.presetRoles, t)
}

// Noms affichés des préréglages. Les préréglages de départ sont enregistrés avec les noms de la
// langue active à leur création : tant que l'utilisateur ne les a pas renommés, on les affiche
// dans la langue courante. Un nom personnalisé reste tel quel.

import { LOCALES, messagesFor, type Messages } from '@/i18n/config'
import type { Preset } from './presets'

function localized(value: string | undefined, id: string, table: (t: Messages) => Record<string, string>, t: Messages) {
  const current = table(t)[id]
  if (!current) return value
  const defaults = LOCALES.map((l) => table(messagesFor(l))[id])
  return !value || defaults.includes(value) ? current : value
}

/** Nom affiché d'un préréglage (type d'élément ou relation). */
export function presetName(p: Preset, t: Messages): string {
  return localized(p.name, p.id, (m) => m.presetDefaults as Record<string, string>, t) ?? p.name
}

/** Étiquette écrite sur une flèche (le nom de la relation), dans la langue des messages donnés. */
export function presetLabel(p: Preset, t: Messages): string | undefined {
  return p.label === undefined ? undefined : (localized(p.label, p.id, (m) => m.presetDefaults as Record<string, string>, t) ?? p.label)
}

/** Fonction affichée d'une relation (« Objection »…). */
export function presetRole(p: Preset, t: Messages): string | undefined {
  return localized(p.role, p.id, (m) => m.presetRoles, t)
}

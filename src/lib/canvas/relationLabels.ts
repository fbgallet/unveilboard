// Noms des relations dans la langue d'un schéma que l'app ne traduit pas (allemand, espagnol…).
// L'IA les donne dans le `vocabulary` de sa réponse, sous l'identifiant d'une relation connue
// (« supports » → « stützt ») ; le document les garde (meta.relationLabels) : ils servent
// d'étiquettes aux flèches, au vocabulaire envoyé à l'IA et à l'export JSON.

import type { Editor } from 'tldraw'
import { APP_LANGS, baseLang } from '../ai/language'
import type { MapVocabulary } from '../map/format'
import { presetById } from './presets'

const META_KEY = 'relationLabels'

/** Langue sans libellés de l'app : les relations y portent les noms donnés par l'IA. */
export const needsRelationLabels = (lang: string | undefined) => !!lang && !APP_LANGS.includes(baseLang(lang))

/** Noms gardés dans le document (id de relation → nom). */
export function documentRelationLabels(editor: Editor): Record<string, string> {
  const raw = editor.getDocumentSettings().meta[META_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string' && !!e[1].trim()))
}

/**
 * Noms à employer pour un schéma dans cette langue : ceux du document, complétés par les entrées
 * du vocabulaire reçu qui renomment une relation connue. Rien pour une langue de l'app.
 */
export function relationLabels(editor: Editor, entries: MapVocabulary[] | undefined, lang: string | undefined): Record<string, string> {
  if (!needsRelationLabels(lang)) return {}
  const received = (entries ?? []).filter((v) => v.kind === 'relation' && v.name.trim() && presetById(editor, v.id)?.target === 'arrow')
  return { ...documentRelationLabels(editor), ...Object.fromEntries(received.map((v) => [v.id, v.name.trim()])) }
}

/** Garde les noms dans le document (seulement s'ils changent). */
export function rememberRelationLabels(editor: Editor, labels: Record<string, string>) {
  const current = documentRelationLabels(editor)
  if (Object.entries(labels).every(([id, name]) => current[id] === name)) return
  const meta = editor.getDocumentSettings().meta
  editor.updateDocumentSettings({ meta: { ...meta, [META_KEY]: { ...current, ...labels } } })
}

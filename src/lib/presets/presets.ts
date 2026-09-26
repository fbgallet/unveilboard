// Préréglages : des styles tldraw nommés (couleur, remplissage, trait…), communs à tous
// les schémas. Appliquer un préréglage ne change que des propriétés tldraw ordinaires,
// plus une marque meta.preset : sans ce module, le schéma s'affiche à l'identique.

export type PresetTarget = 'shape' | 'arrow'

/** Propriétés de style reprises par un préréglage (noms des propriétés tldraw). */
export const SHAPE_STYLE_KEYS = ['color', 'fill', 'dash', 'size', 'font'] as const
export const ARROW_STYLE_KEYS = ['color', 'dash', 'size', 'arrowheadStart', 'arrowheadEnd'] as const
export type StyleKey = (typeof SHAPE_STYLE_KEYS)[number] | (typeof ARROW_STYLE_KEYS)[number]

export interface Preset {
  /** Identifiant stable, repris dans meta.preset des formes. */
  id: string
  name: string
  target: PresetTarget
  style: Partial<Record<StyleKey, string>>
  /** Flèches : étiquette posée si la flèche n'a pas encore de texte. */
  label?: string
}

export interface PresetSettings {
  version: 1
  /** Section « Préréglages » affichée dans le panneau de styles. */
  enabled: boolean
  items: Preset[]
}

export const PRESETS_SETTING_KEY = 'presets'

const shape = (id: string, name: string, style: Preset['style']): Preset => ({ id, name, target: 'shape', style })
const arrow = (id: string, name: string, style: Preset['style'], label = name): Preset => ({
  id,
  name,
  target: 'arrow',
  style: { dash: 'solid', arrowheadStart: 'none', arrowheadEnd: 'arrow', ...style },
  label,
})

/** Vocabulaire de départ, modifiable : natures des blocs et relations entre eux. */
export const DEFAULT_PRESETS: Preset[] = [
  shape('statement', 'Énoncé', { color: 'yellow', fill: 'semi', dash: 'draw' }),
  shape('concept', 'Concept', { color: 'blue', fill: 'semi', dash: 'draw' }),
  shape('question', 'Question', { color: 'violet', fill: 'semi', dash: 'draw' }),
  shape('problem', 'Difficulté', { color: 'red', fill: 'semi', dash: 'draw' }),
  shape('example', 'Exemple', { color: 'green', fill: 'semi', dash: 'draw' }),
  shape('quote', 'Citation', { color: 'grey', fill: 'none', dash: 'dashed', font: 'serif' }),
  arrow('supports', 'soutient', { color: 'green' }),
  arrow('objects', 'objecte', { color: 'red' }),
  arrow('refutes', 'réfute', { color: 'orange' }),
  arrow('presupposes', 'présuppose', { color: 'grey', dash: 'dashed' }),
  arrow('illustrates', 'illustre', { color: 'green', dash: 'dotted' }),
  arrow('answers', 'répond à', { color: 'violet' }),
  arrow('defines', 'définit', { color: 'blue', dash: 'dashed' }),
  arrow('raises', 'soulève', { color: 'red', dash: 'dashed' }),
  arrow('distinguishes', 'distingue', { color: 'black', arrowheadStart: 'bar', arrowheadEnd: 'bar' }),
  arrow('implies', 'implique', { color: 'black' }),
]

export function defaultPresetSettings(): PresetSettings {
  return { version: 1, enabled: true, items: DEFAULT_PRESETS.map((p) => ({ ...p, style: { ...p.style } })) }
}

/** Lecture tolérante d'un réglage enregistré (ou absent). */
export function normalizePresetSettings(raw: unknown): PresetSettings {
  const r = raw as Partial<PresetSettings> | null
  if (!r || !Array.isArray(r.items)) return defaultPresetSettings()
  return {
    version: 1,
    enabled: r.enabled !== false,
    items: r.items.filter((p) => p && typeof p.id === 'string' && (p.target === 'shape' || p.target === 'arrow')),
  }
}

export function newPresetId(name: string) {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'prereglage'}-${Math.random().toString(36).slice(2, 6)}`
}

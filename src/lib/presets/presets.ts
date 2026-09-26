// Préréglages : des styles tldraw nommés (géométrie, couleur, remplissage, trait…), communs
// à tous les schémas. Appliquer un préréglage ne change que des propriétés tldraw ordinaires,
// plus une marque meta.preset : sans ce module, le schéma s'affiche à l'identique (sans les
// étiquettes de nature, dessinées par l'application).

export type PresetTarget = 'shape' | 'arrow'

/** Propriétés de style reprises par un préréglage (noms des propriétés tldraw). */
export const SHAPE_STYLE_KEYS = ['geo', 'color', 'fill', 'dash', 'size', 'font'] as const
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
  /** Formes : afficher la nature au-dessus de la forme (« QUESTION », « CONCEPT · Kant »). Par défaut : oui. */
  tag?: boolean
  /**
   * Relations, dans un arbre : sens de la flèche. Vers le parent (par défaut) : « la prémisse
   * soutient la thèse » ; vers l'enfant : « la thèse présuppose… », « implique… ».
   */
  towardChild?: boolean
  /** Relations, arbre argumentatif : nature donnée à l'enfant créé avec cette relation. */
  childNature?: string
  /**
   * Relations, arbre argumentatif : fonction du nœud relié (« Objection », « Justification »),
   * affichée dans son étiquette ; le nœud prend aussi la couleur de la relation.
   */
  role?: string
}

export interface PresetSettings {
  version: 3
  /** Section « Préréglages » affichée dans le panneau de styles. */
  enabled: boolean
  /** Étiquettes de nature affichées sur le canevas. */
  showTags: boolean
  items: Preset[]
}

/** Géométries proposées pour une nature (valeurs de la propriété geo de tldraw). */
export const PRESET_GEOS = ['rectangle', 'oval', 'ellipse', 'diamond', 'hexagon', 'cloud'] as const

/** Natures dont on peut préciser la modalité (descriptive ou normative). */
export const MODAL_NATURES = ['statement', 'belief']

/** Modalité d'un énoncé (meta.modality d'une forme). */
export const MODALITIES = ['descriptive', 'prescriptive'] as const
export type Modality = (typeof MODALITIES)[number]

export const PRESETS_SETTING_KEY = 'presets'

const shape = (id: string, name: string, style: Preset['style']): Preset => ({ id, name, target: 'shape', style })
const arrow = (id: string, name: string, style: Preset['style'], tree: Pick<Preset, 'towardChild' | 'childNature' | 'role'>): Preset => ({
  id,
  name,
  target: 'arrow',
  style: { dash: 'solid', arrowheadStart: 'none', arrowheadEnd: 'arrow', ...style },
  label: name,
  ...tree,
})

/**
 * Vocabulaire de départ, modifiable, dans la langue de l'interface.
 * La nature (ce qu'est un bloc) se lit à la forme ; la fonction (ce qu'il fait dans l'argument,
 * donnée par la relation qui le relie à son parent) se lit à la couleur. Le vert est réservé au soutien.
 */
export function defaultPresets(names: Record<string, string>, roles: Record<string, string> = {}): Preset[] {
  const n = (id: string) => names[id] ?? id
  const r = (id: string) => roles[id]
  return [
    shape('statement', n('statement'), { geo: 'rectangle', color: 'yellow', fill: 'semi', dash: 'draw' }),
    shape('belief', n('belief'), { geo: 'cloud', color: 'yellow', fill: 'semi', dash: 'draw' }),
    shape('concept', n('concept'), { geo: 'oval', color: 'blue', fill: 'semi', dash: 'draw' }),
    shape('question', n('question'), { geo: 'diamond', color: 'violet', fill: 'semi', dash: 'draw' }),
    shape('problem', n('problem'), { geo: 'hexagon', color: 'red', fill: 'semi', dash: 'draw' }),
    shape('example', n('example'), { geo: 'rectangle', color: 'grey', fill: 'semi', dash: 'draw' }),
    shape('quote', n('quote'), { geo: 'rectangle', color: 'yellow', fill: 'none', dash: 'none', font: 'serif' }),
    arrow('supports', n('supports'), { color: 'green' }, { childNature: 'statement', role: r('supports') }),
    arrow('objects', n('objects'), { color: 'red' }, { childNature: 'statement', role: r('objects') }),
    arrow('refutes', n('refutes'), { color: 'orange' }, { childNature: 'statement', role: r('refutes') }),
    arrow('answers', n('answers'), { color: 'violet' }, { childNature: 'statement', role: r('answers') }),
    arrow('explains', n('explains'), { color: 'light-blue' }, { childNature: 'statement', role: r('explains') }),
    arrow('implies', n('implies'), { color: 'black' }, { towardChild: true, childNature: 'statement', role: r('implies') }),
    arrow('presupposes', n('presupposes'), { color: 'grey', dash: 'dashed' }, { towardChild: true, childNature: 'belief', role: r('presupposes') }),
    arrow('illustrates', n('illustrates'), { color: 'grey', dash: 'dotted' }, { childNature: 'example', role: r('illustrates') }),
    arrow('defines', n('defines'), { color: 'blue', dash: 'dashed' }, { childNature: 'concept', role: r('defines') }),
    arrow('raises', n('raises'), { color: 'red', dash: 'dashed' }, { towardChild: true, childNature: 'problem', role: r('raises') }),
    arrow('distinguishes', n('distinguishes'), { color: 'black', arrowheadStart: 'bar', arrowheadEnd: 'bar' }, { childNature: 'concept', role: r('distinguishes') }),
  ]
}

export function defaultPresetSettings(names: Record<string, string>, roles: Record<string, string> = {}): PresetSettings {
  return { version: 3, enabled: true, showTags: true, items: defaultPresets(names, roles) }
}

/** Couleurs de départ changées en v3 (vert réservé au soutien) : [nature, ancienne, nouvelle]. */
const V3_RECOLOR: [string, string, string][] = [
  ['example', 'green', 'grey'],
  ['illustrates', 'green', 'grey'],
  ['quote', 'grey', 'yellow'],
]

/**
 * Lecture tolérante d'un réglage enregistré (ou absent), mis au format courant sans écraser
 * ce que l'utilisateur a modifié :
 * - v1 → v2 : géométrie des natures, sens et nature d'enfant des relations de départ ;
 * - v2 → v3 : fonction des relations (« Objection »…), nouvelles couleurs de départ (si elles
 *   n'avaient pas été changées), croyance fondamentale et « explique » ajoutées.
 */
export function normalizePresetSettings(
  raw: unknown,
  names: Record<string, string>,
  roles: Record<string, string> = {}
): PresetSettings {
  const r = raw as (Partial<Omit<PresetSettings, 'version'>> & { version?: number }) | null
  if (!r || !Array.isArray(r.items)) return defaultPresetSettings(names, roles)
  const version = r.version ?? 1
  const defaults = defaultPresets(names, roles)
  const byId = new Map(defaults.map((p) => [p.id, p]))
  let items = r.items
    .filter((p) => p && typeof p.id === 'string' && (p.target === 'shape' || p.target === 'arrow'))
    .map((p) => {
      const d = byId.get(p.id)
      if (!d) return p
      let next = p
      if (version < 2) {
        const style = d.style.geo && !p.style.geo ? { geo: d.style.geo, ...p.style } : p.style
        next = { ...next, style, ...(d.target === 'arrow' && { towardChild: d.towardChild, childNature: d.childNature }) }
      }
      if (version < 3) {
        const recolor = V3_RECOLOR.find(([id, from]) => id === p.id && next.style.color === from)
        if (recolor) next = { ...next, style: { ...next.style, color: recolor[2] } }
        if (d.role && !next.role) next = { ...next, role: d.role }
      }
      return next
    })
  if (version < 3) {
    // Nouvelles natures et relations de départ, insérées après leur voisine dans la liste de départ.
    for (const id of ['belief', 'explains']) {
      if (items.some((p) => p.id === id)) continue
      const d = byId.get(id)!
      const before = defaults[defaults.indexOf(d) - 1]?.id
      const at = items.findIndex((p) => p.id === before)
      items = at >= 0 ? [...items.slice(0, at + 1), d, ...items.slice(at + 1)] : [...items, d]
    }
  }
  return { version: 3, enabled: r.enabled !== false, showTags: r.showTags !== false, items }
}

export function newPresetId(name: string) {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'preset'}-${Math.random().toString(36).slice(2, 6)}`
}

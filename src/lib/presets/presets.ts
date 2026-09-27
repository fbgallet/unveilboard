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
  /** Masqué de la palette et du choix de relation (reste utilisable dans les schémas existants). */
  hidden?: boolean
  /** Définition courte (infobulle, guide) ; absente : celle de départ, dans la langue de l'interface. */
  description?: string
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
  version: 8
  /** Section « Préréglages » affichée dans le panneau de styles. */
  enabled: boolean
  /** Étiquettes de nature affichées sur le canevas. */
  showTags: boolean
  /**
   * Vocabulaire proposé dans la palette et le choix de relation : l'essentiel (par défaut) ou tout.
   * Un clic sur « Plus… » / « Moins » bascule.
   */
  profile: 'essential' | 'complete'
  items: Preset[]
}

/** Géométries proposées pour une nature (valeurs de la propriété geo de tldraw). */
export const PRESET_GEOS = ['rectangle', 'oval', 'ellipse', 'diamond', 'hexagon', 'cloud', 'rhombus'] as const

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
 * Le type (ce qu'est un élément) se lit à la forme ; la fonction (ce qu'il fait dans l'argument,
 * donnée par la relation qui le relie à son parent) se lit à la couleur. Familles de couleurs :
 * violet les énoncés et thèses, rouge les questions, difficultés et objections, bleu les concepts
 * et distinctions, vert les arguments et preuves, orange les réponses aux objections, ambre les
 * citations et sources, gris les exemples.
 */
export function defaultPresets(names: Record<string, string>, roles: Record<string, string> = {}): Preset[] {
  const n = (id: string) => names[id] ?? id
  const r = (id: string) => roles[id]
  return [
    shape('statement', n('statement'), { geo: 'rectangle', color: 'violet', fill: 'semi', dash: 'draw' }),
    shape('belief', n('belief'), { geo: 'cloud', color: 'violet', fill: 'semi', dash: 'draw' }),
    // Fait : la base empirique d'un raisonnement ; parallélogramme, le symbole des données.
    shape('fact', n('fact'), { geo: 'rhombus', color: 'green', fill: 'semi', dash: 'draw' }),
    shape('concept', n('concept'), { geo: 'oval', color: 'blue', fill: 'semi', dash: 'draw' }),
    // Distinction : un coup de l'argument (dissiper une équivoque), de la famille des concepts.
    shape('distinction', n('distinction'), { geo: 'rectangle', color: 'blue', fill: 'semi', dash: 'dashed' }),
    shape('question', n('question'), { geo: 'diamond', color: 'red', fill: 'semi', dash: 'draw' }),
    shape('problem', n('problem'), { geo: 'hexagon', color: 'red', fill: 'semi', dash: 'draw' }),
    shape('example', n('example'), { geo: 'rectangle', color: 'grey', fill: 'semi', dash: 'draw' }),
    shape('quote', n('quote'), { geo: 'rectangle', color: 'yellow', fill: 'none', dash: 'none', font: 'serif' }),
    arrow('supports', n('supports'), { color: 'green' }, { childNature: 'statement', role: r('supports') }),
    arrow('objects', n('objects'), { color: 'red' }, { childNature: 'statement', role: r('objects') }),
    arrow('refutes', n('refutes'), { color: 'orange' }, { childNature: 'statement', role: r('refutes') }),
    arrow('answers', n('answers'), { color: 'violet' }, { childNature: 'statement', role: r('answers') }),
    arrow('explains', n('explains'), { color: 'light-blue' }, { childNature: 'statement', role: r('explains') }),
    arrow('implies', n('implies'), { color: 'black' }, { towardChild: true, childNature: 'statement', role: r('implies') }),
    arrow('presupposes', n('presupposes'), { color: 'violet', dash: 'dashed' }, { towardChild: true, childNature: 'belief', role: r('presupposes') }),
    arrow('illustrates', n('illustrates'), { color: 'grey', dash: 'dotted' }, { childNature: 'example', role: r('illustrates') }),
    arrow('defines', n('defines'), { color: 'blue', dash: 'dashed' }, { childNature: 'concept', role: r('defines') }),
    arrow('raises', n('raises'), { color: 'red', dash: 'dashed' }, { towardChild: true, childNature: 'problem', role: r('raises') }),
    // Rapports entre concepts, symétriques : différence, opposition, parenté.
    arrow('distinguishes', n('distinguishes'), { color: 'blue', arrowheadStart: 'bar', arrowheadEnd: 'bar' }, { childNature: 'concept', role: r('distinguishes') }),
    arrow('opposes', n('opposes'), { color: 'blue', arrowheadStart: 'arrow', arrowheadEnd: 'arrow' }, { childNature: 'concept', role: r('opposes') }),
    arrow('relates', n('relates'), { color: 'blue', size: 's', dash: 'dotted', arrowheadStart: 'none', arrowheadEnd: 'none' }, { childNature: 'concept', role: r('relates') }),
  ]
}

export function defaultPresetSettings(names: Record<string, string>, roles: Record<string, string> = {}): PresetSettings {
  return { version: 8, enabled: true, showTags: true, profile: 'essential', items: defaultPresets(names, roles) }
}

/** Couleurs de départ changées en v8 (familles de couleurs de l'enseignant) : [id, ancienne, nouvelle]. */
const V8_RECOLOR: [string, string, string][] = [
  ['statement', 'yellow', 'violet'],
  ['belief', 'yellow', 'violet'],
  ['fact', 'black', 'green'],
  ['question', 'violet', 'red'],
  ['presupposes', 'grey', 'violet'],
  ['distinguishes', 'black', 'blue'],
  ['opposes', 'light-red', 'blue'],
  ['relates', 'grey', 'blue'],
]

/** Couleurs de départ changées en v3 (vert réservé au soutien) : [nature, ancienne, nouvelle]. */
const V3_RECOLOR: [string, string, string][] = [
  ['example', 'green', 'grey'],
  ['illustrates', 'green', 'grey'],
  ['quote', 'grey', 'yellow'],
]

/** Anciens noms de départ de la nature « belief » (Présupposé / Assumption depuis la v5). */
const OLD_BELIEF_NAMES = ['Croyance fondamentale', 'Fundamental belief', 'Postulat']
/** Ancien nom de départ de « se distingue de » (v6). */
const OLD_DISTINGUISHES_NAMES = ['distingue']

/**
 * Lecture tolérante d'un réglage enregistré (ou absent), mis au format courant sans écraser
 * ce que l'utilisateur a modifié :
 * - v1 → v2 : géométrie des natures, sens et nature d'enfant des relations de départ ;
 * - v2 → v3 : fonction des relations (« Objection »…), nouvelles couleurs de départ (si elles
 *   n'avaient pas été changées), croyance fondamentale et « explique » ajoutées ;
 * - v3 → v4 : nature « Fait » ajoutée ;
 * - v4 → v5 : « Croyance fondamentale » ou « Postulat » devient « Présupposé » (si le nom
 *   n'avait pas été changé) ;
 * - v5 → v6 : type « Distinction », relations « s'oppose à » et « se rapproche de » ajoutés,
 *   « distingue » devient « se distingue de » ;
 * - v7 → v8 : familles de couleurs (énoncés violets, questions rouges, faits verts, relations entre
 *   concepts bleues), pour les couleurs qui n'avaient pas été changées.
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
        next = { ...next, style }
        if (d.towardChild) next = { ...next, towardChild: true }
        if (d.childNature) next = { ...next, childNature: d.childNature }
      }
      if (version < 3) {
        const recolor = V3_RECOLOR.find(([id, from]) => id === p.id && next.style.color === from)
        if (recolor) next = { ...next, style: { ...next.style, color: recolor[2] } }
        if (d.role && !next.role) next = { ...next, role: d.role }
      }
      if (version < 5 && p.id === 'belief' && OLD_BELIEF_NAMES.includes(next.name)) next = { ...next, name: d.name }
      if (version < 8) {
        // Seulement si la couleur n'avait pas été changée (et, pour la relation « se rapproche de », son trait).
        const recolor = V8_RECOLOR.find(([id, from]) => id === p.id && next.style.color === from)
        if (recolor) {
          next = { ...next, style: { ...next.style, color: recolor[2], ...(p.id === 'relates' && !next.style.dash?.match(/dash|dot/) && { dash: 'dotted' }) } }
        }
      }
      if (version < 6 && p.id === 'distinguishes' && OLD_DISTINGUISHES_NAMES.includes(next.name)) next = { ...next, name: d.name }
      return next
    })
  // Nouvelles natures et relations de départ, insérées après leur voisine dans la liste de départ.
  const added = [
    ...(version < 3 ? ['belief', 'explains'] : []),
    ...(version < 4 ? ['fact'] : []),
    ...(version < 6 ? ['distinction', 'opposes', 'relates'] : []),
  ]
  {
    for (const id of added) {
      if (items.some((p) => p.id === id)) continue
      const d = byId.get(id)!
      const before = defaults[defaults.indexOf(d) - 1]?.id
      const at = items.findIndex((p) => p.id === before)
      items = at >= 0 ? [...items.slice(0, at + 1), d, ...items.slice(at + 1)] : [...items, d]
    }
  }
  const profile = r.profile === 'complete' ? 'complete' : 'essential'
  return { version: 8, enabled: r.enabled !== false, showTags: r.showTags !== false, profile, items }
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

/**
 * Types de raisonnement : précision facultative sur une flèche (soutien, objection…),
 * inscrite dans son texte (« soutient · par analogie »).
 */
export const REASONINGS = ['deduction', 'induction', 'analogy', 'abduction', 'absurd', 'afortiori', 'authority', 'example'] as const
export type Reasoning = (typeof REASONINGS)[number]

// ---------- Profil « Essentiel » et relations selon le contexte ----------

/** Préréglages de départ proposés dans le profil « Essentiel ». */
const ESSENTIAL_IDS = new Set([
  'statement', 'question', 'concept', 'example', 'quote',
  'supports', 'objects', 'answers', 'illustrates', 'distinguishes',
])
const DEFAULT_IDS = new Set(defaultPresets({}).map((p) => p.id))

/** Dans le profil « Essentiel » : l'essentiel du départ, plus tout ce que l'utilisateur a créé. */
export function isEssential(p: Preset) {
  return ESSENTIAL_IDS.has(p.id) || !DEFAULT_IDS.has(p.id)
}

/** Préréglages proposés, selon le profil (les préréglages masqués ne le sont jamais). */
export function offeredPresets(settings: PresetSettings): Preset[] {
  return settings.items.filter((p) => !p.hidden && (settings.profile === 'complete' || isEssential(p)))
}

/**
 * Relations qui ont du sens depuis un nœud, d'après sa fonction ou son type : sous une question,
 * on répond ; sous une objection, on répond, soutient ou objecte ; sous un concept, on définit,
 * distingue, oppose ou rapproche. Les relations créées par l'utilisateur sont toujours proposées.
 */
const RELATIONS_BY_CONTEXT: Record<string, string[]> = {
  question: ['answers', 'defines', 'distinguishes', 'raises'],
  objects: ['answers', 'supports', 'objects', 'refutes', 'illustrates', 'distinguishes', 'presupposes'],
  concept: ['defines', 'distinguishes', 'opposes', 'relates', 'illustrates'],
  distinction: ['supports', 'illustrates', 'defines', 'opposes'],
  default: ['supports', 'objects', 'illustrates', 'presupposes', 'explains', 'implies', 'defines', 'raises', 'distinguishes', 'refutes', 'answers'],
}

/** Contexte d'un nœud : sa fonction (relation qui le relie à son parent) si elle en a un, sinon son type. */
export function relationsFor(context: { functionId?: string; typeId?: string }, relations: Preset[]): Preset[] {
  const key =
    (context.functionId === 'objects' && 'objects') ||
    (context.typeId && RELATIONS_BY_CONTEXT[context.typeId] && context.typeId) ||
    'default'
  // Dans l'ordre du contexte (sous une objection, « répond à » d'abord), puis celles de l'utilisateur.
  const order = RELATIONS_BY_CONTEXT[key]
  const rank = (r: Preset) => (DEFAULT_IDS.has(r.id) ? order.indexOf(r.id) : order.length)
  return relations.filter((r) => rank(r) >= 0).sort((a, b) => rank(a) - rank(b))
}

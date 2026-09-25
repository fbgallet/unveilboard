import type { Effect, Sequence, ShapeRef, Step } from './types'

export type Visibility = 'visible' | 'hidden' | 'dim'

export interface ShapeState {
  visibility: Visibility
  highlighted: boolean
  /** Effet d'entrée à jouer si l'objet apparaît à l'étape courante. */
  entering?: Effect
}

export interface ComputeOptions {
  /** Étend une liste de cibles (ex. : un cadre → ses enfants). */
  expand?: (refs: ShapeRef[]) => ShapeRef[]
  /**
   * Objets non gérés par la séquence dont la visibilité dépend d'autres objets
   * (ex. : une flèche liée à deux boîtes). Un objet dépendant est caché si l'une
   * de ses dépendances l'est, atténué si l'une l'est.
   */
  dependencies?: Map<ShapeRef, ShapeRef[]>
}

export type Stage = Map<ShapeRef, ShapeState>

const identity = (refs: ShapeRef[]) => refs

/** Ensemble des objets qui apparaissent à un moment de la séquence (donc cachés au départ). */
export function managedShapes(seq: Sequence, expand = identity): Set<ShapeRef> {
  const managed = new Set<ShapeRef>()
  for (const step of seq.steps) {
    for (const action of step.actions) {
      if (action.type === 'show') expand(action.targets).forEach((id) => managed.add(id))
    }
  }
  return managed
}

/**
 * État de chaque objet après application des étapes 0..index.
 * index = -1 : état initial, avant la première étape.
 * Les objets absents de la Map sont visibles, sans effet.
 */
export function computeStage(seq: Sequence, index: number, opts: ComputeOptions = {}): Stage {
  const expand = opts.expand ?? identity
  const stage: Stage = new Map()

  const set = (id: ShapeRef, patch: Partial<ShapeState>) => {
    const prev = stage.get(id) ?? { visibility: 'visible', highlighted: false }
    stage.set(id, { ...prev, ...patch })
  }

  for (const id of managedShapes(seq, expand)) set(id, { visibility: 'hidden' })

  const last = Math.min(index, seq.steps.length - 1)
  for (let i = 0; i <= last; i++) {
    const isCurrent = i === last
    for (const action of seq.steps[i].actions) {
      const ids = expand(action.targets)
      switch (action.type) {
        case 'show':
          ids.forEach((id) =>
            set(id, {
              visibility: 'visible',
              entering: isCurrent ? (action.effect ?? 'fade') : undefined,
            })
          )
          break
        case 'hide':
          ids.forEach((id) => set(id, { visibility: 'hidden' }))
          break
        case 'dim':
          ids.forEach((id) => set(id, { visibility: 'dim' }))
          break
        case 'undim':
          ids.forEach((id) => {
            if (stage.get(id)?.visibility === 'dim') set(id, { visibility: 'visible' })
          })
          break
        // highlight et focus sont transitoires : traités après la boucle.
      }
    }
    // Les effets d'entrée ne valent que pour l'étape courante.
    if (!isCurrent) for (const [id, s] of stage) if (s.entering) stage.set(id, { ...s, entering: undefined })
  }

  if (opts.dependencies) {
    for (const [id, deps] of opts.dependencies) {
      if (stage.has(id)) continue
      const states = deps.map((d) => stage.get(d)?.visibility ?? 'visible')
      if (states.includes('hidden')) set(id, { visibility: 'hidden' })
      else if (states.includes('dim')) set(id, { visibility: 'dim' })
      // Une flèche qui dépend d'un objet entrant entre avec lui.
      const entering = deps.map((d) => stage.get(d)?.entering).find(Boolean)
      if (entering && !states.includes('hidden')) set(id, { entering: 'fade' })
    }
  }

  if (last >= 0) applyTransient(seq.steps[last], stage, expand)
  return stage
}

function applyTransient(step: Step, stage: Stage, expand: (r: ShapeRef[]) => ShapeRef[]) {
  const focus = new Set<ShapeRef>()
  for (const action of step.actions) {
    if (action.type === 'highlight') {
      expand(action.targets).forEach((id) =>
        stage.set(id, { ...(stage.get(id) ?? { visibility: 'visible' }), highlighted: true })
      )
    }
    if (action.type === 'focus') expand(action.targets).forEach((id) => focus.add(id))
  }
  if (focus.size === 0) return
  // Focus : tout ce qui n'est pas ciblé est atténué pendant l'étape.
  for (const [id, s] of stage) {
    if (!focus.has(id) && s.visibility === 'visible') stage.set(id, { ...s, visibility: 'dim' })
  }
  stage.set(FOCUS_MARKER, { visibility: 'dim', highlighted: false })
  for (const id of focus) stage.set(id, { ...(stage.get(id) ?? { highlighted: false }), visibility: 'visible' })
}

/**
 * Clé spéciale : signale qu'un focus est actif, donc que les objets non gérés
 * (absents de la Map) doivent eux aussi être atténués.
 */
export const FOCUS_MARKER = '__focus__'

export function stateOf(stage: Stage, id: ShapeRef): ShapeState {
  const s = stage.get(id)
  if (s) return s
  return { visibility: stage.has(FOCUS_MARKER) ? 'dim' : 'visible', highlighted: false }
}

/** Objets que la caméra doit cadrer en mode « suivre » pour une étape donnée. */
export function stepFocusTargets(step: Step, expand = identity): ShapeRef[] {
  const priority = ['focus', 'show', 'highlight'] as const
  for (const type of priority) {
    const ids = step.actions.filter((a) => a.type === type).flatMap((a) => expand(a.targets))
    if (ids.length) return ids
  }
  return []
}

/**
 * Parmi des objets visibles, ceux apparus le plus récemment (étapes 0..index).
 * Sert aux calques occultants : afficher un nouveau calque remplace les précédents.
 * Un objet jamais montré par la séquence compte comme apparu avant la première étape.
 */
export function latestShown(seq: Sequence, index: number, ids: ShapeRef[], expand = identity): ShapeRef[] {
  if (!ids.length) return []
  const shownAt = new Map<ShapeRef, number>()
  const last = Math.min(index, seq.steps.length - 1)
  for (let i = 0; i <= last; i++) {
    for (const action of seq.steps[i].actions) {
      if (action.type === 'show') expand(action.targets).forEach((id) => shownAt.set(id, i))
    }
  }
  const rank = (id: ShapeRef) => shownAt.get(id) ?? -1
  const top = Math.max(...ids.map(rank))
  return ids.filter((id) => rank(id) === top)
}

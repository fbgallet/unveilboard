import type { Effect, Sequence, ShapeRef, Step, StepActionType } from './types'

export type Visibility = 'visible' | 'hidden' | 'dim'

export interface ShapeState {
  visibility: Visibility
  highlighted: boolean
  /** Effet d'entrée à jouer si l'objet apparaît à l'étape courante. */
  entering?: Effect
  /** Nœud d'arbre dont la branche est repliée. */
  folded?: boolean
  /** Caché seulement parce qu'un ancêtre est replié (le déplier le montrerait). */
  foldHidden?: boolean
  /** Entrée provoquée par un dépliage à la main pendant la présentation, pas par l'étape. */
  live?: boolean
}

export interface ComputeOptions {
  /** Résout une liste de cibles (ex. : un cadre → ses enfants). */
  resolve?: (refs: ShapeRef[]) => ShapeRef[]
  /**
   * Objets dont la visibilité dépend d'autres objets (ex. : une flèche liée à deux boîtes).
   * Un objet dépendant est caché si l'une de ses dépendances l'est ; s'il n'est pas géré
   * par la séquence, il est aussi atténué si l'une l'est.
   */
  dependencies?: Map<ShapeRef, ShapeRef[]>
  /** Arbres : parent de chaque nœud. Un nœud est caché si un ancêtre est caché ou replié. */
  tree?: Map<ShapeRef, ShapeRef>
  /** Nœuds repliés dans le document (état de départ, modifié par fold / unfold). */
  folded?: Set<ShapeRef>
  /**
   * Replis et dépliages faits à la main pendant la présentation (nœud → replié), appliqués
   * après les étapes. Un dépliage ne montre que ce que la séquence a déjà révélé.
   */
  foldOverrides?: Map<ShapeRef, boolean>
  /** Nœuds dépliés à la main pendant l'étape courante : leurs descendants entrent en fondu. */
  liveUnfolds?: Set<ShapeRef>
}

export type Stage = Map<ShapeRef, ShapeState>

const identity = (refs: ShapeRef[]) => refs

/** Ensemble des objets qui apparaissent à un moment de la séquence (donc cachés au départ). */
export function managedShapes(seq: Sequence, resolve = identity): Set<ShapeRef> {
  const managed = new Set<ShapeRef>()
  for (const step of seq.steps) {
    for (const action of step.actions) {
      if (action.type === 'show') resolve(action.targets).forEach((id) => managed.add(id))
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
  const resolve = opts.resolve ?? identity
  const stage: Stage = new Map()

  const set = (id: ShapeRef, patch: Partial<ShapeState>) => {
    const prev = stage.get(id) ?? { visibility: 'visible', highlighted: false }
    stage.set(id, { ...prev, ...patch })
  }

  const managed = managedShapes(seq, resolve)
  for (const id of managed) set(id, { visibility: 'hidden' })
  const folded = new Set(opts.folded)
  /** Nœuds dépliés à l'étape courante : leurs descendants entrent en fondu. */
  const unfoldedNow = new Set<ShapeRef>()

  const last = Math.min(index, seq.steps.length - 1)
  for (let i = 0; i <= last; i++) {
    const isCurrent = i === last
    for (const action of seq.steps[i].actions) {
      const ids = resolve(action.targets)
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
        case 'fold':
          ids.forEach((id) => folded.add(id))
          break
        case 'unfold':
          ids.forEach((id) => {
            if (folded.delete(id) && isCurrent) unfoldedNow.add(id)
          })
          break
        // highlight et focus sont transitoires : traités après la boucle ; note n'a pas d'effet visuel.
      }
    }
    // Les effets d'entrée ne valent que pour l'étape courante.
    if (!isCurrent) for (const [id, s] of stage) if (s.entering) stage.set(id, { ...s, entering: undefined })
  }

  const liveNow = new Set<ShapeRef>()
  for (const [id, fold] of opts.foldOverrides ?? []) {
    if (fold) folded.add(id)
    else if (folded.delete(id) && opts.liveUnfolds?.has(id)) liveNow.add(id)
  }

  if (opts.tree) applyTree(stage, opts.tree, folded, unfoldedNow, liveNow, managed)

  if (opts.dependencies) {
    for (const [id, deps] of opts.dependencies) {
      const own = stage.get(id)
      const states = deps.map((d) => stage.get(d)?.visibility ?? 'visible')
      if (states.includes('hidden')) {
        set(id, { visibility: 'hidden', entering: undefined })
        continue
      }
      if (own?.visibility === 'hidden') continue
      if (!own && states.includes('dim')) set(id, { visibility: 'dim' })
      // Une flèche qui dépend d'un objet entrant entre avec lui.
      const entering = deps.map((d) => stage.get(d)?.entering).find(Boolean)
      if (entering && !own?.entering) set(id, { entering: 'fade', live: deps.some((d) => stage.get(d)?.live) })
    }
  }

  if (last >= 0) applyTransient(seq.steps[last], stage, resolve)
  return stage
}

/**
 * Contrainte de parenté : un nœud est caché si un ancêtre est caché ou replié.
 * Un nœud non géré par la séquence apparaît avec son parent (même effet) ;
 * les nœuds révélés par un dépliage à l'étape courante (ou à la main) entrent en fondu.
 */
function applyTree(
  stage: Stage,
  parent: Map<ShapeRef, ShapeRef>,
  folded: Set<ShapeRef>,
  unfoldedNow: Set<ShapeRef>,
  liveNow: Set<ShapeRef>,
  managed: Set<ShapeRef>
) {
  const done = new Set<ShapeRef>()
  const visit = (id: ShapeRef, trail: Set<ShapeRef>) => {
    if (done.has(id) || trail.has(id)) return
    trail.add(id)
    const p = parent.get(id)
    if (p) {
      visit(p, trail)
      const ps = stage.get(p)
      const own = stage.get(id) ?? { visibility: 'visible' as const, highlighted: false }
      if (ps?.visibility === 'hidden' || folded.has(p)) {
        const foldHidden = own.visibility !== 'hidden' && (folded.has(p) || !!ps?.foldHidden)
        stage.set(id, { ...own, visibility: 'hidden', entering: undefined, foldHidden })
      } else if (own.visibility !== 'hidden' && !own.entering) {
        const inherited = !managed.has(id) && ps?.entering
        const entering = inherited ? ps.entering : unfoldedNow.has(p) || liveNow.has(p) ? 'fade' : undefined
        const live = inherited ? ps.live : liveNow.has(p)
        if (entering) stage.set(id, { ...own, entering, live })
      }
    }
    done.add(id)
  }
  for (const id of parent.keys()) visit(id, new Set())
  for (const id of folded) {
    const s = stage.get(id)
    stage.set(id, { ...(s ?? { visibility: 'visible', highlighted: false }), folded: true })
  }
}

function applyTransient(step: Step, stage: Stage, resolve: (r: ShapeRef[]) => ShapeRef[]) {
  const focus = new Set<ShapeRef>()
  for (const action of step.actions) {
    if (action.type === 'highlight') {
      resolve(action.targets).forEach((id) =>
        stage.set(id, { ...(stage.get(id) ?? { visibility: 'visible' }), highlighted: true })
      )
    }
    if (action.type === 'focus') resolve(action.targets).forEach((id) => focus.add(id))
  }
  if (focus.size === 0) return
  // Focus : tout ce qui n'est pas ciblé est atténué pendant l'étape.
  for (const [id, s] of stage) {
    if (!focus.has(id) && s.visibility === 'visible') stage.set(id, { ...s, visibility: 'dim' })
  }
  stage.set(FOCUS_MARKER, { visibility: 'dim', highlighted: false })
  // Un focus ne révèle pas un objet caché (ex. : dans une branche repliée).
  for (const id of focus) {
    const s = stage.get(id) ?? { visibility: 'visible' as const, highlighted: false }
    if (s.visibility !== 'hidden') stage.set(id, { ...s, visibility: 'visible' })
  }
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

/**
 * Objets que la caméra doit cadrer en mode « suivre » pour une étape donnée :
 * les cibles de l'action prioritaire, et (sauf focus) tout ce qui entre à cette étape,
 * par exemple les nœuds qui apparaissent avec leur parent ou qu'un dépliage révèle.
 */
export function stepFocusTargets(step: Step, resolve = identity, stage?: Stage): ShapeRef[] {
  const targets = (type: StepActionType) => step.actions.filter((a) => a.type === type).flatMap((a) => resolve(a.targets))
  const focus = targets('focus')
  if (focus.length) return focus
  const entering = stage ? [...stage].filter(([, s]) => s.entering && s.visibility !== 'hidden').map(([id]) => id) : []
  for (const type of ['show', 'unfold', 'note', 'highlight'] as const) {
    const ids = targets(type)
    if (ids.length) return [...new Set([...ids, ...entering])]
  }
  return entering
}

/**
 * Parmi des objets visibles, ceux apparus le plus récemment (étapes 0..index).
 * Sert aux calques occultants : afficher un nouveau calque remplace les précédents.
 * Un objet jamais montré par la séquence compte comme apparu avant la première étape.
 */
export function latestShown(seq: Sequence, index: number, ids: ShapeRef[], resolve = identity): ShapeRef[] {
  if (!ids.length) return []
  const shownAt = new Map<ShapeRef, number>()
  const last = Math.min(index, seq.steps.length - 1)
  for (let i = 0; i <= last; i++) {
    for (const action of seq.steps[i].actions) {
      if (action.type === 'show') resolve(action.targets).forEach((id) => shownAt.set(id, i))
    }
  }
  const rank = (id: ShapeRef) => shownAt.get(id) ?? -1
  const top = Math.max(...ids.map(rank))
  return ids.filter((id) => rank(id) === top)
}

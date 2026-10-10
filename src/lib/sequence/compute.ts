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
  /** Légèrement atténué : hors de l'étape courante (mode « tour », ou vue « tout »). */
  muted?: boolean
}

/**
 * Affichage choisi pendant la présentation, par-dessus la séquence : « all », tout le schéma
 * (l'étape courante mise en valeur) ; « step », seulement les objets de l'étape courante.
 */
export type StageView = 'sequence' | 'all' | 'step'

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
  /** Affichage par-dessus la séquence (par défaut : la séquence). */
  view?: StageView
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

  // Mode « tour » : rien n'est caché au départ ; « show » désigne ce que l'étape montre (et cadre).
  const tour = seq.mode === 'tour'
  const managed = managedShapes(seq, resolve)
  if (!tour) for (const id of managed) set(id, { visibility: 'hidden' })
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
          ids.forEach((id) => {
            // En « tour », un objet déjà visible n'a pas d'effet d'entrée (seul un objet caché par une étape réapparaît).
            const appears = !tour || stage.get(id)?.visibility === 'hidden'
            set(id, {
              visibility: 'visible',
              entering: isCurrent && appears ? (action.effect ?? 'fade') : undefined,
            })
          })
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

  const view = opts.view ?? 'sequence'
  const step = last >= 0 ? seq.steps[last] : undefined
  if (view === 'all') revealAll(stage)
  if (view === 'step') {
    if (step) isolateStep(stage, stepFocusTargets(step, resolve, stage), opts.dependencies)
  } else if (step && !stage.has(FOCUS_MARKER) && (view === 'all' || (tour && seq.tourMute !== false))) {
    muteOthers(stage, stepFocusTargets(step, resolve, stage), opts.dependencies)
  }
  return stage
}

/** Vue « tout » : ce que la séquence cache encore apparaît (sans effet) ; les branches repliées le restent. */
function revealAll(stage: Stage) {
  for (const [id, s] of stage) {
    if (s.visibility === 'hidden' && !s.foldHidden) stage.set(id, { ...s, visibility: 'visible', entering: undefined })
  }
}

/** Les objets de l'étape restent nets, le reste est légèrement atténué (une flèche suit ses extrémités). */
function muteOthers(stage: Stage, targets: ShapeRef[], dependencies?: Map<ShapeRef, ShapeRef[]>) {
  const keep = withLinkedArrows(targets, dependencies)
  if (!keep.size) return
  for (const [id, s] of stage) if (!keep.has(id) && s.visibility !== 'hidden') stage.set(id, { ...s, muted: true })
  for (const id of keep) if (stage.get(id)?.muted) stage.set(id, { ...stage.get(id)!, muted: false })
  // Les objets absents de la Map (non gérés) sont atténués aussi, sauf ceux de l'étape.
  stage.set(MUTE_MARKER, { visibility: 'visible', highlighted: false })
  for (const id of keep) if (!stage.has(id)) stage.set(id, { visibility: 'visible', highlighted: false })
}

/** Vue « étape seule » : seuls les objets de l'étape restent visibles, et les flèches entre eux. */
function isolateStep(stage: Stage, targets: ShapeRef[], dependencies?: Map<ShapeRef, ShapeRef[]>) {
  const keep = withLinkedArrows(targets, dependencies)
  for (const [id, s] of stage) if (!keep.has(id)) stage.set(id, { ...s, visibility: 'hidden', entering: undefined })
  stage.set(HIDE_MARKER, { visibility: 'hidden', highlighted: false })
  for (const id of keep) {
    const s = stage.get(id)
    if (!s) stage.set(id, { visibility: 'visible', highlighted: false })
    else if (s.visibility === 'hidden' && !s.foldHidden) stage.set(id, { ...s, visibility: 'visible' })
  }
  // Une flèche dont une extrémité n'est plus visible disparaît.
  for (const [id, deps] of dependencies ?? []) {
    if (keep.has(id) && deps.some((d) => !keep.has(d))) stage.set(id, { ...(stage.get(id) as ShapeState), visibility: 'hidden' })
  }
}

/** Objets de l'étape, et les flèches dont toutes les extrémités en font partie. */
function withLinkedArrows(targets: ShapeRef[], dependencies?: Map<ShapeRef, ShapeRef[]>): Set<ShapeRef> {
  const keep = new Set(targets)
  for (const [id, deps] of dependencies ?? []) if (deps.length && deps.every((d) => keep.has(d))) keep.add(id)
  return keep
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
        // Le parent doit lui-même pouvoir apparaître : visible, ou caché seulement par un repli.
        const foldHidden = own.visibility !== 'hidden' && (!!ps?.foldHidden || (folded.has(p) && ps?.visibility !== 'hidden'))
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
/** Clés spéciales : les objets absents de la Map sont atténués légèrement (MUTE), ou cachés (HIDE). */
export const MUTE_MARKER = '__mute__'
export const HIDE_MARKER = '__hide__'

export function stateOf(stage: Stage, id: ShapeRef): ShapeState {
  const s = stage.get(id)
  if (s) return s
  if (stage.has(HIDE_MARKER)) return { visibility: 'hidden', highlighted: false }
  return { visibility: stage.has(FOCUS_MARKER) ? 'dim' : 'visible', highlighted: false, ...(stage.has(MUTE_MARKER) && { muted: true }) }
}

/**
 * Étapes qui concernent un objet (il y apparaît, ou elles le surlignent, le mettent au point ou
 * montrent sa note), dans l'ordre. Sert à aller à l'étape d'un objet cliqué.
 */
export function stepsOf(seq: Sequence, id: ShapeRef, resolve = identity): number[] {
  const kinds: StepActionType[] = ['show', 'highlight', 'focus', 'note']
  return seq.steps.flatMap((step, i) => (step.actions.some((a) => kinds.includes(a.type) && resolve(a.targets).includes(id)) ? [i] : []))
}

/** Étape où aller en cliquant un objet : aucune s'il est de l'étape courante, sinon la suivante qui le concerne, ou la première. */
export function stepToJump(seq: Sequence, index: number, id: ShapeRef, resolve = identity): number | null {
  const steps = stepsOf(seq, id, resolve)
  if (!steps.length || steps.includes(index)) return null
  return steps.find((i) => i > index) ?? steps[0]
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

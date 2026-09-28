// Séquence : conversion entre les étapes du format (éléments désignés par leur identifiant court)
// et celles du moteur (formes). Données pures, sans tldraw.
//
// Dans le format, un élément désigne sa boîte et la flèche qui le relie à son parent : « montrer
// l'objection » fait apparaître les deux (la boîte monte, la flèche se trace). `part` restreint
// l'action à l'une des deux.

import type { Effect, ShapeRef, Step, StepAction, StepCamera } from '../sequence/types'
import { NODE_ONLY_ACTIONS, type MapAction, type MapStep } from './format'

/** Formes désignées par un identifiant du format. */
export interface RefShapes {
  kind: 'element' | 'link' | 'other'
  /** La forme (la boîte, pour un élément). */
  node: ShapeRef
  /** Éléments : flèche qui relie la boîte à son parent. */
  edge?: ShapeRef
}

/** Effet d'entrée par défaut : la boîte monte (fondu pour une racine), une flèche se trace. */
function defaultEffect(shapes: RefShapes, part: 'node' | 'edge'): Effect {
  if (part === 'edge' || shapes.kind === 'link') return 'draw'
  if (shapes.kind === 'other') return 'fade'
  return shapes.edge ? 'rise' : 'fade'
}

function cameraOf(camera: MapStep['camera']): StepCamera {
  if (!camera) return { mode: 'follow' }
  // Une zone sans rectangle n'a rien à cadrer : on suit l'étape.
  if (typeof camera === 'string') return { mode: camera === 'area' ? 'follow' : camera }
  return camera.mode === 'area' && !camera.area ? { ...camera, mode: 'follow' } : { ...camera }
}

/** Étapes du format → étapes du moteur. Les identifiants inconnus sont ignorés. */
export function toEngineSteps(steps: MapStep[], shapesOf: (ref: string) => RefShapes | undefined, newStepId: () => string): Step[] {
  return steps.map((step) => ({
    id: newStepId(),
    title: step.title,
    narration: step.narration ?? '',
    camera: cameraOf(step.camera),
    actions: step.actions.flatMap((a) => toEngineActions(a, shapesOf)),
  }))
}

function toEngineActions(action: MapAction, shapesOf: (ref: string) => RefShapes | undefined): StepAction[] {
  const nodeOnly = NODE_ONLY_ACTIONS.includes(action.do)
  const resolved = action.targets.map(shapesOf).filter((s): s is RefShapes => !!s)
  const partsOf = (s: RefShapes): { shape: ShapeRef; part: 'node' | 'edge' }[] => {
    if (nodeOnly || s.kind !== 'element') return [{ shape: s.node, part: 'node' }]
    if (action.part === 'node') return [{ shape: s.node, part: 'node' }]
    if (action.part === 'edge') return s.edge ? [{ shape: s.edge, part: 'edge' }] : []
    return [{ shape: s.node, part: 'node' }, ...(s.edge ? [{ shape: s.edge, part: 'edge' as const }] : [])]
  }

  if (action.do !== 'show') {
    const targets = resolved.flatMap((s) => partsOf(s).map((p) => p.shape))
    return targets.length ? [{ type: action.do, targets } as StepAction] : []
  }
  // Montrer : une action par effet, dans l'ordre (les boîtes, puis les flèches qui s'y rattachent).
  const byEffect = new Map<Effect, ShapeRef[]>()
  for (const s of resolved) {
    for (const p of partsOf(s)) {
      const effect = action.effect ?? defaultEffect(s, p.part)
      byEffect.set(effect, [...(byEffect.get(effect) ?? []), p.shape])
    }
  }
  return [...byEffect].map(([effect, targets]) => ({ type: 'show', targets, effect }))
}

/** Propriétaire d'une forme : l'identifiant du format, et la partie de l'élément qu'elle est. */
export interface ShapeOwner {
  ref: string
  part: 'node' | 'edge'
}

/**
 * Étapes du moteur → étapes du format. Les formes inconnues sont ignorées. Une boîte et sa flèche
 * visées ensemble deviennent l'élément ; montrées avec leurs effets par défaut, elles se résument à
 * `{ do: 'show', targets: [...] }`.
 */
export function fromEngineSteps(
  steps: Step[],
  ownerOf: (shape: ShapeRef) => ShapeOwner | undefined,
  shapesOf: (ref: string) => RefShapes | undefined
): MapStep[] {
  return steps.map((step) => {
    const camera = step.camera ?? { mode: 'follow' }
    const plainCamera = camera.padding === undefined && camera.maxZoom === undefined && camera.area === undefined
    return {
      title: step.title,
      ...(step.narration && { narration: step.narration }),
      ...(camera.mode !== 'follow' || !plainCamera ? { camera: plainCamera ? camera.mode : { ...camera } } : {}),
      actions: fromEngineActions(step.actions, ownerOf, shapesOf),
    }
  })
}

interface Entry {
  ref: string
  part?: 'node' | 'edge'
  effect?: Effect
}

function fromEngineActions(
  actions: StepAction[],
  ownerOf: (shape: ShapeRef) => ShapeOwner | undefined,
  shapesOf: (ref: string) => RefShapes | undefined
): MapAction[] {
  // 1. Chaque action du moteur : ses cibles, regroupées par élément.
  const converted = actions.map((action) => {
    const parts = new Map<string, Set<'node' | 'edge'>>()
    for (const shape of action.targets) {
      const owner = ownerOf(shape)
      if (!owner) continue
      parts.set(owner.ref, (parts.get(owner.ref) ?? new Set()).add(owner.part))
    }
    const nodeOnly = NODE_ONLY_ACTIONS.includes(action.type)
    const effect = action.type === 'show' ? (action.effect ?? 'fade') : undefined
    const entries: Entry[] = []
    for (const [ref, set] of parts) {
      const shapes = shapesOf(ref)
      if (!shapes) continue
      const whole = nodeOnly || shapes.kind !== 'element' || !shapes.edge || (set.has('node') && set.has('edge'))
      entries.push({ ref, part: whole ? undefined : set.has('node') ? 'node' : 'edge', effect })
    }
    return { type: action.type, entries }
  })

  // 2. Montrer avec les effets par défaut (la boîte et sa flèche, éventuellement en deux actions) :
  //    la forme courte, sans effet ni partie.
  const shown = new Map<string, { node?: Effect; edge?: Effect }>()
  for (const a of converted) {
    if (a.type !== 'show') continue
    for (const e of a.entries) {
      const s = shown.get(e.ref) ?? {}
      if (e.part !== 'edge') s.node = e.effect
      if (e.part !== 'node') s.edge = e.effect
      shown.set(e.ref, s)
    }
  }
  const plain = new Set<string>()
  for (const [ref, s] of shown) {
    const shapes = shapesOf(ref)!
    const nodeOk = s.node === defaultEffect(shapes, 'node')
    const edgeOk = shapes.kind !== 'element' || !shapes.edge || s.edge === defaultEffect(shapes, 'edge')
    if (nodeOk && edgeOk) plain.add(ref)
  }

  // 3. Actions du format : la forme courte à la place de la première action « montrer », puis le reste.
  const out: MapAction[] = []
  let plainDone = false
  for (const a of converted) {
    if (a.type === 'show' && !plainDone && plain.size) {
      out.push({ do: 'show', targets: [...plain] })
      plainDone = true
    }
    const rest = a.type === 'show' ? a.entries.filter((e) => !plain.has(e.ref)) : a.entries
    const groups = new Map<string, Entry[]>()
    for (const e of rest) {
      const key = `${e.part ?? ''}|${e.effect ?? ''}`
      groups.set(key, [...(groups.get(key) ?? []), e])
    }
    for (const entries of groups.values()) {
      const { part, effect } = entries[0]
      out.push({
        do: a.type,
        targets: [...new Set(entries.map((e) => e.ref))],
        ...(effect && { effect }),
        ...(part && { part }),
      })
    }
  }
  return out
}

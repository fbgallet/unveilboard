// Opérations d'édition pures sur une séquence (renvoient une nouvelle séquence).

import { newId, type Sequence, type ShapeRef, type Step, type StepActionType } from './types'

/** Insère une étape à la position `at` (0 = au début ; par défaut, à la fin). */
export function addStep(seq: Sequence, at: number = seq.steps.length, init: Partial<Step> = {}): [Sequence, Step] {
  const step: Step = {
    id: newId('st'),
    title: `Step ${seq.steps.length + 1}`,
    actions: [],
    camera: { mode: 'follow' },
    narration: '',
    ...init,
  }
  const steps = [...seq.steps]
  steps.splice(Math.max(0, Math.min(at, steps.length)), 0, step)
  return [withoutDuplicateShows({ ...seq, steps }, step.id, init.actions), step]
}

export function updateStep(seq: Sequence, stepId: string, patch: Partial<Step>): Sequence {
  return { ...seq, steps: seq.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)) }
}

export function removeStep(seq: Sequence, stepId: string): Sequence {
  return { ...seq, steps: seq.steps.filter((s) => s.id !== stepId) }
}

export function moveStep(seq: Sequence, stepId: string, delta: -1 | 1): Sequence {
  const i = seq.steps.findIndex((s) => s.id === stepId)
  const j = i + delta
  if (i < 0 || j < 0 || j >= seq.steps.length) return seq
  const steps = [...seq.steps]
  ;[steps[i], steps[j]] = [steps[j], steps[i]]
  return { ...seq, steps }
}

/** Ajoute des objets à l'action de ce type dans l'étape (en la créant au besoin). */
export function addTargets(seq: Sequence, stepId: string, type: StepActionType, ids: ShapeRef[]): Sequence {
  const next = {
    ...seq,
    steps: seq.steps.map((step) => {
      if (step.id !== stepId) return step
      const existing = step.actions.findIndex((a) => a.type === type)
      if (existing === -1) {
        const action = type === 'show' ? { type, targets: ids, effect: 'fade' as const } : { type, targets: ids }
        return { ...step, actions: [...step.actions, action] }
      }
      const actions = step.actions.map((a, i) =>
        i === existing ? { ...a, targets: [...new Set([...a.targets, ...ids])] } : a
      )
      return { ...step, actions }
    }),
  }
  return type === 'show' ? withoutDuplicateShows(next, stepId, [{ type: 'show', targets: ids }]) : next
}

export function removeAction(seq: Sequence, stepId: string, actionIndex: number): Sequence {
  return {
    ...seq,
    steps: seq.steps.map((s) =>
      s.id === stepId ? { ...s, actions: s.actions.filter((_, i) => i !== actionIndex) } : s
    ),
  }
}

export function updateAction(
  seq: Sequence,
  stepId: string,
  actionIndex: number,
  patch: Record<string, unknown>
): Sequence {
  return {
    ...seq,
    steps: seq.steps.map((s) =>
      s.id === stepId
        ? { ...s, actions: s.actions.map((a, i) => (i === actionIndex ? ({ ...a, ...patch } as typeof a) : a)) }
        : s
    ),
  }
}

/** Un objet n'apparaît qu'une fois : on le retire des « show » des autres étapes. */
function withoutDuplicateShows(seq: Sequence, keepStepId: string, actions: Step['actions'] = []): Sequence {
  const shown = new Set(actions.filter((a) => a.type === 'show').flatMap((a) => a.targets))
  if (shown.size === 0) return seq
  return {
    ...seq,
    steps: seq.steps.map((step) =>
      step.id === keepStepId
        ? step
        : {
            ...step,
            actions: step.actions
              .map((a) => (a.type === 'show' ? { ...a, targets: a.targets.filter((t) => !shown.has(t)) } : a))
              .filter((a) => a.targets.length > 0),
          }
    ),
  }
}

/** Numéro (1-based) de l'étape où chaque objet apparaît. */
export function appearanceIndex(seq: Sequence): Map<ShapeRef, number> {
  const map = new Map<ShapeRef, number>()
  seq.steps.forEach((step, i) => {
    for (const a of step.actions) if (a.type === 'show') a.targets.forEach((t) => map.set(t, i + 1))
  })
  return map
}

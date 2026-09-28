import { describe, expect, it } from 'vitest'
import { addTargets, appearanceIndex, appearances, removeTargets, stepUses } from './edit'
import type { Sequence, Step, StepAction } from './types'

let n = 0
const step = (...actions: StepAction[]): Step => ({ id: `st${n++}`, title: '', actions, camera: { mode: 'follow' }, narration: '' })
const seq = (...steps: Step[]): Sequence => ({ id: 'seq', title: '', steps })

describe('addTargets (show)', () => {
  it("déplace l'apparition d'un objet resté visible", () => {
    const s = seq(step({ type: 'show', targets: ['a'] }), step(), step())
    const next = addTargets(s, s.steps[2].id, 'show', ['a'])
    expect(appearances(next).get('a')).toEqual([3])
  })

  it('garde une apparition précédente quand un « cacher » la sépare : l’objet réapparaît', () => {
    const s = seq(step({ type: 'show', targets: ['a'] }), step({ type: 'hide', targets: ['a'] }), step())
    const next = addTargets(s, s.steps[2].id, 'show', ['a'])
    expect(appearances(next).get('a')).toEqual([1, 3])
    expect(appearanceIndex(next).get('a')).toBe(1)
  })

  it('laisse un objet visé par d’autres actions dans plusieurs étapes', () => {
    const s = seq(step({ type: 'show', targets: ['a'] }), step())
    const next = addTargets(s, s.steps[1].id, 'highlight', ['a'])
    expect(stepUses(next).get('a')).toEqual([1, 2])
  })
})

describe('removeTargets', () => {
  it('retire les objets de l’étape et supprime les actions vidées', () => {
    const s = seq(step({ type: 'show', targets: ['a', 'b'] }, { type: 'focus', targets: ['a'] }))
    const next = removeTargets(s, s.steps[0].id, ['a'])
    expect(next.steps[0].actions).toEqual([{ type: 'show', targets: ['b'] }])
  })
})

import { describe, expect, it } from 'vitest'
import { computeStage, stateOf } from './compute'
import { migrateSequence } from './migrate'
import { SEQUENCE_VERSION, type Sequence, type Step, type StepAction } from './types'

const step = (...actions: StepAction[]): Step => ({
  id: Math.random().toString(36),
  title: '',
  actions,
  camera: { mode: 'follow' },
  narration: '',
})

const seq = (...steps: Step[]): Sequence => ({ id: 'seq', title: '', steps })

const vis = (s: Sequence, index: number, id: string, opts = {}) =>
  stateOf(computeStage(s, index, opts), id).visibility

describe('computeStage', () => {
  const s = seq(
    step({ type: 'show', targets: ['a'] }),
    step({ type: 'show', targets: ['b'] }, { type: 'dim', targets: ['a'] }),
    step({ type: 'undim', targets: ['a'] }, { type: 'hide', targets: ['b'] })
  )

  it('cache au départ les objets qui apparaissent plus tard', () => {
    expect(vis(s, -1, 'a')).toBe('hidden')
    expect(vis(s, -1, 'libre')).toBe('visible')
  })

  it('applique les actions persistantes étape par étape', () => {
    expect(vis(s, 0, 'a')).toBe('visible')
    expect(vis(s, 0, 'b')).toBe('hidden')
    expect(vis(s, 1, 'a')).toBe('dim')
    expect(vis(s, 2, 'a')).toBe('visible')
    expect(vis(s, 2, 'b')).toBe('hidden')
  })

  it("ne joue l'effet d'entrée qu'à l'étape courante", () => {
    expect(computeStage(s, 0).get('a')?.entering).toBe('fade')
    expect(computeStage(s, 1).get('a')?.entering).toBeUndefined()
  })

  it('atténue tout le reste pendant un focus, objets non gérés compris', () => {
    const f = seq(step({ type: 'show', targets: ['a', 'b'] }), step({ type: 'focus', targets: ['a'] }))
    expect(vis(f, 1, 'a')).toBe('visible')
    expect(vis(f, 1, 'b')).toBe('dim')
    expect(vis(f, 1, 'libre')).toBe('dim')
  })

  it('une flèche non gérée suit ses extrémités', () => {
    const dependencies = new Map([['fleche', ['a', 'b']]])
    expect(vis(s, 0, 'fleche', { dependencies })).toBe('hidden')
    expect(vis(s, 1, 'fleche', { dependencies })).toBe('dim')
  })

  it('résout les cibles (un cadre entraîne ses enfants)', () => {
    const resolve = (refs: string[]) => refs.flatMap((r) => (r === 'cadre' ? ['cadre', 'enfant'] : [r]))
    const c = seq(step({ type: 'show', targets: ['cadre'] }))
    expect(vis(c, -1, 'enfant', { resolve })).toBe('hidden')
    expect(vis(c, 0, 'enfant', { resolve })).toBe('visible')
  })
})

describe('migrateSequence', () => {
  it("laisse intacte une séquence à jour (même objet, pour les calculs réactifs)", () => {
    const s = { ...seq(), version: SEQUENCE_VERSION }
    expect(migrateSequence(s)).toBe(s)
  })
})

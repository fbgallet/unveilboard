import { describe, expect, it } from 'vitest'
import { computeStage, stateOf, stepFocusTargets, stepToJump, stepsOf } from './compute'
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

describe('arbres : contrainte de parenté, fold / unfold', () => {
  // racine → a → a1 ; racine → b ; la flèche e relie racine et a.
  const tree = new Map([
    ['a', 'racine'],
    ['a1', 'a'],
    ['b', 'racine'],
  ])
  const dependencies = new Map([['e', ['racine', 'a']]])
  const s = seq(
    step({ type: 'show', targets: ['racine'] }),
    step({ type: 'show', targets: ['b'] }),
    step({ type: 'fold', targets: ['a'] }),
    step({ type: 'unfold', targets: ['a'] })
  )
  const at = (i: number, id: string, folded?: Set<string>) =>
    stateOf(computeStage(s, i, { tree, dependencies, folded }), id)

  it('un nœud non géré apparaît avec son parent, avec le même effet', () => {
    expect(at(-1, 'a').visibility).toBe('hidden')
    expect(at(-1, 'a1').visibility).toBe('hidden')
    expect(at(0, 'a1')).toMatchObject({ visibility: 'visible', entering: 'fade' })
    expect(at(0, 'e')).toMatchObject({ visibility: 'visible', entering: 'fade' })
  })

  it("un nœud géré attend sa propre étape, même si son parent est visible", () => {
    expect(at(0, 'b').visibility).toBe('hidden')
    expect(at(1, 'b').visibility).toBe('visible')
  })

  it('replier cache toute la branche, et les flèches qui y mènent', () => {
    expect(at(2, 'a').visibility).toBe('visible')
    expect(at(2, 'a')).toMatchObject({ folded: true })
    expect(at(2, 'a1').visibility).toBe('hidden')
    expect(at(2, 'b').visibility).toBe('visible')
  })

  it('déplier révèle la branche en fondu', () => {
    expect(at(3, 'a1')).toMatchObject({ visibility: 'visible', entering: 'fade' })
  })

  it("l'état replié du document est l'état de départ", () => {
    const folded = new Set(['racine'])
    expect(at(0, 'racine', folded).visibility).toBe('visible')
    expect(at(0, 'a', folded).visibility).toBe('hidden')
    expect(at(0, 'e', folded).visibility).toBe('hidden')
  })

  it('la caméra cadre aussi ce qui entre avec les cibles (enfants, branche dépliée)', () => {
    const t = (i: number) => stepFocusTargets(s.steps[i], undefined, computeStage(s, i, { tree, dependencies })).sort()
    expect(t(0)).toEqual(['a', 'a1', 'e', 'racine'])
    expect(t(3)).toEqual(['a', 'a1'])
  })

  it('un focus ne révèle pas un nœud caché', () => {
    const f = seq(step({ type: 'show', targets: ['racine'] }), step({ type: 'fold', targets: ['a'] }, { type: 'focus', targets: ['a1'] }))
    expect(stateOf(computeStage(f, 1, { tree }), 'a1').visibility).toBe('hidden')
  })

  it('replis à la main : par-dessus la séquence, sans révéler ce qu’elle cache encore', () => {
    const live = (i: number, id: string, overrides: [string, boolean][], liveUnfolds: string[] = []) =>
      stateOf(computeStage(s, i, { tree, dependencies, foldOverrides: new Map(overrides), liveUnfolds: new Set(liveUnfolds) }), id)
    // Déplier à l'étape 2 (où la séquence a replié a) : a1 réapparaît, en fondu si le geste date de l'étape.
    expect(live(2, 'a1', [['a', false]]).visibility).toBe('visible')
    expect(live(2, 'a1', [['a', false]]).entering).toBeUndefined()
    expect(live(2, 'a1', [['a', false]], ['a'])).toMatchObject({ visibility: 'visible', entering: 'fade', live: true })
    // Replier la racine à l'étape 1 : a et b sont cachés par le repli, e aussi.
    expect(live(1, 'b', [['racine', true]])).toMatchObject({ visibility: 'hidden', foldHidden: true })
    expect(live(1, 'e', [['racine', true]]).visibility).toBe('hidden')
    // À l'étape 0, b n'est pas encore révélé : replier puis déplier la racine ne le montre pas.
    expect(live(0, 'b', [['racine', true]])).toMatchObject({ visibility: 'hidden', foldHidden: false })
    expect(live(0, 'b', [['racine', false]]).visibility).toBe('hidden')
  })

  it("un nœud sous une branche repliée que la séquence n'a pas révélée ne compte pas dans « +n »", () => {
    // b1 (non géré) sous b, repliée et pas encore montrée à l'étape 0 : la déplier ne la montrerait pas.
    const t = new Map([...tree, ['b1', 'b']])
    const at0 = (id: string) => stateOf(computeStage(s, 0, { tree: t, folded: new Set(['b']) }), id)
    expect(at0('b1')).toMatchObject({ visibility: 'hidden', foldHidden: false })
    expect(stateOf(computeStage(s, 1, { tree: t, folded: new Set(['b']) }), 'b1')).toMatchObject({ visibility: 'hidden', foldHidden: true })
  })

  it('une flèche gérée est cachée tant que ses extrémités le sont', () => {
    const g = seq(step({ type: 'show', targets: ['e'] }), step({ type: 'show', targets: ['x'] }))
    const deps = new Map([['e', ['x']]])
    expect(stateOf(computeStage(g, 0, { dependencies: deps }), 'e').visibility).toBe('hidden')
    expect(stateOf(computeStage(g, 1, { dependencies: deps }), 'e')).toMatchObject({ visibility: 'visible', entering: 'fade' })
  })
})

describe('migrateSequence', () => {
  it("laisse intacte une séquence à jour (même objet, pour les calculs réactifs)", () => {
    const s = { ...seq(), version: SEQUENCE_VERSION }
    expect(migrateSequence(s)).toBe(s)
  })

  it('v1 → v2 : « déplier le détail » devient « afficher la note », « replier » disparaît', () => {
    const v1 = {
      id: 's',
      title: '',
      steps: [{ ...step(), actions: [{ type: 'expand', targets: ['b'] }, { type: 'collapse', targets: ['b'] }, { type: 'show', targets: ['c'] }] }],
    } as unknown as Sequence
    const v2 = migrateSequence(v1)
    expect(v2.version).toBe(2)
    expect(v2.steps[0].actions).toEqual([{ type: 'note', targets: ['b'] }, { type: 'show', targets: ['c'] }])
  })
})

describe('mode « tour » : tout visible, chaque étape montre (et cadre) ses objets', () => {
  const base = seq(step({ type: 'show', targets: ['a'] }), step({ type: 'show', targets: ['b'] }), step({ type: 'hide', targets: ['a'] }), step({ type: 'show', targets: ['a'] }))
  const tour: Sequence = { ...base, mode: 'tour' }
  const muted = (s: Sequence, index: number, id: string, opts = {}) => !!stateOf(computeStage(s, index, opts), id).muted

  it('rien n’est caché au départ, ni atténué', () => {
    expect(vis(tour, -1, 'a')).toBe('visible')
    expect(vis(tour, -1, 'b')).toBe('visible')
    expect(muted(tour, -1, 'a')).toBe(false)
  })

  it('les objets de l’étape restent nets, le reste (objets libres compris) est légèrement atténué', () => {
    expect(muted(tour, 0, 'a')).toBe(false)
    expect(muted(tour, 0, 'b')).toBe(true)
    expect(muted(tour, 0, 'libre')).toBe(true)
    expect(vis(tour, 0, 'b')).toBe('visible')
  })

  it('sans atténuation si l’auteur l’a désactivée', () => {
    expect(muted({ ...tour, tourMute: false }, 0, 'b')).toBe(false)
  })

  it('pas d’effet d’entrée pour un objet déjà visible ; un objet caché par une étape réapparaît avec', () => {
    expect(computeStage(tour, 0).get('a')?.entering).toBeUndefined()
    expect(vis(tour, 2, 'a')).toBe('hidden')
    expect(computeStage(tour, 3).get('a')?.entering).toBe('fade')
  })

  it('une flèche entre deux objets de l’étape reste nette', () => {
    const t: Sequence = { ...seq(step({ type: 'show', targets: ['a', 'b'] })), mode: 'tour' }
    const dependencies = new Map([['ab', ['a', 'b']], ['ac', ['a', 'c']]])
    expect(muted(t, 0, 'ab', { dependencies })).toBe(false)
    expect(muted(t, 0, 'ac', { dependencies })).toBe(true)
  })
})

describe('affichage par-dessus la séquence (touche V)', () => {
  const s = seq(step({ type: 'show', targets: ['a'] }), step({ type: 'show', targets: ['b'] }), step({ type: 'show', targets: ['c'] }))

  it('« tout » : ce qui reste caché apparaît, l’étape courante mise en valeur', () => {
    expect(vis(s, 0, 'c', { view: 'all' })).toBe('visible')
    expect(stateOf(computeStage(s, 0, { view: 'all' }), 'c').muted).toBe(true)
    expect(stateOf(computeStage(s, 0, { view: 'all' }), 'a').muted).toBeFalsy()
  })

  it('« étape seule » : seuls les objets de l’étape, et les flèches entre eux', () => {
    const dependencies = new Map([['ab', ['a', 'b']], ['bx', ['b', 'x']]])
    expect(vis(s, 1, 'b', { view: 'step' })).toBe('visible')
    expect(vis(s, 1, 'a', { view: 'step' })).toBe('hidden')
    expect(vis(s, 1, 'libre', { view: 'step' })).toBe('hidden')
    const t = seq(step({ type: 'show', targets: ['a', 'b'] }))
    expect(vis(t, 0, 'ab', { view: 'step', dependencies })).toBe('visible')
    expect(vis(t, 0, 'bx', { view: 'step', dependencies })).toBe('hidden')
  })
})

describe('aller à l’étape d’un objet cliqué', () => {
  const s = seq(step({ type: 'show', targets: ['a'] }), step({ type: 'highlight', targets: ['b'] }), step({ type: 'show', targets: ['b'] }), step({ type: 'dim', targets: ['a'] }))

  it('étapes qui concernent un objet (apparition, surlignage…, pas une simple atténuation)', () => {
    expect(stepsOf(s, 'b')).toEqual([1, 2])
    expect(stepsOf(s, 'a')).toEqual([0])
  })

  it('aucune s’il est de l’étape courante ; sinon la suivante qui le concerne, ou la première', () => {
    expect(stepToJump(s, 1, 'b')).toBeNull()
    expect(stepToJump(s, -1, 'b')).toBe(1)
    expect(stepToJump(s, 3, 'b')).toBe(1)
    expect(stepToJump(s, 3, 'a')).toBe(0)
    expect(stepToJump(s, 0, 'libre')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { branchBend, descendantsOf, hasAncestor, layoutTree, lighterSide, type TreeNode } from './layout'

const node = (children: string[] = [], w = 100, h = 40, offset = { x: 0, y: 0 }): TreeNode => ({ w, h, offset, children })
const gaps = { main: 50, cross: 10 }

describe('layoutTree', () => {
  const nodes = new Map([
    ['r', node(['a', 'b'])],
    ['a', node(['a1', 'a2'])],
    ['a1', node()],
    ['a2', node()],
    ['b', node()],
  ])

  it('déploie vers la droite, parent centré sur ses enfants', () => {
    const pos = layoutTree('r', { x: 0, y: 0 }, nodes, 'right', gaps)
    // Bande de a : 40 + 10 + 40 = 90 ; bande totale : 90 + 10 + 40 = 140, centrée sur r (y = 20).
    expect(pos.get('a')).toEqual({ x: 150, y: -50 + 25 })
    expect(pos.get('a1')).toEqual({ x: 300, y: -50 })
    expect(pos.get('a2')).toEqual({ x: 300, y: 0 })
    expect(pos.get('b')).toEqual({ x: 150, y: 50 })
    expect(pos.has('r')).toBe(false)
  })

  it('un nœud peut resserrer ses propres enfants (prémisses liées sous leur pastille)', () => {
    const tight = new Map(nodes)
    tight.set('a', { ...node(['a1', 'a2'], 10, 10), gaps: { main: 20, cross: 4 } })
    const pos = layoutTree('r', { x: 0, y: 0 }, tight, 'right', gaps)
    // Bande de a : 40 + 4 + 40 = 84 ; ses enfants à 20 de lui, les autres écarts inchangés.
    expect(pos.get('a2')!.y - pos.get('a1')!.y).toBe(44)
    expect(pos.get('a1')!.x).toBe(pos.get('a')!.x + 10 + 20)
    expect(pos.get('b')!.y - pos.get('a1')!.y).toBe(84 + 10)
  })

  it('une branche repliée ne garde que la place de son nœud : les voisins se resserrent', () => {
    const folded = new Map(nodes)
    folded.set('a', { ...nodes.get('a')!, collapsed: true })
    const pos = layoutTree('r', { x: 0, y: 0 }, folded, 'right', gaps)
    // Bandes : a (40, replié) + 10 + b (40) = 90, centrée sur r (y = 20).
    expect(pos.get('a')).toEqual({ x: 150, y: -25 })
    expect(pos.get('b')).toEqual({ x: 150, y: 25 })
    // Ses descendants (cachés) restent placés par rapport à lui.
    expect(pos.get('a1')!.x).toBe(300)
    expect((pos.get('a1')!.y + pos.get('a2')!.y) / 2).toBe(pos.get('a')!.y)
  })

  it('vers le bas : les axes sont échangés', () => {
    const pos = layoutTree('r', { x: 0, y: 0 }, nodes, 'down', gaps)
    expect(pos.get('a1')!.y).toBe(2 * (40 + 50))
    expect(pos.get('a1')!.x).toBeLessThan(pos.get('a2')!.x)
  })

  it('vers la gauche et vers le haut : miroirs de la droite et du bas', () => {
    const right = layoutTree('r', { x: 0, y: 0 }, nodes, 'right', gaps)
    const left = layoutTree('r', { x: 0, y: 0 }, nodes, 'left', gaps)
    // Miroir autour de la racine (largeur 100) : x_gauche = 100 − (x_droite + 100) = −x_droite.
    expect(left.get('a1')).toEqual({ x: -right.get('a1')!.x, y: right.get('a1')!.y })
    const up = layoutTree('r', { x: 0, y: 0 }, nodes, 'up', gaps)
    expect(up.get('a1')!.y).toBe(-2 * (40 + 50))
  })

  it('des deux côtés : chaque côté est centré sur la racine, ses descendants suivent son sens', () => {
    const both = new Map(nodes)
    both.set('a', { ...nodes.get('a')!, side: 'left' })
    const pos = layoutTree('r', { x: 0, y: 0 }, both, 'both', gaps)
    // b seul à droite : centré sur la racine (y = 0) ; a et ses enfants à gauche.
    expect(pos.get('b')).toEqual({ x: 150, y: 0 })
    expect(pos.get('a')).toEqual({ x: -150, y: 0 })
    expect(pos.get('a1')!.x).toBe(-300)
    expect(pos.get('a1')!.y).toBe(20 - 45)
  })

  it('un décalage manuel est conservé et entraîne le sous-arbre', () => {
    const moved = new Map(nodes)
    moved.set('a', node(['a1', 'a2'], 100, 40, { x: 20, y: -30 }))
    const before = layoutTree('r', { x: 0, y: 0 }, nodes, 'right', gaps)
    const after = layoutTree('r', { x: 0, y: 0 }, moved, 'right', gaps)
    expect(after.get('a')).toEqual({ x: before.get('a')!.x + 20, y: before.get('a')!.y - 30 })
    expect(after.get('a1')).toEqual({ x: before.get('a1')!.x + 20, y: before.get('a1')!.y - 30 })
    expect(after.get('b')).toEqual(before.get('b'))
  })

  it('résiste aux cycles', () => {
    const cyclic = new Map([
      ['r', node(['a'])],
      ['a', node(['r'])],
    ])
    expect(layoutTree('r', { x: 0, y: 0 }, cyclic, 'right', gaps).size).toBe(1)
  })
})

describe('lighterSide', () => {
  it('choisit le côté le moins chargé, la droite à égalité', () => {
    expect(lighterSide([])).toBe('right')
    expect(lighterSide([{ side: 'right', size: 40 }])).toBe('left')
    expect(lighterSide([{ side: 'right', size: 40 }, { side: 'left', size: 90 }])).toBe('right')
  })
})

describe('parcours', () => {
  const children = new Map([
    ['r', ['a', 'b']],
    ['a', ['a1']],
  ])
  const parent = new Map([
    ['a', 'r'],
    ['b', 'r'],
    ['a1', 'a'],
  ])
  it('descendants et ancêtres', () => {
    expect(descendantsOf(children, 'r').sort()).toEqual(['a', 'a1', 'b'])
    expect(hasAncestor(parent, 'a1', (p) => p === 'r')).toBe(true)
    expect(hasAncestor(parent, 'b', (p) => p === 'a')).toBe(false)
  })
})

describe('branchBend', () => {
  it('droite quand l’enfant est en face, courbée sinon, dans le sens du décalage', () => {
    expect(branchBend({ x: 0, y: 0 }, { x: 200, y: 0 }, true)).toBe(0)
    const below = branchBend({ x: 0, y: 0 }, { x: 200, y: 100 }, true)
    expect(below).toBeCloseTo(26.39, 1)
    expect(branchBend({ x: 0, y: 0 }, { x: 200, y: -100 }, true)).toBeCloseTo(-below)
    // Vers la gauche : miroir.
    expect(branchBend({ x: 0, y: 0 }, { x: -200, y: 100 }, true)).toBeCloseTo(-below)
  })

  it('plafonnée au quart de cercle quand l’enfant est très décalé', () => {
    const chord = Math.hypot(100, 400)
    expect(branchBend({ x: 0, y: 0 }, { x: 100, y: 400 }, true)).toBeCloseTo((chord * (1 - Math.SQRT1_2)) / Math.SQRT2)
  })
})

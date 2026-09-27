import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultPresets } from '../presets/presets'
import { checkMap, formatIssue, parseMap } from './check'
import { mapJsonSchema, MapSchema, type UnveilMap } from './format'
import { fromEngineSteps, toEngineSteps, type RefShapes, type ShapeOwner } from './sequence'
import truthEn from '../examples/truth.en.json'
import truthFr from '../examples/truth.fr.json'

const presets = defaultPresets({})
const known = {
  types: presets.filter((p) => p.target === 'shape').map((p) => p.id),
  relations: presets.filter((p) => p.target === 'arrow').map((p) => p.id),
}

const base = (elements: UnveilMap['elements'], extra: Partial<UnveilMap> = {}): UnveilMap => ({
  format: 'unveilboard/map',
  version: 1,
  elements,
  ...extra,
})

const codes = (map: UnveilMap) => checkMap(map, known).map((i) => `${i.level}:${i.code}`)

describe('format des schémas', () => {
  it('les exemples sont valides, sans avertissement', () => {
    for (const example of [truthFr, truthEn]) {
      const result = parseMap(example, known)
      expect(result.issues.map(formatIssue)).toEqual([])
      expect(result.ok).toBe(true)
    }
  })

  it('refuse un JSON illisible ou hors format, avec le chemin en cause', () => {
    expect(parseMap('{', known).issues[0].code).toBe('invalid_json')
    const r = parseMap({ format: 'unveilboard/map', version: 1, elements: [{ id: 'a' }] }, known)
    expect(r.ok).toBe(false)
    expect(r.issues[0]).toMatchObject({ code: 'invalid_format', path: 'elements[0].text' })
  })

  it('contrôle les références, l’arbre et le vocabulaire', () => {
    expect(
      codes(
        base([
          { id: 'a', text: 'A', relation: 'supports' },
          { id: 'b', text: 'B', parent: 'zz' },
          { id: 'c', text: 'C', parent: 'd' },
          { id: 'd', text: 'D', parent: 'c', type: 'nope', relation: 'nope' },
          { id: 'a', text: 'A2' },
        ])
      )
    ).toEqual([
      'error:duplicate_id',
      'error:relation_without_parent',
      'error:unknown_parent',
      'error:unknown_type',
      'error:unknown_relation',
      'error:cycle',
      'error:cycle',
    ])
  })

  it('un type ou une relation déclarés dans le vocabulaire du schéma sont connus', () => {
    const map = base(
      [
        { id: 'a', text: 'A', type: 'hypothesis' },
        { id: 'b', text: 'B', parent: 'a', relation: 'nuances' },
      ],
      {
        vocabulary: [
          { id: 'hypothesis', kind: 'type', name: 'Hypothèse' },
          { id: 'nuances', kind: 'relation', name: 'nuance' },
        ],
      }
    )
    expect(codes(map)).toEqual([])
  })

  it('séquence : cibles inconnues, note absente, élément montré avant son parent', () => {
    const elements = [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B', parent: 'a' },
    ]
    expect(codes(base(elements, { sequence: { steps: [{ title: '1', actions: [{ do: 'show', targets: ['x'] }] }] } }))).toEqual([
      'error:unknown_target',
    ])
    const steps = [
      { title: '1', actions: [{ do: 'show' as const, targets: ['b'] }, { do: 'note' as const, targets: ['b'] }] },
      { title: '2', actions: [{ do: 'show' as const, targets: ['a'] }] },
    ]
    expect(codes(base(elements, { sequence: { steps } }))).toEqual(['warning:no_note', 'warning:shown_but_hidden'])
  })
})

describe('séquence : format ↔ moteur', () => {
  // Formes fictives : la boîte porte l'identifiant, sa flèche « id> ».
  const map = MapSchema.parse(truthFr)
  const shapes = new Map<string, RefShapes>(
    map.elements.map((e) => [e.id, { kind: 'element', node: `s:${e.id}`, ...(e.parent && { edge: `s:${e.id}>` }) }])
  )
  const owners = new Map<string, ShapeOwner>()
  for (const [ref, s] of shapes) {
    owners.set(s.node, { ref, part: 'node' })
    if (s.edge) owners.set(s.edge, { ref, part: 'edge' })
  }
  let n = 0
  const engine = toEngineSteps(map.sequence!.steps, (r) => shapes.get(r), () => `st${n++}`)

  it('montrer un élément : la boîte monte (fondu pour la racine), la flèche se trace', () => {
    expect(engine[0].actions).toEqual([{ type: 'show', targets: ['s:question'], effect: 'fade' }])
    expect(engine[1].actions).toEqual([
      { type: 'show', targets: ['s:thesis'], effect: 'rise' },
      { type: 'show', targets: ['s:thesis>'], effect: 'draw' },
    ])
    expect(engine[5].actions[2]).toEqual({ type: 'focus', targets: ['s:thesis', 's:thesis>', 's:objection', 's:objection>'] })
    expect(engine[0].camera).toEqual({ mode: 'overview' })
    expect(engine[1].camera).toEqual({ mode: 'follow' })
  })

  it('aller-retour sans perte', () => {
    expect(fromEngineSteps(engine, (s) => owners.get(s), (r) => shapes.get(r))).toEqual(map.sequence!.steps)
  })

  it('une partie seule, un effet choisi', () => {
    const steps = [
      {
        title: 't',
        actions: [
          { do: 'show' as const, targets: ['thesis'], part: 'edge' as const },
          { do: 'show' as const, targets: ['objection'], effect: 'draw' as const },
          { do: 'dim' as const, targets: ['answer'], part: 'node' as const },
        ],
      },
    ]
    const back = fromEngineSteps(toEngineSteps(steps, (r) => shapes.get(r), () => 'x'), (s) => owners.get(s), (r) => shapes.get(r))
    expect(back[0].actions).toEqual([
      { do: 'show', targets: ['thesis'], effect: 'draw', part: 'edge' },
      { do: 'show', targets: ['objection'], effect: 'draw' },
      { do: 'dim', targets: ['answer'], part: 'node' },
    ])
  })
})

describe('JSON Schema publié', () => {
  it('docs/map-format.schema.json est à jour (UPDATE_MAP_SCHEMA=1 pour le régénérer)', () => {
    const file = join(process.cwd(), 'docs/map-format.schema.json')
    const expected = JSON.stringify(mapJsonSchema(), null, 2) + '\n'
    if (process.env.UPDATE_MAP_SCHEMA) writeFileSync(file, expected)
    expect(readFileSync(file, 'utf8')).toBe(expected)
  })
})

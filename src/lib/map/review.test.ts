import { describe, expect, it } from 'vitest'
import { defaultPresets } from '../presets/presets'
import { MapSchema, type UnveilMap } from './format'
import { readJson } from './read'
import { autoRemarks, summarizeOperations } from './review'
import truthFr from '../examples/truth.fr.json'

const presets = defaultPresets({})
const known = {
  types: presets.filter((p) => p.target === 'shape').map((p) => p.id),
  relations: presets.filter((p) => p.target === 'arrow').map((p) => p.id),
}
const map = MapSchema.parse(truthFr)

const review = (remarks: unknown[]) => ({ format: 'unveilboard/review', version: 1, summary: 'Solide.', remarks })

describe('relecture (unveilboard/review)', () => {
  it('remarques avec et sans correction ; cible inconnue ignorée', () => {
    const r = readJson(
      review([
        { id: 'r1', kind: 'type', priority: 'high', targets: ['assumption'], message: 'Un présupposé.', operations: [{ op: 'update', id: 'assumption', type: 'belief' }] },
        { id: 'r2', kind: 'gap', targets: ['thesis', 'ghost'], message: 'Il manque une prémisse.' },
      ]),
      known,
      map
    )
    expect(r).toMatchObject({ kind: 'review', ok: true })
    if (r.kind !== 'review' || !r.ok) return
    expect(r.remarks).toEqual([
      { id: 'r1', origin: 'ai', kind: 'type', priority: 'high', targets: ['assumption'], message: 'Un présupposé.', operations: [{ op: 'update', id: 'assumption', type: 'belief' }] },
      { id: 'r2', origin: 'ai', kind: 'gap', priority: 'medium', targets: ['thesis'], message: 'Il manque une prémisse.' },
    ])
    expect(r.issues.map((i) => i.code)).toEqual(['unknown_target'])
  })

  it('correction invalide : erreur au premier essai, remarque gardée sans correction ensuite', () => {
    const data = review([{ id: 'r1', kind: 'relation', targets: ['answer'], message: 'x', operations: [{ op: 'update', id: 'answer', relation: 'blames' }] }])
    expect(readJson(data, known, map, { strict: true })).toMatchObject({ kind: 'review', ok: false })
    const lenient = readJson(data, known, map)
    expect(lenient).toMatchObject({ kind: 'review', ok: true })
    if (lenient.kind === 'review' && lenient.ok) {
      expect(lenient.remarks[0].operations).toBeUndefined()
      expect(lenient.remarks[0].fixIssues?.[0].code).toBe('unknown_relation')
    }
  })

  it('vérifications automatiques : objection sans réponse, thèse sans justification, relation manquante, ordre, longueur', () => {
    const m: UnveilMap = {
      format: 'unveilboard/map',
      version: 1,
      elements: [
        { id: 'q', type: 'question', text: 'Q ?', tree: { kind: 'argument' } },
        { id: 't', text: 'Thèse', parent: 'q', relation: 'answers' },
        { id: 'o', text: 'Objection', parent: 't', relation: 'objects' },
        { id: 'x', text: 'x'.repeat(300), parent: 't' },
      ],
    }
    expect(autoRemarks(m, ['o']).map((r) => `${r.code}:${r.targets}`)).toEqual([
      'thesis_unsupported:t',
      'objection_unanswered:o',
      'relation_missing:x',
      'shown_before_parent:o',
      'long_box:x',
    ])
    // L'exemple : l'objection a ses réponses, la thèse sa justification.
    expect(autoRemarks(map)).toEqual([])
  })

  it('résumé des corrections : éléments désignés par leur texte', () => {
    expect(
      summarizeOperations(
        [
          { op: 'add', id: 'p', text: 'Une prémisse', parent: 'thesis', relation: 'supports' },
          { op: 'update', id: 'assumption', type: 'belief', source: null },
          { op: 'remove', id: 'example' },
        ],
        map
      )
    ).toEqual([
      { op: 'add', text: 'Une prémisse', parent: 'Oui : la véracité est un devoir inconditionnel', relation: 'supports' },
      { op: 'update', target: 'La valeur morale d’un acte tient à son principe, non à ses conséquences', fields: [{ key: 'type', value: 'belief' }, { key: 'source', value: null }] },
      { op: 'remove', target: 'L’assassin à la porte : même à lui, je ne dois pas mentir' },
    ])
  })
})

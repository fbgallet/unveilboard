import { describe, expect, it } from 'vitest'
import { defaultPresets } from '../presets/presets'
import { MapSchema, type UnveilMap } from './format'
import { readJson } from './read'
import { autoRemarks, nameRefs, summarizeOperations } from './review'
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

  it('prémisses liées : la pastille soutient la thèse, une réponse à l’une des prémisses répond à l’objection, une seule prémisse est signalée', () => {
    const m: UnveilMap = {
      format: 'unveilboard/map',
      version: 1,
      elements: [
        { id: 't', text: 'Socrate est mortel', tree: { kind: 'argument' } },
        { id: 'l', type: 'linked', text: '', parent: 't', relation: 'supports' },
        { id: 'p1', text: 'Tout homme est mortel', parent: 'l', relation: 'premise' },
        { id: 'p2', text: 'Socrate est un homme', parent: 'l', relation: 'premise' },
        { id: 'o', type: 'linked', text: '', parent: 't', relation: 'objects' },
        { id: 'op', text: 'Les dieux sont immortels', parent: 'o', relation: 'premise' },
        { id: 'a', text: 'Socrate n’est pas un dieu', parent: 'op', relation: 'answers' },
      ],
    }
    expect(autoRemarks(m).map((r) => `${r.code}:${r.targets}`)).toEqual(['linked_alone:o'])
  })

  it('identifiants laissés par le modèle remplacés par le texte des éléments', () => {
    const names: Record<string, string> = { def1: 'Mentir, c’est dire le faux', presup1: 'La parole engage', example: 'Le meurtrier à la porte' }
    const nameOf = (id: string) => names[id]
    expect(nameRefs('La définition def1 suppose `presup1`.', nameOf)).toBe('La définition “Mentir, c’est dire le faux” suppose “La parole engage”.')
    // Un mot ordinaire n'est remplacé qu'entre accents graves ; un identifiant inconnu reste tel quel.
    expect(nameRefs('Cet example, et `example`, pas obj9.', nameOf)).toBe('Cet example, et “Le meurtrier à la porte”, pas obj9.')
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

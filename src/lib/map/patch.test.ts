import { describe, expect, it } from 'vitest'
import { defaultPresets } from '../presets/presets'
import { MapSchema } from './format'
import { previewPatch, type MapPatch } from './patch'
import { extractJson, readJson } from './read'
import truthFr from '../examples/truth.fr.json'

const presets = defaultPresets({})
const known = {
  types: presets.filter((p) => p.target === 'shape').map((p) => p.id),
  relations: presets.filter((p) => p.target === 'arrow').map((p) => p.id),
}
const map = MapSchema.parse(truthFr)
const patch = (operations: MapPatch['operations']): MapPatch => ({ format: 'unveilboard/patch', version: 1, operations })
const codes = (p: MapPatch) => previewPatch(map, p, known).issues.map((i) => `${i.level}:${i.code}:${i.path}`)

describe('modifications (unveilboard/patch)', () => {
  it('ajouter, modifier, lier, compléter la séquence', () => {
    const { map: next, issues } = previewPatch(
      map,
      patch([
        { op: 'add', id: 'obj2', text: 'Mentir peut sauver une vie', parent: 'thesis', relation: 'objects' },
        { op: 'add', id: 'rep2', text: 'Le devoir ne dépend pas des conséquences', parent: 'obj2', relation: 'answers' },
        { op: 'update', id: 'thesis', text: 'Oui, toujours', source: null, reasoning: 'deduction' },
        { op: 'link', id: 'lk', from: 'rep2', to: 'assumption', relation: 'presupposes' },
        { op: 'sequence', mode: 'append', steps: [{ title: 'Une autre objection', actions: [{ do: 'show', targets: ['obj2', 'rep2'] }] }] },
      ]),
      known
    )
    expect(issues).toEqual([])
    const thesis = next.elements.find((e) => e.id === 'thesis')!
    expect(thesis).toMatchObject({ text: 'Oui, toujours', reasoning: 'deduction' })
    expect(thesis.source).toBeUndefined()
    expect(next.elements.find((e) => e.id === 'rep2')).toMatchObject({ parent: 'obj2' })
    expect(next.links).toHaveLength(1)
    expect(next.sequence!.steps).toHaveLength(10)
  })

  it('supprimer une branche retire ses éléments, leurs liens et les cibles de la séquence', () => {
    const { map: next, issues } = previewPatch(map, patch([{ op: 'remove', id: 'objection' }]), known)
    expect(issues).toEqual([])
    expect(next.elements.map((e) => e.id)).toEqual(['question', 'thesis', 'justification', 'assumption', 'example'])
    const targets = next.sequence!.steps.flatMap((s) => s.actions.flatMap((a) => a.targets))
    expect(targets).not.toContain('objection')
    expect(targets).not.toContain('distinction')
    // L'étape de l'objection garde la mise en avant de la thèse.
    expect(next.sequence!.steps[5].actions).toEqual([{ do: 'focus', targets: ['thesis'] }])
  })

  it('déplacer une branche remet les parents avant les enfants ; la séquence simulée le signale', () => {
    const { map: next, issues } = previewPatch(map, patch([{ op: 'move', id: 'example', parent: 'objection', relation: 'illustrates' }]), known)
    // L'exemple est montré (étape 5) avant l'objection (étape 6), dont il dépend désormais.
    expect(issues).toEqual([{ level: 'warning', code: 'shown_but_hidden', path: 'sequence.steps[4]', detail: 'example' }])
    const ids = next.elements.map((e) => e.id)
    expect(ids.indexOf('objection')).toBeLessThan(ids.indexOf('example'))
  })

  it('erreurs : identifiant inconnu, doublon, cycle, relation inconnue (chemins par identifiant)', () => {
    expect(codes(patch([{ op: 'update', id: 'nope', text: 'x' }]))).toEqual(['error:unknown_element:operations[0].id'])
    expect(codes(patch([{ op: 'add', id: 'thesis', text: 'x' }]))).toEqual(['error:duplicate_id:elements[id=thesis].id'])
    expect(codes(patch([{ op: 'move', id: 'thesis', parent: 'answer' }]))).toContain('error:cycle:elements[id=thesis].parent')
    expect(codes(patch([{ op: 'update', id: 'answer', relation: 'blames' }]))).toEqual(['error:unknown_relation:elements[id=answer].relation'])
  })
})

describe('lecture d’un JSON collé', () => {
  it('extrait le JSON d’une réponse d’IA (bloc de code, texte autour)', () => {
    expect(extractJson('Voici :\n```json\n{"a": 1}\n```\nBonne lecture')).toEqual({ a: 1 })
    expect(extractJson('Réponse : {"a": {"b": 2}} fin')).toEqual({ a: { b: 2 } })
    expect(extractJson('rien')).toBeUndefined()
  })

  it('reconnaît un schéma, des modifications, ou ni l’un ni l’autre', () => {
    expect(readJson(truthFr, known, map).kind).toBe('map')
    const r = readJson(JSON.stringify(patch([{ op: 'update', id: 'thesis', text: 'x' }])), known, map)
    expect(r).toMatchObject({ kind: 'patch', ok: true })
    expect(readJson('{"format": "autre"}', known, map)).toMatchObject({ ok: false, issues: [{ code: 'wrong_format' }] })
    // Des modifications sans schéma ouvert : refusées.
    expect(readJson(patch([{ op: 'remove', id: 'thesis' }]), known, null).ok).toBe(false)
  })
})

describe('extrait autour d’un élément', () => {
  it('ancêtres, élément, branche ; sans séquence', async () => {
    const { extractAround } = await import('./extract')
    const part = extractAround(map, 'objection')
    expect(part.elements.map((e) => e.id)).toEqual(['question', 'thesis', 'objection', 'distinction', 'answer'])
    expect(part.sequence).toBeUndefined()
  })
})

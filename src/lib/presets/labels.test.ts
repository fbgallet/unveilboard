import { describe, expect, it } from 'vitest'
import { messagesFor } from '@/i18n/config'
import { defaultNamesOf, presetLabel, presetName } from './labels'
import type { Preset } from './presets'

const relation = (name: string, label = name): Preset => ({ id: 'distinguishes', name, label, target: 'arrow', style: {} })
const fr = messagesFor('fr')
const en = messagesFor('en')

describe('noms affichés des préréglages', () => {
  it('un nom de départ, d’aujourd’hui ou d’avant, quelle que soit sa langue, s’affiche dans la langue courante', () => {
    for (const name of ['is distinct from', 'se distingue de', 'distinguishes', 'distingue']) {
      expect(presetName(relation(name), fr)).toBe('se distingue de')
      expect(presetLabel(relation(name), fr)).toBe('se distingue de')
      expect(presetName(relation(name), en)).toBe('is distinct from')
    }
    const belief: Preset = { id: 'belief', name: 'Fundamental belief', target: 'shape', style: {} }
    expect(presetName(belief, fr)).toBe(fr.presetDefaults.belief)
  })

  it('un nom choisi par l’utilisateur reste tel quel', () => {
    expect(presetName(relation('contraste avec'), en)).toBe('contraste avec')
  })

  it('noms de départ d’une relation : toutes les langues et les anciens', () => {
    expect(defaultNamesOf('distinguishes')).toEqual(expect.arrayContaining(['is distinct from', 'se distingue de', 'distinguishes', 'distingue']))
  })
})

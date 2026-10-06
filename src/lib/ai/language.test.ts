import { describe, expect, it } from 'vitest'
import { AUTO_LANG, UI_LANG, isLangCode, languageName, normalizeContentLang, resolveContentLang } from './language'

describe('langue du contenu (réglage)', () => {
  it('résolution : automatique, interface, code ; un réglage invalide revient à « automatique »', () => {
    expect(resolveContentLang(AUTO_LANG, 'fr')).toBe(AUTO_LANG)
    expect(resolveContentLang(UI_LANG, 'fr')).toBe('fr')
    expect(resolveContentLang('de', 'fr')).toBe('de')
    expect(resolveContentLang(undefined, 'fr')).toBe(AUTO_LANG)
    expect(normalizeContentLang('pt-BR')).toBe('pt-BR')
    expect(normalizeContentLang('Deutsch')).toBe(AUTO_LANG)
    expect(normalizeContentLang(42)).toBe(AUTO_LANG)
  })

  it('codes et noms', () => {
    expect(isLangCode('sv')).toBe(true)
    expect(isLangCode('auto')).toBe(false)
    expect(languageName('de')).toBe('German')
    expect(languageName('de', 'fr')).toBe('allemand')
  })
})

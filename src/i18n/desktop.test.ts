import { describe, expect, it } from 'vitest'
import { en } from './en'
import { fr } from './fr'
import { DESKTOP_MESSAGES, withOverrides } from './desktop'

describe('libellés de l’application de bureau', () => {
  it('remplacent les libellés visés, à toute profondeur, sans toucher aux autres', () => {
    const m = withOverrides(fr, DESKTOP_MESSAGES.fr)
    expect(m.landing.privacy).toBe('Sans compte. Vos schémas restent sur votre ordinateur.')
    expect(m.home.localNotice.strong).toBe('sur cet ordinateur uniquement')
    expect(m.home.localNotice.before).toBe(fr.home.localNotice.before)
    expect(m.ai.providerHints.clipboard).toBe(fr.ai.providerHints.clipboard)
    expect(m.ai.corsHint('http://127.0.0.1:43117')).toContain('L’application appelle ce serveur')
    expect(m.common).toBe(fr.common)
  })

  it('laissent les libellés de la langue intacts', () => {
    withOverrides(en, DESKTOP_MESSAGES.en)
    expect(en.landing.privacy).toBe('No account needed. Your diagrams stay in your browser.')
    expect(en.home.localNotice.strong).toBe('in this browser only')
  })
})

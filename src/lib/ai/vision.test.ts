import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkVision, knownVision, visionAtom } from './vision'

const answer = (modalities: string[]) => new Response(JSON.stringify({ data: { architecture: { input_modalities: modalities } } }))

describe('modèles qui voient les images (OpenRouter)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    visionAtom.set({})
  })

  it('demandé une fois par modèle (sans variante), puis connu', async () => {
    const fetch = vi.fn(async (url: string) => answer(url.includes('vision') ? ['text', 'image'] : ['text']))
    vi.stubGlobal('fetch', fetch)
    expect(knownVision('acme/vision-1')).toBeUndefined()
    expect(await checkVision('acme/vision-1:free')).toBe(true)
    expect(await checkVision('acme/text-1')).toBe(false)
    expect(await checkVision('acme/vision-1')).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/models/acme/vision-1/endpoints')
    expect(knownVision('acme/text-1')).toBe(false)
  })

  it('serveur injoignable ou réponse inattendue : on ne sait pas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    expect(await checkVision('acme/unknown')).toBeUndefined()
    expect(knownVision('acme/unknown')).toBeUndefined()
  })
})

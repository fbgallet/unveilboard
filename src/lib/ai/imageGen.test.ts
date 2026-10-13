import { describe, expect, it } from 'vitest'
import { AiError } from './errors'
import { imagePrompt, imageRequestBody, readImageResponse } from './imageGen'

describe('génération d’images', () => {
  const base = { subject: 'Le bateau de Thésée au chantier naval', style: 'line' as const, aspect: '4:3' as const }

  it('créer : le sujet, ce qu’il illustre, le style, et les règles (pas de texte, personne de réel)', () => {
    const prompt = imagePrompt({ ...base, context: 'Un objet dont on remplace les parties reste-t-il le même ?' })
    expect(prompt).toContain('Le bateau de Thésée')
    expect(prompt).toContain('It illustrates this idea: Un objet')
    expect(prompt).toContain('line drawing')
    expect(prompt).toContain('No text at all')
    expect(prompt).toContain('real, identifiable person')
    expect(imagePrompt({ ...base, style: 'free', styleNote: 'encre et lavis' })).toContain('Style: encre et lavis.')
  })

  it('modifier une image ou en composer une : la consigne, sans toucher aux personnes réelles', () => {
    const edit = imagePrompt({ ...base, subject: 'colorie les planches neuves', references: ['data:image/jpeg;base64,A'] })
    expect(edit).toContain('Edit the reference image as follows: colorie')
    expect(edit).not.toContain('Style:')
    expect(edit).toContain('Never change the face')
    expect(imagePrompt({ ...base, references: ['data:image/jpeg;base64,A', 'data:image/jpeg;base64,B'] })).toContain('Using the 2 reference images')
  })

  it('demande au point d’accès /images, avec les images de départ', () => {
    const body = imageRequestBody('openai/gpt-image-2.5-flare', { ...base, references: ['data:image/jpeg;base64,A'] })
    expect(body).toMatchObject({ model: 'openai/gpt-image-2.5-flare', aspect_ratio: '4:3', n: 1 })
    expect(body.input_references).toEqual([{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,A' } }])
    expect(imageRequestBody('m', base)).not.toHaveProperty('input_references')
  })

  it('réponse : l’image (type d’après ses octets) et son coût ; sans image, une erreur', () => {
    expect(readImageResponse({ data: [{ b64_json: 'iVBORw0' }], usage: { cost: 0.006 } })).toEqual({ dataUri: 'data:image/png;base64,iVBORw0', cost: 0.006 })
    expect(readImageResponse({ data: [{ b64_json: '/9j/4AA' }] }).dataUri).toBe('data:image/jpeg;base64,/9j/4AA')
    expect(() => readImageResponse({ data: [] })).toThrow(AiError)
  })
})

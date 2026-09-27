import { describe, expect, it } from 'vitest'
import { AiError } from './errors'
import { readTranscription, transcriptionMessages } from './transcribe'

describe('transcription', () => {
  it('image : partie image_url ; PDF : partie file', () => {
    const image = transcriptionMessages({ name: 'p.png', type: 'image/png', dataUri: 'data:image/png;base64,AAA' })
    expect(image[0].role).toBe('system')
    expect(image[1].content).toEqual([expect.objectContaining({ type: 'text' }), { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } }])
    const pdf = transcriptionMessages({ name: 'c.pdf', type: 'application/pdf', dataUri: 'data:application/pdf;base64,BBB' })
    expect((pdf[1].content as unknown[])[1]).toEqual({ type: 'file', file: { filename: 'c.pdf', file_data: 'data:application/pdf;base64,BBB' } })
  })

  it('lit le JSON, ou le texte brut ; un texte vide est une erreur', () => {
    expect(readTranscription('```json\n{"text": "Bonjour", "reference": "Kant"}\n```')).toEqual({ text: 'Bonjour', reference: 'Kant' })
    expect(readTranscription('Juste le texte')).toEqual({ text: 'Juste le texte', reference: '' })
    expect(() => readTranscription('{"text": "", "reference": ""}')).toThrow(AiError)
  })
})

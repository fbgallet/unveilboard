import { describe, expect, it } from 'vitest'
import { AiError } from './errors'
import { identificationMessages, imageReadingMessages, readIdentification, readImageAnswer, readingAsText } from './imageReading'

describe('lecture d’une image', () => {
  it('consigne système, puis la demande dans la langue voulue avec l’image', () => {
    const messages = imageReadingMessages('data:image/jpeg;base64,AAA', 'fr')
    expect(messages[0].role).toBe('system')
    const [text, image] = messages[1].content as { type: string; text?: string }[]
    expect(text.text).toContain('French')
    expect(image).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA' } })
  })

  it('lit le JSON ; un champ invalide est laissé de côté', () => {
    const answer = '```json\n{"kind": "artwork", "description": " Une femme brandit un drapeau. ", "text": "", "identification": "Delacroix, La Liberté guidant le peuple, 1830", "certainty": "established"}\n```'
    expect(readImageAnswer(answer)).toEqual({
      kind: 'artwork',
      description: 'Une femme brandit un drapeau.',
      identification: 'Delacroix, La Liberté guidant le peuple, 1830',
      certainty: 'established',
    })
    expect(readImageAnswer('{"kind": "poster", "description": "Un chat.", "certainty": "sure"}')).toEqual({ description: 'Un chat.' })
  })

  it('sans identification, pas de fiabilité ; texte brut accepté ; rien de lisible : une erreur', () => {
    expect(readImageAnswer('{"description": "Un tableau noir.", "identification": "", "certainty": "uncertain"}')).toEqual({ description: 'Un tableau noir.' })
    expect(readImageAnswer('Un paysage de montagne.')).toEqual({ description: 'Un paysage de montagne.' })
    expect(() => readImageAnswer('{"description": "  "}')).toThrow(AiError)
  })
})

describe('identification d’une image', () => {
  it('la meilleure proposition, sa fiabilité, et d’autres possibles (sans doublon)', () => {
    expect(identificationMessages('data:image/jpeg;base64,AAA', 'en')[1].content).toEqual([expect.objectContaining({ type: 'text' }), expect.objectContaining({ type: 'image_url' })])
    const answer = '{"identification": "Caspar David Friedrich, Le Voyageur contemplant une mer de nuages, vers 1818", "certainty": "likely", "alternatives": ["Caspar David Friedrich, Le Voyageur contemplant une mer de nuages, vers 1818", "Carl Gustav Carus, Pèlerin dans un paysage rocheux"]}'
    expect(readIdentification(answer)).toEqual({
      identification: 'Caspar David Friedrich, Le Voyageur contemplant une mer de nuages, vers 1818',
      certainty: 'likely',
      alternatives: ['Carl Gustav Carus, Pèlerin dans un paysage rocheux'],
    })
  })

  it('sans proposition principale : la première autre ; rien de reconnu : une erreur', () => {
    expect(readIdentification('{"identification": "", "alternatives": ["A", "B"]}')).toEqual({ identification: 'A', alternatives: ['B'] })
    expect(() => readIdentification('{"identification": "", "alternatives": []}')).toThrow(AiError)
  })

  it('une lecture comme texte source : ce qu’est l’image, ce qu’elle montre, son texte', () => {
    expect(readingAsText({ description: 'Un homme de dos.', identification: 'Friedrich', text: '' })).toBe('Friedrich\n\nUn homme de dos.')
  })
})

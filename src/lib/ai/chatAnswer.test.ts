import { describe, expect, it } from 'vitest'
import { MapSchema } from '../map/format'
import { conversationMarkdown, historyForModel, partialReply, plainRefs, readChatAnswer } from './chatAnswer'
import { MAX_CHAT_HISTORY, buildPrompt, type VocabularyLine } from './prompts'
import { promptMessages } from './run'
import truthFr from '../examples/truth.fr.json'

const vocabulary: VocabularyLine[] = [{ id: 'statement', kind: 'type', name: 'Énoncé' }]
const map = MapSchema.parse(truthFr)
const patch = { format: 'unveilboard/patch', version: 1, summary: 'Ajout', operations: [{ op: 'add', id: 'n1', text: 'X', parent: 'thesis' }] }

describe('chat : lecture des réponses', () => {
  it('message et modifications', () => {
    expect(readChatAnswer('```json\n' + JSON.stringify({ reply: 'Fait.', patch }) + '\n```')).toEqual({ reply: 'Fait.', patch })
  })

  it('message seul, patch null ignoré', () => {
    expect(readChatAnswer(JSON.stringify({ reply: 'Bonjour', patch: null }))).toEqual({ reply: 'Bonjour' })
  })

  it('texte libre : un message, sans modifications', () => {
    expect(readChatAnswer('La thèse est solide.')).toEqual({ reply: 'La thèse est solide.' })
  })

  it('modifications sans enveloppe : acceptées, message vide', () => {
    expect(readChatAnswer(JSON.stringify(patch))).toEqual({ reply: '', patch })
  })

  it('JSON illisible : ni message ni modifications (le contrôle demandera une correction)', () => {
    expect(readChatAnswer('{"reply": "coupé')).toEqual({ reply: '' })
  })
})

describe('chat : message en cours d’arrivée', () => {
  it('décode le début de `reply`, échappements compris', () => {
    expect(partialReply('{"reply": "Ligne 1\\nLigne \\"2\\" \\u00e9t')).toBe('Ligne 1\nLigne "2" ét')
  })
  it('s’arrête à la fin de la chaîne', () => {
    expect(partialReply('{"reply": "Fini.", "patch": {"summary": "x"}}')).toBe('Fini.')
  })
  it('rien tant que `reply` n’a pas commencé ; texte libre tel quel', () => {
    expect(partialReply('```json\n{"re')).toBe('')
    expect(partialReply('Bonjour')).toBe('Bonjour')
  })
  it('échappement coupé en fin de flux : ignoré', () => {
    expect(partialReply('{"reply": "a\\')).toBe('a')
    expect(partialReply('{"reply": "a\\u00')).toBe('a')
  })
})

describe('chat : messages envoyés', () => {
  it('historique : le modèle voit ses réponses en JSON, ses modifications résumées avec leur sort', () => {
    const history = historyForModel([
      { role: 'user', text: 'Ajoute une objection' },
      { role: 'assistant', text: 'Ajoutée.', changes: { summary: 'Une objection', status: 'undone' } },
    ])
    expect(history).toEqual([
      { role: 'user', content: 'Ajoute une objection' },
      { role: 'assistant', content: '{"reply":"Ajoutée.","changes":{"summary":"Une objection","status":"undone"}}' },
    ])
  })

  it('consigne en message système, sans la demande ; historique plafonné ; nouveau message à la fin', () => {
    const history = Array.from({ length: MAX_CHAT_HISTORY + 4 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }) as const)
    const messages = promptMessages({ task: 'chat', instruction: 'Et maintenant ?', map, history, vocabulary, lang: 'fr', delivery: 'api' })
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).not.toContain('Et maintenant ?')
    expect(messages[0].content).toContain('"reply"')
    expect(messages[0].content).toContain('(el:e12)')
    expect(messages).toHaveLength(1 + MAX_CHAT_HISTORY + 1)
    expect(messages[1].content).toBe('m4')
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Et maintenant ?' })
  })

  it('correction : la réponse et les problèmes après le nouveau message', () => {
    const messages = promptMessages(
      { task: 'chat', instruction: 'Ajoute', map, vocabulary, lang: 'fr', delivery: 'api' },
      { answer: '{"reply":"x"}', problems: ['bad id'] }
    )
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
  })

  it('les autres tâches gardent un seul message (sans liens el:)', () => {
    expect(promptMessages({ task: 'edit', instruction: 'x', map, vocabulary, lang: 'fr', delivery: 'api' }).map((m) => m.role)).toEqual(['user'])
    expect(buildPrompt({ task: 'edit', instruction: 'x', map, vocabulary, lang: 'fr', delivery: 'api' })).not.toContain('(el:')
  })
})

describe('chat : hors du chat', () => {
  it('références el: en texte', () => {
    expect(plainRefs('Voir [la thèse](el:thesis) et [un lien](https://x.org).')).toBe('Voir la thèse et [un lien](https://x.org).')
  })
  it('conversation en Markdown, modifications résumées', () => {
    const md = conversationMarkdown(
      [
        { role: 'user', text: 'Ajoute une objection' },
        { role: 'assistant', text: 'Ajoutée sous [la thèse](el:thesis).', changes: { summary: 'Une objection', status: 'applied' } },
      ],
      { user: 'Vous', ai: 'IA', status: { applied: 'Schéma modifié', undone: 'Annulé', suggested: 'Suggéré', failed: 'Échec' } }
    )
    expect(md).toBe('## Vous\n\nAjoute une objection\n\n## IA\n\nAjoutée sous la thèse.\n\n> Schéma modifié · Une objection\n')
  })
})

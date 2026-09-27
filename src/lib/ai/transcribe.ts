// Transcription d'une photo ou d'un PDF scanné par un modèle multimodal (consignes reprises des
// exercices de bac-philo-agent) : le texte, fidèlement, et sa référence si le document la porte.
// Pur : les messages et la lecture de la réponse ; l'envoi est fait par le fournisseur choisi.

import { z } from 'zod'
import { extractJson } from '../map/read'
import type { ChatMessage } from './chat'
import { AiError } from './errors'

export const TRANSCRIBE_PROMPT_VERSION = 1

const SYSTEM = `You transcribe a school document (a course, an author's text, a handout) so that a teacher can turn it into a diagram. You ONLY transcribe: no analysis, no comment, no summary, and you answer none of the questions the document may contain.

Transcribe ALL the text, in the order of the page, FAITHFULLY, word for word, in its original language: keep titles (as # headings), lists, paragraphs and questions. Do not correct spelling, do not modernise, do not rephrase, do not cut. Leave out only what is not text: page numbers, school headers, margins, handwritten annotations. A word you cannot read is written [illegible].

Answer with one JSON object and nothing else:
- "text": the faithful transcription, in light Markdown;
- "reference": the reference of the text if the document shows one (author, work, date), e.g. "Descartes, Meditations, 1641"; an empty string otherwise. Never invent a reference.

If the document is unreadable or has no text, answer with an empty "text": do not guess, invent nothing.`

/** Messages d'une transcription ; `dataUri` : le fichier en « data: » URI. */
export function transcriptionMessages(file: { name: string; type: string; dataUri: string }): ChatMessage[] {
  const part = file.type.startsWith('image/')
    ? { type: 'image_url' as const, image_url: { url: file.dataUri } }
    : { type: 'file' as const, file: { filename: file.name, file_data: file.dataUri } }
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: [{ type: 'text', text: 'Transcribe this document following the rules. Answer only with the JSON object.' }, part] },
  ]
}

/**
 * OpenRouter : un PDF est lu par le modèle lui-même (moteur « native ») ; sans cette précision,
 * OpenRouter passe par une reconnaissance de caractères facturée en plus.
 */
export const OPENROUTER_PDF_PLUGIN = { plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }] }

const TranscriptionSchema = z.object({ text: z.string(), reference: z.string().nullish() })

/** Réponse du modèle → texte et référence ; texte vide : document illisible. */
export function readTranscription(answer: string): { text: string; reference: string } {
  const parsed = TranscriptionSchema.safeParse(extractJson(answer))
  // Un modèle qui oublie le JSON renvoie souvent la transcription seule : on la prend telle quelle.
  const result = parsed.success ? { text: parsed.data.text, reference: parsed.data.reference ?? '' } : { text: answer.trim(), reference: '' }
  if (!result.text.trim()) throw new AiError('empty', 'No readable text in this document')
  return result
}

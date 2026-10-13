// Lecture d'une image du schéma par un modèle multimodal : ce qu'elle montre, son texte, ce qu'elle
// est (une œuvre, un document). Faite une fois, enregistrée avec l'image et modifiable par
// l'utilisateur, elle part ensuite avec le schéma (champ `image`) : toutes les demandes en
// profitent, même avec un modèle qui ne lit que du texte.
// Pur : les messages et la lecture de la réponse ; l'envoi est fait par le fournisseur choisi.

import { z } from 'zod'
import { CERTAINTIES, IMAGE_KINDS, type Certainty, type ImageReading } from '../map/format'
import { extractJson } from '../map/read'
import type { ChatMessage } from './chat'
import { AiError } from './errors'
import { languageName } from './language'

export const IMAGE_READING_PROMPT_VERSION = 1

const SYSTEM = `You read an image placed in a diagram (a mind map or an argument map) used to teach, so that the teacher, and later other models that cannot see it, know exactly what it shows. You describe; you do not develop the topic.

Answer with one JSON object and nothing else:
- "kind": one of ${IMAGE_KINDS.map((k) => `"${k}"`).join(', ')} ("artwork": a painting, a sculpture, an engraving…; "handwriting": handwritten notes or a blackboard);
- "description": what the image shows, as seen, without interpretation: the subject, the main elements and their layout, what stands out (gestures, expressions, light, contrasts). A few sentences, a short paragraph at most; more only for a diagram. For a diagram, a mind map, a blackboard or a chart: its structure, faithfully, as an indented list (one line per box, children indented under their parent, the words on an arrow in parentheses), then one sentence on what it represents;
- "text": the text visible in the image, transcribed word for word: a caption, a title, a sign, a page. An empty string if there is none, and for a diagram, a chart or a blackboard, whose words are already in the description;
- "identification": what the image is, only if you recognise it: a work (author, title, date), a historical document, a place, a public figure. An empty string otherwise. Never invent one, and never name a private person;
- "certainty": how sure the identification is: "established", "likely" (to check) or "uncertain".

Keep what you see apart from what you know: the description says what is in the image; what you know about it goes in "identification". If the image is unreadable, give an empty "description".`

/** Messages d'une lecture ; `lang` : la langue dans laquelle écrire (celle du schéma). */
export function imageReadingMessages(dataUri: string, lang: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: [
        { type: 'text', text: `Read this image following the rules. Write in ${languageName(lang)} (the visible text stays in its own language). Answer only with the JSON object.` },
        { type: 'image_url', image_url: { url: dataUri } },
      ],
    },
  ]
}

// Lecture tolérante : un champ invalide est laissé de côté plutôt que de perdre toute la lecture.
const AnswerSchema = z.object({
  kind: z.enum(IMAGE_KINDS).nullish().catch(undefined),
  description: z.string(),
  text: z.string().nullish().catch(undefined),
  identification: z.string().nullish().catch(undefined),
  certainty: z.enum(CERTAINTIES).nullish().catch(undefined),
})

/** Réponse du modèle → lecture ; sans description : image illisible. */
export function readImageAnswer(answer: string): ImageReading {
  const parsed = AnswerSchema.safeParse(extractJson(answer))
  // Un modèle qui oublie le JSON renvoie souvent la description seule : on la prend telle quelle.
  if (!parsed.success) {
    const description = answer.trim()
    if (!description) throw new AiError('empty', 'Nothing readable in this image')
    return { description: description.slice(0, 8000) }
  }
  const { kind, description, text, identification, certainty } = parsed.data
  if (!description.trim()) throw new AiError('empty', 'Nothing readable in this image')
  return {
    ...(kind && { kind }),
    description: description.trim().slice(0, 8000),
    ...(text?.trim() && { text: text.trim().slice(0, 8000) }),
    ...(identification?.trim() && { identification: identification.trim().slice(0, 300), ...(certainty && { certainty }) }),
  }
}

// ---------- Identifier une image ----------

const IDENTIFY = `You identify an image placed in a diagram used to teach: what it is, so that the teacher can cite it and check it.

Answer with one JSON object and nothing else:
- "identification": your best identification, in the usual form of a reference: a work (author, title, date; the museum or collection when you know it), a historical document (what it is, date, origin), a photograph (photographer, event, date), a place, a public figure, a scene from a known film or book. An empty string if you do not recognise it;
- "certainty": "established" (well known, you are sure), "likely" (probably right, to check) or "uncertain" (a guess, to check before use);
- "alternatives": up to three other plausible identifications, in the same form, when you are not sure (an empty list otherwise).

Never invent a reference to fill the answer: an empty identification is better than a false one. Never name a private person. If the image is a diagram, notes or a screenshot, say what it is in a few words (“mind map of the concept of freedom”), with "certainty": "established".`

/** Identification d'une image, et les autres possibles. */
export interface ImageIdentification {
  identification: string
  certainty?: Certainty
  alternatives: string[]
}

/** Messages d'une identification ; `lang` : la langue dans laquelle écrire. */
export function identificationMessages(dataUri: string, lang: string): ChatMessage[] {
  return [
    { role: 'system', content: IDENTIFY },
    {
      role: 'user',
      content: [
        { type: 'text', text: `Identify this image following the rules. Write in ${languageName(lang)} (titles keep their usual form). Answer only with the JSON object.` },
        { type: 'image_url', image_url: { url: dataUri } },
      ],
    },
  ]
}

const IdentificationSchema = z.object({
  identification: z.string().catch(''),
  certainty: z.enum(CERTAINTIES).nullish().catch(undefined),
  alternatives: z.array(z.string()).nullish().catch(undefined),
})

/** Réponse du modèle → identification ; rien de reconnu : une erreur. */
export function readIdentification(answer: string): ImageIdentification {
  const parsed = IdentificationSchema.safeParse(extractJson(answer))
  const data = parsed.success ? parsed.data : { identification: answer.trim(), certainty: undefined, alternatives: undefined }
  const identification = data.identification.trim().slice(0, 300)
  const alternatives = (data.alternatives ?? []).map((a) => a.trim().slice(0, 300)).filter((a) => a && a !== identification).slice(0, 3)
  if (!identification && !alternatives.length) throw new AiError('empty', 'Image not recognised')
  return { identification: identification || alternatives.shift()!, ...(data.certainty && { certainty: data.certainty }), alternatives }
}

/** Une lecture en texte, comme source d'un nouveau schéma : ce qu'est l'image, ce qu'elle montre, son texte. */
export function readingAsText(reading: ImageReading): string {
  return [reading.identification, reading.description, reading.text].filter((p) => p?.trim()).join('\n\n')
}

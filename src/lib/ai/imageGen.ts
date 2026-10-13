// Génération d'une image pour un élément, par un modèle qui en produit (OpenRouter, réponse en
// « data: » URI quand on demande modalities: ["image", "text"]). Pour ce qui est imaginaire
// seulement : une expérience de pensée, une analogie, un cas inventé, une scène d'ouverture. Ce qui
// est réel (un auteur, une œuvre, un document) se cherche, ne s'invente pas.
// Pur : la consigne, la demande et la lecture de la réponse ; l'envoi est fait par le fournisseur.

import { AiError } from './errors'

/** Styles d'image d'un document (enregistré dans le document : ses images vont ensemble). */
export const IMAGE_STYLES = ['engraving', 'line', 'flat', 'watercolor', 'sketch', 'free'] as const
export type ImageStyle = (typeof IMAGE_STYLES)[number]
export const DEFAULT_IMAGE_STYLE: ImageStyle = 'line'

const STYLE_TEXT: Record<ImageStyle, string> = {
  engraving: 'a black and white engraving, fine hatching, in the manner of 19th-century book illustrations',
  line: 'a clean line drawing, black ink on white, few lines, no shading, like an illustration in a philosophy textbook',
  flat: 'a flat illustration with a few solid colours, simple shapes, no gradients, no texture',
  watercolor: 'a light watercolour illustration, soft colours, white background showing through',
  sketch: 'a quick pencil sketch, loose strokes, grey on white',
  free: 'a clear, simple illustration',
}

/** Formats proposés. */
export const ASPECT_RATIOS = ['4:3', '1:1', '16:9', '3:4'] as const
export type AspectRatio = (typeof ASPECT_RATIOS)[number]

/** Images de référence au plus, et taille de chacune (« data: » URI, réduite). */
export const MAX_REFERENCES = 3
export const MAX_REFERENCE = 1_400_000

/** Ce qu'il faut pour demander une image. */
export interface ImageRequest {
  /**
   * Sans référence : ce que l'image doit montrer (prérempli avec l'élément). Avec : la consigne
   * (ce qu'il faut changer dans l'image, ou en tirer à partir de plusieurs).
   */
  subject: string
  /** Images de départ (à modifier, ou dont s'inspirer), en « data: » URI. */
  references?: string[]
  /** La première image de départ est un croquis (une sélection du canevas) : un guide de composition. */
  sketch?: boolean
  /** Contexte : ce que l'élément illustre (son parent, le titre du schéma). */
  context?: string
  style: ImageStyle
  /** Précision de style libre (« style libre »), facultative. */
  styleNote?: string
  aspect: AspectRatio
}

const RULES =
  'No text at all: no letters, words, numbers, captions or speech bubbles. No diagram, chart, map or arrows. Nothing violent or shocking.'

/** La consigne envoyée au modèle d'image. */
export function imagePrompt(req: ImageRequest): string {
  const style = req.style === 'free' && req.styleNote?.trim() ? req.styleNote.trim() : STYLE_TEXT[req.style]
  const refs = req.references?.length ?? 0
  if (refs && req.sketch) {
    // Une sélection du canevas (dessins, boîtes, flèches) : la composition, pas ce qu'il faut recopier.
    return [
      `The reference image is a rough sketch drawn on a whiteboard (shapes, lines, arrows, handwritten words). Use it only as a guide for the composition: where things are, their shapes, sizes and relations. Draw a finished illustration for a lesson as follows: ${req.subject.trim()}`,
      req.context?.trim() ? `It illustrates this idea: ${req.context.trim()}` : '',
      `Style: ${style}.`,
      `Rules: do not copy the sketch's boxes, arrows or words: turn them into what they stand for. ${RULES} Do not depict any real, identifiable person.`,
    ]
      .filter(Boolean)
      .join('\n\n')
  }
  if (refs) {
    // Modifier une image, ou en composer une à partir de plusieurs : la consigne de l'utilisateur.
    return [
      refs === 1
        ? `Edit the reference image as follows: ${req.subject.trim()}\n\nChange only what is asked; keep the rest as it is (composition, figures, style), unless asked otherwise.`
        : `Using the ${refs} reference images (in the order given), make one illustration for a lesson as follows: ${req.subject.trim()}`,
      req.context?.trim() ? `It illustrates this idea: ${req.context.trim()}` : '',
      refs > 1 ? `Style: ${style}.` : '',
      `Rules: ${RULES} Never change the face, the expression or the gestures of a real person, nor put a real person into a scene: an edit concerns the scene, not who is in it.`,
    ]
      .filter(Boolean)
      .join('\n\n')
  }
  return [
    `Draw an illustration for a lesson: ${req.subject.trim()}`,
    req.context?.trim() ? `It illustrates this idea: ${req.context.trim()}` : '',
    `Style: ${style}.`,
    `Rules: the scene is imaginary (a thought experiment, an analogy, an invented case): show it simply, so that it reads at a glance, even small. ${RULES} Do not depict any real, identifiable person, and do not imitate an existing artwork or photograph.`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Corps de la demande (point d'accès /images d'OpenRouter, le même pour tous les modèles d'image) :
 * une image, en JPEG de taille moyenne (« 1K ») pour ne pas alourdir le document.
 */
export function imageRequestBody(model: string, req: ImageRequest) {
  return {
    model,
    prompt: imagePrompt(req),
    ...(req.references?.length && { input_references: req.references.map((url) => ({ type: 'image_url', image_url: { url } })) }),
    aspect_ratio: req.aspect,
    resolution: '1K',
    output_format: 'jpeg',
    output_compression: 85,
    n: 1,
  }
}

interface ImageAnswer {
  data?: { b64_json?: string; url?: string }[]
  usage?: { cost?: number }
  error?: { message?: string }
}

/** Type d'une image en base64, d'après ses premiers octets (le format demandé n'est pas toujours suivi). */
function mimeOf(b64: string): string {
  if (b64.startsWith('iVBOR')) return 'image/png'
  if (b64.startsWith('UklGR')) return 'image/webp'
  if (b64.startsWith('R0lGOD')) return 'image/gif'
  return 'image/jpeg'
}

/** Réponse du modèle → l'image (« data: » URI) et son coût s'il est donné ; sans image : une erreur. */
export function readImageResponse(body: unknown): { dataUri: string; cost?: number } {
  const answer = body as ImageAnswer
  const b64 = answer.data?.find((d) => d.b64_json)?.b64_json
  if (!b64) throw new AiError('empty', (answer.error?.message || 'No image in the answer').slice(0, 300))
  return { dataUri: `data:${mimeOf(b64)};base64,${b64}`, ...(typeof answer.usage?.cost === 'number' && { cost: answer.usage.cost }) }
}

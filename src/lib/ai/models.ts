// Catalogue des modèles proposés (src/lib/ai/models.json, à modifier librement) : suggestions des
// réglages de l'IA (OpenRouter), et modèles permis pour l'IA de l'instance.

import catalog from './models.json'

export interface ModelInfo {
  id: string
  label: string
  /** Dollars par million de jetons, pour information. */
  price?: { input: number; output: number }
}

export const DEFAULT_MODEL: string = catalog.default
/** Modèle multimodal qui transcrit photos et PDF scannés, et lit par défaut les images du schéma. */
export const TRANSCRIPTION_MODEL: string = catalog.transcription
export const MODELS: ModelInfo[] = catalog.models

/** Modèle qui dessine une image. */
export interface ImageModelInfo {
  id: string
  label: string
  /** Coût approximatif d'une image (dollars), pour information. */
  perImage?: number
}
/** Modèle d'image par défaut, et ceux qu'on peut choisir (et que l'instance permet). */
export const IMAGE_MODEL: string = catalog.image
export const IMAGE_MODELS: ImageModelInfo[] = catalog.imageModels

const modelInfo = (model: string) => MODELS.find((m) => m.id === model || model.startsWith(`${m.id}-`))

/** Coût estimé d'une demande (dollars), d'après les prix du catalogue, si le modèle y figure. */
export function estimatedCost(model: string | undefined, usage: { promptTokens?: number; completionTokens?: number }): number | undefined {
  const price = model ? modelInfo(model)?.price : undefined
  if (!price || (usage.promptTokens === undefined && usage.completionTokens === undefined)) return undefined
  return ((usage.promptTokens ?? 0) * price.input + (usage.completionTokens ?? 0) * price.output) / 1_000_000
}

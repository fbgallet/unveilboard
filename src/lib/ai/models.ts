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
/** Modèle multimodal qui transcrit photos et PDF scannés. */
export const TRANSCRIPTION_MODEL: string = catalog.transcription
export const MODELS: ModelInfo[] = catalog.models

/** Coût estimé d'une demande (dollars), d'après les prix du catalogue, si le modèle y figure. */
export function estimatedCost(model: string | undefined, usage: { promptTokens?: number; completionTokens?: number }): number | undefined {
  const price = model ? MODELS.find((m) => m.id === model || model.startsWith(`${m.id}-`))?.price : undefined
  if (!price || (usage.promptTokens === undefined && usage.completionTokens === undefined)) return undefined
  return ((usage.promptTokens ?? 0) * price.input + (usage.completionTokens ?? 0) * price.output) / 1_000_000
}

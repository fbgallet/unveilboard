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

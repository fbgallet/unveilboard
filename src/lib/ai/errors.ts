// Erreurs d'un appel à une IA, classées pour choisir le message et la conduite à tenir
// (libellés dans src/i18n, t.ai.errors).

export type AiErrorKind =
  /** Serveur injoignable : hors ligne, serveur local éteint, ou refusé par CORS (indiscernables). */
  | 'unreachable'
  /** Clé absente, invalide ou révoquée. */
  | 'auth'
  /** Crédit épuisé (OpenRouter : 402). */
  | 'credits'
  /** Trop de requêtes (fournisseur, ou limites de cette instance). */
  | 'rate_limit'
  /** Modèle inconnu ou indisponible. */
  | 'model'
  /** Demande trop longue pour le modèle. */
  | 'context'
  /** Réponse inutilisable, même après une demande de correction. */
  | 'invalid_output'
  /** Réponse vide. */
  | 'empty'
  /** Flux coupé avant la fin (fournisseur ou réseau). */
  | 'interrupted'
  /** Plus rien reçu depuis trop longtemps. */
  | 'timeout'
  /** Plafond de jetons atteint (réflexion comprise) : réponse tronquée. */
  | 'length'
  /** IA de l'instance non configurée ou désactivée. */
  | 'unavailable'
  /** ChatGPT : connexion absente, expirée ou retirée ; se reconnecter dans les réglages de l'IA. */
  | 'signin'
  /** ChatGPT : limite d'usage du forfait, ou de celle fixée pour Unveilboard, atteinte. */
  | 'usage_limit'
  /** ChatGPT : ce compte (ou son espace de travail) ne permet pas d'utiliser son forfait ici. */
  | 'not_eligible'
  | 'aborted'
  | 'server'

export class AiError extends Error {
  constructor(
    public kind: AiErrorKind,
    /** Détail technique (message du fournisseur), affiché en petit. */
    public detail?: string
  ) {
    super(detail ? `${kind}: ${detail}` : kind)
  }
}

/** Erreur d'après une réponse HTTP en échec (fournisseur compatible OpenAI, ou route /api/ai). */
export async function errorFromResponse(res: Response): Promise<AiError> {
  let detail = ''
  let kind: AiErrorKind | undefined
  try {
    const body = (await res.json()) as { error?: string | { message?: string; code?: unknown }; kind?: AiErrorKind; message?: string }
    // Route /api/ai : { kind, message } ; fournisseurs : { error: { message } } ou { error: "…" }.
    kind = body.kind
    detail = body.message ?? (typeof body.error === 'string' ? body.error : (body.error?.message ?? ''))
  } catch {
    detail = res.statusText
  }
  return new AiError(kind ?? kindFromStatus(res.status, detail), detail.slice(0, 500) || undefined)
}

export function kindFromStatus(status: number, detail = ''): AiErrorKind {
  const text = detail.toLowerCase()
  if (status === 401 || status === 403) return 'auth'
  if (status === 402) return 'credits'
  if (status === 429) return 'rate_limit'
  if (/context|too long|maximum.*tokens|token limit/.test(text)) return 'context'
  if (status === 404 || /model/.test(text)) return 'model'
  if (status === 413) return 'context'
  return 'server'
}

/** Erreur quelconque (réseau, annulation…) → AiError. */
export function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e
  if (e instanceof DOMException && e.name === 'AbortError') return new AiError('aborted')
  if (e instanceof TypeError) return new AiError('unreachable', e.message)
  return new AiError('server', e instanceof Error ? e.message : String(e))
}

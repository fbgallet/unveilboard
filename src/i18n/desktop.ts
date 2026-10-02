// Libellés propres à l'application de bureau (desktop/) : les schémas et les clés y sont enregistrés
// sur l'ordinateur, par l'application, et non « dans ce navigateur ». Seuls les libellés qui changent
// figurent ici ; ils remplacent ceux de la langue (voir messagesFor).

import type { Messages } from './en'
import type { Locale } from './config'

type DeepPartial<T> = { [K in keyof T]?: T[K] extends (...args: never[]) => unknown ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] }

export const DESKTOP_MESSAGES: Record<Locale, DeepPartial<Messages>> = {
  en: {
    home: { localNotice: { strong: 'on this computer only' } },
    landing: { privacy: 'No account needed. Your diagrams stay on your computer.' },
    sync: { savedLocal: 'Saved on this computer only' },
    errors: {
      storageFull: 'The app’s storage is full.',
      storageUnavailable: 'The app’s storage is unavailable.',
    },
    ai: {
      providerHints: {
        openrouter: 'Hundreds of models, paid per use with your OpenRouter credit. Your key stays on this computer and goes straight to OpenRouter.',
        custom: 'A model running on your computer or network, or any provider compatible with the OpenAI API, called directly by the app.',
      },
      keyWarning:
        'Your key stays on this computer and goes straight to the provider, never through Unveilboard. But anyone using this computer could use it: create a key just for Unveilboard, with a spending limit and an expiry date, and don’t remember it on a shared computer.',
      remember: 'Remember the key on this computer (otherwise, until the app is closed)',
      corsHint: (origin: string) =>
        `The app calls this server directly: it must accept the app’s origin, ${origin}. Ollama: start it with OLLAMA_ORIGINS=${origin} (and a large enough context, num_ctx). LM Studio: enable CORS in the server settings.`,
    },
  },
  fr: {
    home: { localNotice: { strong: 'sur cet ordinateur uniquement' } },
    landing: { privacy: 'Sans compte. Vos schémas restent sur votre ordinateur.' },
    sync: { savedLocal: 'Enregistré sur cet ordinateur uniquement' },
    errors: {
      storageFull: 'Espace de stockage de l’application plein.',
      storageUnavailable: 'Stockage de l’application indisponible.',
    },
    ai: {
      providerHints: {
        openrouter: 'Des centaines de modèles, payés à l’usage avec votre crédit OpenRouter. Votre clé reste sur cet ordinateur et part directement chez OpenRouter.',
        custom: 'Un modèle qui tourne sur votre ordinateur ou votre réseau, ou tout fournisseur compatible avec l’API d’OpenAI, appelé directement par l’application.',
      },
      keyWarning:
        'Votre clé reste sur cet ordinateur et part directement chez le fournisseur, sans passer par Unveilboard. Mais quiconque utilise cet ordinateur pourrait s’en servir : créez une clé réservée à Unveilboard, avec une limite de dépense et une date d’expiration, et ne la retenez pas sur un ordinateur partagé.',
      remember: 'Retenir la clé sur cet ordinateur (sinon, jusqu’à la fermeture de l’application)',
      corsHint: (origin: string) =>
        `L’application appelle ce serveur directement : il doit accepter son origine, ${origin}. Ollama : lancez-le avec OLLAMA_ORIGINS=${origin} (et un contexte assez grand, num_ctx). LM Studio : activez CORS dans les réglages du serveur.`,
    },
  },
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype

/** Copie de `base` où les libellés de `patch` remplacent les siens, à toute profondeur. */
export function withOverrides<T>(base: T, patch: DeepPartial<T>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? withOverrides(out[key], value) : value
  }
  return out as T
}

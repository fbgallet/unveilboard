// Modèles qui voient les images : demandé à OpenRouter, modèle par modèle (ses entrées, dans
// /models/{id}/endpoints), et gardé sur l'appareil une semaine. Un modèle dont on ne sait rien
// (pas encore demandé, serveur injoignable, autre fournisseur) est tenu pour aveugle : il travaille
// sur la lecture des images.

import { atom } from 'tldraw'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1'
const KEY = 'openrouter-vision'
const TTL = 7 * 24 * 3600 * 1000

type Known = Record<string, { image: boolean; at: number }>

function load(): Known {
  try {
    const known = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Known
    return Object.fromEntries(Object.entries(known).filter(([, v]) => Date.now() - v.at < TTL))
  } catch {
    return {}
  }
}

/** Ce qu'on sait des modèles demandés. */
export const visionAtom = atom<Known>('vision', typeof window === 'undefined' ? {} : load())

/** Identifiant sans variante (« :free », « :batch »), comme OpenRouter range ses modèles. */
const baseId = (model: string) => model.split(':')[0]

/** Le modèle voit les images : true, false, ou undefined (on ne le sait pas encore). */
export function knownVision(model: string | undefined): boolean | undefined {
  return model ? visionAtom.get()[baseId(model)]?.image : undefined
}

const pending = new Map<string, Promise<boolean | undefined>>()

/** Demande à OpenRouter si le modèle voit les images (une fois par semaine et par modèle). */
export function checkVision(model: string | undefined): Promise<boolean | undefined> {
  if (!model) return Promise.resolve(undefined)
  const id = baseId(model)
  const known = knownVision(id)
  if (known !== undefined) return Promise.resolve(known)
  let request = pending.get(id)
  if (!request) {
    request = (async () => {
      try {
        const res = await fetch(`${OPENROUTER_URL}/models/${id}/endpoints`)
        if (!res.ok) return undefined
        const body = (await res.json()) as { data?: { architecture?: { input_modalities?: string[] } } }
        const modalities = body.data?.architecture?.input_modalities
        if (!Array.isArray(modalities)) return undefined
        const image = modalities.includes('image')
        const next = { ...visionAtom.get(), [id]: { image, at: Date.now() } }
        visionAtom.set(next)
        try {
          localStorage.setItem(KEY, JSON.stringify(next))
        } catch {
          // stockage indisponible : on redemandera
        }
        return image
      } catch {
        return undefined
      } finally {
        pending.delete(id)
      }
    })()
    pending.set(id, request)
  }
  return request
}

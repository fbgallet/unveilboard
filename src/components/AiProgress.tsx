'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/i18n/client'
import type { CallOptions } from '@/lib/ai/client'

/**
 * Progression d'une demande à l'IA : réflexion (aucun mot de la réponse encore, que la réflexion
 * soit transmise ou non), écriture (les éléments déjà écrits), correction (réponse renvoyée une fois
 * au modèle), avec le temps écoulé.
 */
export interface AiProgressState {
  started: number
  /** Caractères de la réponse reçus. */
  text: number
  /** Caractères de réflexion reçus (quand le fournisseur la transmet). */
  thinking: number
  /** Éléments déjà écrits dans la réponse (opérations « add »). */
  added: number
  repairing: boolean
}

export const startProgress = (): AiProgressState => ({ started: Date.now(), text: 0, thinking: 0, added: 0, repairing: false })

/** Éléments ajoutés déjà écrits dans une réponse en cours (« unveilboard/patch »). */
export const countAdded = (answer: string) => answer.match(/"op"\s*:\s*"add"/g)?.length ?? 0

/** Suivi d'un appel : met à jour la progression à chaque morceau reçu, et à la demande de correction. */
export function progressCallbacks(update: (next: (p: AiProgressState) => AiProgressState) => void): Pick<CallOptions, 'onText' | 'onRepair'> {
  return {
    onText: (answer, thinking) => update((p) => ({ ...p, text: answer.length, thinking, added: countAdded(answer) })),
    onRepair: () => update((p) => ({ ...p, repairing: true })),
  }
}

export function AiProgress({ state }: { state: AiProgressState }) {
  const t = useT()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.round((now - state.started) / 1000))
  const p = t.ai.progress
  const phase = state.text === 0 ? p.thinking(state.thinking) : state.added > 0 ? p.writing(state.added) : p.writingText(state.text)
  return (
    <span className="text-xs text-zinc-600" role="status">
      {state.repairing && <>{p.repairing} · </>}
      {phase} · {p.seconds(seconds)}
    </span>
  )
}

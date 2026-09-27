// Une demande à l'IA, avec au plus une demande de correction : si la réponse ne passe pas les
// contrôles, on la renvoie au modèle avec les problèmes trouvés. Pur : l'envoi et le contrôle sont
// fournis par l'appelant (navigateur, serveur, tests).

import { formatIssue, type MapIssue } from '../map/check'
import type { ChatMessage, ChatResult, ChatUsage } from './chat'
import { repairMessage } from './prompts'

export interface Repair {
  /** Réponse précédente du modèle. */
  answer: string
  /** Problèmes trouvés, en anglais. */
  problems: string[]
}

export interface AiRun<R> {
  /** Dernière réponse du modèle. */
  text: string
  result: R
  model?: string
  /** Consommation cumulée des appels. */
  usage: ChatUsage
  /** 1, ou 2 après une demande de correction. */
  attempts: number
}

export async function runWithRepair<R extends { ok: boolean; issues: MapIssue[] }>(
  send: (repair?: Repair) => Promise<ChatResult>,
  /** Contrôle d'une réponse ; `attempt` : 1, puis 2 après correction (on peut y être moins strict). */
  check: (text: string, attempt: number) => R
): Promise<AiRun<R>> {
  const first = await send()
  const firstResult = check(first.text, 1)
  if (firstResult.ok) return { text: first.text, result: firstResult, model: first.model, usage: first.usage ?? {}, attempts: 1 }
  const problems = firstResult.issues.filter((i) => i.level === 'error').map(formatIssue).slice(0, 40)
  const second = await send({ answer: first.text, problems })
  return {
    text: second.text,
    result: check(second.text, 2),
    model: second.model ?? first.model,
    usage: addUsage(first.usage, second.usage),
    attempts: 2,
  }
}

function addUsage(a: ChatUsage = {}, b: ChatUsage = {}): ChatUsage {
  const sum = (x?: number, y?: number) => (x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0))
  return { promptTokens: sum(a.promptTokens, b.promptTokens), completionTokens: sum(a.completionTokens, b.completionTokens), cost: sum(a.cost, b.cost) }
}

/** Messages d'une demande : la consigne, puis, pour une correction, la réponse et les problèmes. */
export function chatMessages(prompt: string, repair?: Repair): ChatMessage[] {
  return [
    { role: 'user', content: prompt },
    ...(repair ? [{ role: 'assistant' as const, content: repair.answer }, { role: 'user' as const, content: repairMessage(repair.problems) }] : []),
  ]
}

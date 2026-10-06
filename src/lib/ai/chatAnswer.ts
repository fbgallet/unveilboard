// Conversation de l'onglet Chat, partie pure : lire une réponse du modèle (un message, et au besoin
// des modifications du schéma), la montrer pendant qu'elle arrive, et réécrire l'historique envoyé.

import { extractJson } from '../map/read'
import { MAX_CHAT_HISTORY, type ChatTurn } from './prompts'

/** Réponse du modèle : son message (Markdown) et, s'il modifie le schéma, les modifications (non contrôlées). */
export interface ChatAnswer {
  reply: string
  patch?: unknown
}

/**
 * Lit une réponse : l'objet JSON demandé ({ reply, patch? }). Un modèle qui a répondu en texte
 * libre, sans JSON, a seulement parlé : son texte est le message. Un JSON sans `reply` qui est
 * lui-même des modifications est accepté aussi (message vide).
 */
export function readChatAnswer(text: string): ChatAnswer {
  const json = extractJson(text)
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const obj = json as Record<string, unknown>
    if (typeof obj.reply === 'string' || obj.patch !== undefined) {
      return { reply: typeof obj.reply === 'string' ? obj.reply : '', ...(obj.patch != null && { patch: obj.patch }) }
    }
    if (obj.format === 'unveilboard/patch') return { reply: '', patch: obj }
  }
  return { reply: looksLikeJson(text) ? '' : text.trim() }
}

function looksLikeJson(text: string) {
  const t = text.trim()
  return t.startsWith('{') || t.startsWith('```')
}

/**
 * Message en cours d'arrivée : le début de la chaîne `reply` du JSON, décodé (échappements compris),
 * ou le texte tel quel si le modèle ne répond pas en JSON.
 */
export function partialReply(text: string): string {
  const start = text.match(/"reply"\s*:\s*"/)
  if (!start) return looksLikeJson(text) ? '' : text
  let out = ''
  for (let i = start.index! + start[0].length; i < text.length; i++) {
    const c = text[i]
    if (c === '"') break
    if (c !== '\\') {
      out += c
      continue
    }
    const next = text[i + 1]
    if (next === undefined) break
    if (next === 'u') {
      const hex = text.slice(i + 2, i + 6)
      if (hex.length < 4) break
      out += String.fromCharCode(parseInt(hex, 16))
      i += 5
      continue
    }
    out += ({ n: '\n', t: '\t', r: '', b: '', f: '' } as Record<string, string>)[next] ?? next
    i++
  }
  return out
}

/** Ce que sont devenues des modifications proposées dans la conversation. */
export type ChangeStatus = 'applied' | 'undone' | 'suggested' | 'failed'

/** Un message de la conversation, tel qu'il est gardé (sans les modifications elles-mêmes). */
export interface ChatEntryForModel {
  role: 'user' | 'assistant'
  text: string
  changes?: { summary: string; status: ChangeStatus }
}

/**
 * Messages précédents, pour le modèle : ceux de l'utilisateur tels quels ; les siens en JSON
 * compact, ses modifications remplacées par leur résumé et ce qu'elles sont devenues (le schéma
 * actuel, dans la consigne, dit le reste). Les plus anciens sont laissés de côté.
 */
export function historyForModel(entries: ChatEntryForModel[]): ChatTurn[] {
  return entries.slice(-MAX_CHAT_HISTORY).map((e) =>
    e.role === 'user'
      ? { role: 'user', content: e.text }
      : { role: 'assistant', content: JSON.stringify({ reply: e.text, ...(e.changes && { changes: e.changes }) }) }
  )
}

/** Texte d'un message hors du chat (note, presse-papiers) : les références « el:… » deviennent du texte. */
export function plainRefs(text: string): string {
  return text.replace(/\[([^\]]*)\]\(el:[\w-]+\)/g, '$1')
}

/**
 * La conversation en Markdown : un titre par message (« Vous », « IA »), et sous les réponses qui ont
 * modifié le schéma, le résumé des modifications et ce qu'elles sont devenues.
 */
export function conversationMarkdown(
  entries: (ChatEntryForModel & { error?: string })[],
  labels: { user: string; ai: string; status: Record<ChangeStatus, string> }
): string {
  return entries
    .map((e) => {
      const lines = [`## ${e.role === 'user' ? labels.user : labels.ai}`, plainRefs(e.text || e.error || '').trim()]
      if (e.changes) lines.push(`> ${labels.status[e.changes.status]}${e.changes.summary ? ` · ${e.changes.summary}` : ''}`)
      return lines.filter(Boolean).join('\n\n')
    })
    .join('\n\n')
    .concat('\n')
}

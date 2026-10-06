// Conversation de l'onglet Chat : les messages, gardés sur cet appareil par schéma (localStorage,
// comme la relecture : ni dans le document ni dans les partages), et les modifications de l'IA,
// appliquées aussitôt et annulables une à une, même après d'autres changements du schéma.

import { atom, type Editor, type TLRecord, type TLShapeId } from 'tldraw'
import type { ChangeStatus, ChatEntryForModel } from '../ai/chatAnswer'
import type { MapPatch } from '../map/patch'
import { exportMap } from './mapExport'
import { applyPatch } from './mapPatch'

export interface ChatEntry extends ChatEntryForModel {
  id: string
  /** Horodatage (ms). */
  at: number
  /** Modifications proposées par l'IA, et ce qu'elles sont devenues. */
  changes?: { summary: string; status: ChangeStatus; operations: number; skipped?: number; warnings?: number }
  /** Échec de la demande (message déjà traduit). */
  error?: string
}

export const chatEntriesAtom = atom<ChatEntry[]>('chatEntries', [])
/** Document ouvert (clé de la conversation gardée). */
const chatDocAtom = atom<string | null>('chatDoc', null)
/** Ajouts de l'IA en suggestions à accepter ou écarter, plutôt qu'appliqués directement (cet appareil). */
export const chatGhostAtom = atom<boolean>('chatGhost', readGhost())

const key = (docId: string) => `chat:${docId}`

function readGhost() {
  try {
    return localStorage.getItem('chatGhost') === 'true'
  } catch {
    return false
  }
}

export function setChatGhost(on: boolean) {
  chatGhostAtom.set(on)
  try {
    localStorage.setItem('chatGhost', String(on))
  } catch {
    // stockage indisponible : le choix vaut pour la séance
  }
}

/** Conversation gardée pour ce schéma (à l'ouverture du document). */
export function loadChat(docId: string) {
  chatDocAtom.set(docId)
  diffs.clear()
  try {
    const raw = JSON.parse(localStorage.getItem(key(docId)) ?? 'null') as unknown
    chatEntriesAtom.set(Array.isArray(raw) ? (raw as ChatEntry[]) : [])
  } catch {
    chatEntriesAtom.set([])
  }
}

function save(next: ChatEntry[]) {
  chatEntriesAtom.set(next)
  const docId = chatDocAtom.get()
  if (!docId) return
  try {
    if (next.length) localStorage.setItem(key(docId), JSON.stringify(next))
    else localStorage.removeItem(key(docId))
  } catch {
    // stockage indisponible (ou plein) : la conversation dure le temps de la séance
  }
}

export function addChatEntry(entry: Omit<ChatEntry, 'id' | 'at'>): ChatEntry {
  const full = { ...entry, id: crypto.randomUUID(), at: Date.now() }
  save([...chatEntriesAtom.get(), full])
  return full
}

/** Complète ce qu'on sait des modifications d'une réponse (statut, opérations ignorées, avertissements). */
export function updateChatChanges(id: string, patch: Partial<NonNullable<ChatEntry['changes']>>) {
  save(chatEntriesAtom.get().map((e) => (e.id === id && e.changes ? { ...e, changes: { ...e.changes, ...patch } } : e)))
}

/** Efface la conversation de ce schéma (sur cet appareil). Le schéma garde les modifications appliquées. */
export function clearChat() {
  diffs.clear()
  save([])
}

// ---------- Modifications ----------

type Diff = { added: Record<string, TLRecord>; updated: Record<string, [TLRecord, TLRecord]>; removed: Record<string, TLRecord> }

/**
 * Changements exacts de chaque réponse appliquée, pour l'annuler (et la rétablir), et son statut une
 * fois appliquée : le temps de la séance.
 */
const diffs = new Map<string, { diff: Diff; status: ChangeStatus }>()

/**
 * Applique les modifications d'une réponse (déjà contrôlées) : un seul pas d'historique, et leurs
 * changements gardés pour « Annuler ». `ghost` : les ajouts en suggestions, le reste ignoré.
 */
export function applyChatChanges(editor: Editor, entryId: string, patch: MapPatch, ghost: boolean): { skipped: number } {
  let skipped = 0
  const diff = editor.store.extractingChanges(() => {
    skipped = applyPatch(editor, patch, { ghost }).skipped
  }) as Diff
  diffs.set(entryId, { diff, status: ghost ? 'suggested' : 'applied' })
  return { skipped }
}

/** Ces modifications peuvent-elles encore être annulées ou rétablies (séance en cours) ? */
export function canRevert(entryId: string) {
  return diffs.has(entryId)
}

/**
 * Annule les modifications d'une réponse (ou les rétablit) en rejouant leurs changements à l'envers
 * (ou à l'endroit), en un pas d'historique : ce qui a changé depuis ailleurs dans le schéma reste.
 * Un objet supprimé depuis n'est pas recréé pour être modifié.
 */
export function revertChatChanges(editor: Editor, entryId: string, undo: boolean) {
  const kept = diffs.get(entryId)
  if (!kept) return
  const step = undo ? reverse(kept.diff) : kept.diff
  const has = (id: string) => editor.store.has(id as TLRecord['id'])
  editor.markHistoryStoppingPoint(undo ? 'annuler les modifications du chat' : 'rétablir les modifications du chat')
  editor.run(() => {
    const removed = Object.keys(step.removed).filter(has)
    const added = Object.values(step.added).filter((r) => !has(r.id))
    const updated = Object.values(step.updated)
      .filter(([, to]) => has(to.id))
      .map(([, to]) => to)
    // Les formes avant leurs liaisons (flèches), et les liaisons supprimées avant leurs formes.
    editor.store.remove(removed.filter((id) => id.startsWith('binding:')) as TLRecord['id'][])
    editor.store.remove(removed.filter((id) => !id.startsWith('binding:')) as TLRecord['id'][])
    editor.store.put([...added.filter((r) => r.typeName !== 'binding'), ...updated])
    editor.store.put(added.filter((r) => r.typeName === 'binding'))
  })
  updateChatChanges(entryId, { status: undo ? 'undone' : kept.status })
}

function reverse(diff: Diff): Diff {
  const updated: Diff['updated'] = {}
  for (const [id, [from, to]] of Object.entries(diff.updated)) updated[id] = [to, from]
  return { added: diff.removed, updated, removed: diff.added }
}

// ---------- Références ----------

/** Forme désignée par un identifiant du schéma (« el:… » dans les messages de l'IA), suggestions comprises. */
export function shapeOfRef(editor: Editor, ref: string): TLShapeId | null {
  const node = exportMap(editor).shapes.get(ref)?.node
  if (node && editor.getShape(node as TLShapeId)) return node as TLShapeId
  return editor.getCurrentPageShapes().find((s) => s.meta.ref === ref)?.id ?? null
}

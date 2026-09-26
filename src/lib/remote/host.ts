// Télécommande, côté ordinateur : un pair PeerJS attend le téléphone, lui envoie l'état de la
// présentation et rejoue ses commandes comme des touches (même chemin que le clavier).

import type { DataConnection, Peer } from 'peerjs'
import { atom, react, type Editor } from 'tldraw'
import { readSequence } from '@/lib/canvas/adapter'
import { modeAtom, presentationStartedAtAtom, stepIndexAtom } from '@/lib/presentation/store'
import {
  connectionKind,
  newHostId,
  REMOTE_CONNECT_TIMEOUT_MS,
  type ConnectionKind,
  type HostMessage,
  type PhoneMessage,
  type RemoteCommand,
  type RemoteState,
} from './protocol'

export type RemoteStatus =
  | { state: 'off' }
  | { state: 'starting' }
  | { state: 'waiting'; id: string }
  | { state: 'connecting'; id: string }
  | { state: 'connected'; id: string; kind: ConnectionKind }
  | { state: 'failed'; id?: string; reason: string }

export const remoteStatusAtom = atom<RemoteStatus>('remoteStatus', { state: 'off' })
export const remoteDialogOpenAtom = atom<boolean>('remoteDialogOpen', false)

/** Touches jouées pour chaque commande : PageUp / PageDown marchent aussi en mode déverrouillé. */
const KEYS: Record<RemoteCommand, string> = { next: 'PageDown', previous: 'PageUp', overview: 'o', recenter: 'c' }

let peer: Peer | null = null
let connection: DataConnection | null = null
let stopState: (() => void) | null = null

export async function startRemote(editor: Editor) {
  if (peer && !peer.destroyed) return
  remoteStatusAtom.set({ state: 'starting' })
  const { Peer } = await import('peerjs')
  const id = newHostId()
  const p = new Peer(id, { debug: 0 })
  peer = p

  p.on('open', () => remoteStatusAtom.set({ state: 'waiting', id }))
  p.on('disconnected', () => {
    // Perte du service de mise en relation : la connexion au téléphone, directe, peut continuer.
    if (!p.destroyed) p.reconnect()
  })
  p.on('error', (err) => {
    // « peer-unavailable » et consorts concernent un téléphone ; les autres, le service lui-même.
    if (remoteStatusAtom.get().state === 'connected') return
    remoteStatusAtom.set({ state: 'failed', id, reason: String((err as { type?: string }).type ?? err.message) })
  })
  p.on('connection', (conn) => {
    // Un seul téléphone : le dernier arrivé remplace le précédent.
    connection?.close()
    connection = conn
    remoteStatusAtom.set({ state: 'connecting', id })
    const timeout = setTimeout(() => {
      if (!conn.open) remoteStatusAtom.set({ state: 'failed', id, reason: 'ice' })
    }, REMOTE_CONNECT_TIMEOUT_MS)

    conn.on('open', async () => {
      clearTimeout(timeout)
      send(editor)
      remoteStatusAtom.set({ state: 'connected', id, kind: await connectionKind(conn.peerConnection) })
    })
    conn.on('data', (data) => {
      const message = data as PhoneMessage
      if (message?.type !== 'command' || !(message.command in KEYS)) return
      window.dispatchEvent(new KeyboardEvent('keydown', { key: KEYS[message.command] }))
    })
    conn.on('close', () => {
      clearTimeout(timeout)
      if (connection === conn) {
        connection = null
        if (!p.destroyed) remoteStatusAtom.set({ state: 'waiting', id })
      }
    })
    conn.on('error', () => {
      if (!conn.open) remoteStatusAtom.set({ state: 'failed', id, reason: 'ice' })
    })
  })

  stopState?.()
  stopState = react('remote state', () => {
    // Dépendances suivies : étape, mode, document (titres et narration).
    stepIndexAtom.get()
    modeAtom.get()
    presentationStartedAtAtom.get()
    readSequence(editor)
    send(editor)
  })
}

export function stopRemote() {
  stopState?.()
  stopState = null
  connection?.close()
  connection = null
  peer?.destroy()
  peer = null
  remoteStatusAtom.set({ state: 'off' })
}

function send(editor: Editor) {
  if (!connection?.open) return
  const message: HostMessage = { type: 'state', state: remoteState(editor) }
  connection.send(message)
}

function remoteState(editor: Editor): RemoteState {
  const seq = readSequence(editor)
  const index = stepIndexAtom.get()
  const step = seq?.steps[index]
  return {
    presenting: modeAtom.get() === 'present',
    title: seq?.title ?? '',
    index,
    total: seq?.steps.length ?? 0,
    stepTitle: step?.title ?? '',
    narration: step?.narration ?? '',
    nextTitle: seq?.steps[index + 1]?.title ?? null,
    elapsedMs: Date.now() - presentationStartedAtAtom.get(),
  }
}

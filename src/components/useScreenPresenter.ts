'use client'

import { useEffect } from 'react'
import { react, type Editor } from 'tldraw'
import {
  laserSettingsAtom,
  legendVisibleAtom,
  liveSpotAtom,
  modeAtom,
  narrationScaleAtom,
  openedNotesAtom,
  activeNoteAtom,
  overviewAtom,
  recenterAtom,
  stepIndexAtom,
} from '@/lib/presentation/store'
import {
  SCREEN_TIMEOUT_MS,
  screenChannelName,
  screenConnectedAtom,
  screenNarrationAtom,
  type ScreenMessage,
  type ScreenState,
} from '@/lib/presentation/screen'

/**
 * Fenêtre du présentateur : diffuse l'état de la présentation et les traces du laser à la fenêtre
 * public, et rejoue chez elle les touches pressées dans la fenêtre public.
 */
export function useScreenPresenter(editor: Editor, docId: string) {
  useEffect(() => {
    const channel = new BroadcastChannel(screenChannelName(docId))
    const post = (message: ScreenMessage) => channel.postMessage(message)
    const state = (): ScreenState => ({
      presenting: modeAtom.get() === 'present',
      pageId: editor.getCurrentPageId(),
      stepIndex: stepIndexAtom.get(),
      overview: overviewAtom.get(),
      recenter: recenterAtom.get(),
      liveSpot: liveSpotAtom.get(),
      openedNotes: openedNotesAtom.get(),
      activeNote: activeNoteAtom.get(),
      legend: legendVisibleAtom.get(),
      narration: screenNarrationAtom.get(),
      narrationScale: narrationScaleAtom.get(),
      laser: laserSettingsAtom.get(),
    })

    let lastSeen = 0
    channel.onmessage = (e: MessageEvent<ScreenMessage>) => {
      const message = e.data
      if (message.type === 'hello') {
        const wasConnected = screenConnectedAtom.get()
        lastSeen = Date.now()
        screenConnectedAtom.set(true)
        if (!wasConnected) post({ type: 'state', state: state() })
      } else if (message.type === 'bye') {
        screenConnectedAtom.set(false)
      } else if (message.type === 'key') {
        // Même traitement que si la touche avait été pressée ici (usePresentation écoute window).
        window.dispatchEvent(new KeyboardEvent('keydown', { key: message.key, shiftKey: message.shiftKey }))
      }
    }
    const watchdog = setInterval(() => {
      if (screenConnectedAtom.get() && Date.now() - lastSeen > SCREEN_TIMEOUT_MS) screenConnectedAtom.set(false)
    }, 1000)

    // Chaque changement d'état part aussitôt (tout le monde reçoit l'état complet : pas de désynchronisation).
    const stopState = react('screen state', () => post({ type: 'state', state: state() }))
    // Traces du laser : recopiées telles quelles (coordonnées de page), fondu compris.
    let lastScribbles = '[]'
    const stopLaser = react('screen laser', () => {
      const scribbles = editor.getInstanceState().scribbles.filter((s) => s.color === 'laser')
      const json = JSON.stringify(scribbles)
      // L'état de l'instance change pour bien d'autres raisons : on n'envoie que les traces modifiées.
      if (json === lastScribbles || modeAtom.get() !== 'present') return
      lastScribbles = json
      post({ type: 'scribbles', scribbles })
    })

    return () => {
      post({ type: 'state', state: { ...state(), presenting: false } })
      stopState()
      stopLaser()
      clearInterval(watchdog)
      channel.close()
      screenConnectedAtom.set(false)
    }
  }, [editor, docId])
}

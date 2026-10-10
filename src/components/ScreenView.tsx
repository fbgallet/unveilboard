'use client'

import { useEffect, useState } from 'react'
import { Tldraw, useValue, type Editor, type TLComponents, type TLPageId } from 'tldraw'
import 'tldraw/tldraw.css'
import { useT } from '@/i18n/client'
import { LaserOverlayUtil } from '@/lib/canvas/laser'
import { SpotlightShapeUtil } from '@/lib/canvas/spotlight'
import {
  foldOverridesAtom,
  laserSettingsAtom,
  legendVisibleAtom,
  liveSpotAtom,
  modeAtom,
  narrationScaleAtom,
  narrationVisibleAtom,
  openedNotesAtom,
  activeNoteAtom,
  overviewAtom,
  recenterAtom,
  remoteScribblesAtom,
  stepIndexAtom,
  stageViewAtom,
  viewerAtom,
} from '@/lib/presentation/store'
import { SCREEN_HEARTBEAT_MS, screenChannelName, type ScreenMessage, type ScreenState } from '@/lib/presentation/screen'
import { PresShapeWrapper } from './PresShapeWrapper'
import { Legend, NarrationPanel, NoteMarkers } from './PresenterUI'
import { SpotlightOverlay } from './SpotlightOverlay'
import { FoldBadges } from './TreeTools'
import { toggleFullscreen, usePresentation } from './usePresentation'
import { LogoMark } from './Logo'

// Fenêtre « public » du double affichage (projecteur) : le document, lu dans le cache local de tldraw
// que partage la fenêtre du présentateur, en lecture seule ; l'état de la présentation vient du
// présentateur (src/lib/presentation/screen.ts). Rien n'est enregistré d'ici.

const overlayUtils = [LaserOverlayUtil]
const shapeUtils = [SpotlightShapeUtil]

function CanvasBadges() {
  return (
    <>
      <FoldBadges readOnly />
      <NoteMarkers />
    </>
  )
}

const components: TLComponents = {
  ShapeWrapper: PresShapeWrapper,
  OnTheCanvas: CanvasBadges,
  InFrontOfTheCanvas: SpotlightOverlay,
}

export default function ScreenView({ docId, licenseKey }: { docId: string; licenseKey?: string }) {
  const t = useT()
  const [editor, setEditor] = useState<Editor | null>(null)
  const [presenting, setPresenting] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const dark = useValue('dark mode', () => editor?.user.getIsDarkMode() ?? false, [editor])

  useEffect(() => {
    viewerAtom.set(true)
    narrationVisibleAtom.set(false)
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => {
      viewerAtom.set(false)
      document.removeEventListener('fullscreenchange', onFullscreen)
    }
  }, [])

  useEffect(() => {
    if (!editor) return
    if (process.env.NODE_ENV === 'development') Object.assign(window, { editor })
    const channel = new BroadcastChannel(screenChannelName(docId))
    const post = (message: ScreenMessage) => channel.postMessage(message)
    channel.onmessage = (e: MessageEvent<ScreenMessage>) => {
      const message = e.data
      if (message.type === 'state') {
        apply(editor, message.state)
        setPresenting(message.state.presenting)
      } else if (message.type === 'scribbles') {
        remoteScribblesAtom.set(message.scribbles)
      }
    }
    post({ type: 'hello' })
    const heartbeat = setInterval(() => post({ type: 'hello' }), SCREEN_HEARTBEAT_MS)
    const bye = () => post({ type: 'bye' })
    window.addEventListener('pagehide', bye)

    // Les touches pressées ici (télécommande, clavier) sont jouées chez le présentateur, sauf F.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
      else post({ type: 'key', key: e.key, shiftKey: e.shiftKey })
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })

    return () => {
      bye()
      clearInterval(heartbeat)
      window.removeEventListener('pagehide', bye)
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      channel.close()
    }
  }, [editor, docId])

  return (
    <div
      className="studio screen-view relative flex h-dvh w-full overflow-hidden"
      data-mode="present"
      data-unlocked="false"
      data-theme={dark ? 'dark' : 'light'}
    >
      <div className="relative min-w-0 flex-1">
        <Tldraw
          // Même cache local que la fenêtre du présentateur : les retouches en direct apparaissent ici.
          persistenceKey={`doc:${docId}`}
          shapeUtils={shapeUtils}
          components={components}
          overlayUtils={overlayUtils}
          licenseKey={licenseKey}
          onMount={setEditor}
        />
        {editor && <Legend editor={editor} />}
        {!fullscreen && (
          <button className="btn-primary absolute bottom-4 left-1/2 z-[950] -translate-x-1/2 px-4 py-2" onClick={toggleFullscreen}>
            {t.screen.fullscreen}
          </button>
        )}
      </div>
      {editor && <PresentationHost editor={editor} />}
      {editor && presenting && <NarrationPanel editor={editor} />}
      {!presenting && (
        <div className="site absolute inset-0 z-[900] flex flex-col items-center justify-center gap-4">
          <LogoMark className="h-12 w-12" />
          <p className="text-stone-500">{t.screen.waiting}</p>
        </div>
      )}
    </div>
  )
}

function PresentationHost({ editor }: { editor: Editor }) {
  usePresentation(editor, { keyboard: false })
  return null
}

/** Reprend l'état du présentateur. L'étape d'abord : la changer referme les notes, qu'on rouvre ensuite. */
function apply(editor: Editor, state: ScreenState) {
  const page = state.pageId as TLPageId
  if (page && page !== editor.getCurrentPageId() && editor.getPage(page)) editor.setCurrentPage(page)
  modeAtom.set(state.presenting ? 'present' : 'edit')
  stepIndexAtom.set(state.stepIndex)
  overviewAtom.set(state.overview)
  recenterAtom.set(state.recenter)
  liveSpotAtom.set(state.liveSpot)
  openedNotesAtom.set(state.openedNotes)
  activeNoteAtom.set(state.activeNote ?? null)
  legendVisibleAtom.set(state.legend)
  narrationVisibleAtom.set(state.narration)
  narrationScaleAtom.set(state.narrationScale)
  laserSettingsAtom.set(state.laser)
  foldOverridesAtom.set(state.foldOverrides ?? {})
  stageViewAtom.set(state.view ?? 'sequence')
}

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Tldraw, useValue, type Editor, type TLComponents, type TLStoreSnapshot } from 'tldraw'
import 'tldraw/tldraw.css'
import { useLocale, useT } from '@/i18n/client'
import { LaserOverlayUtil } from '@/lib/canvas/laser'
import { SpotlightShapeUtil } from '@/lib/canvas/spotlight'
import { modeAtom, stepIndexAtom, viewerAtom } from '@/lib/presentation/store'
import { PresShapeWrapper } from './PresShapeWrapper'
import { Legend, NarrationPanel, NoteMarkers, ProgressBar } from './PresenterUI'
import { SpotlightOverlay } from './SpotlightOverlay'
import { FoldBadges } from './TreeTools'
import { enterPresentation, usePresentation } from './usePresentation'
import { LogoMark } from './Logo'
import { ShortcutsHelp } from './ShortcutsHelp'
import { ReportButton } from './ReportButton'

// Lecteur d'une présentation partagée : le document est chargé en mémoire (ni cache local, ni
// sauvegarde), en lecture seule, directement en mode présentation. Le lecteur avance à son rythme.

const overlayUtils = [LaserOverlayUtil]
const shapeUtils = [SpotlightShapeUtil]

function CanvasBadges() {
  return (
    <>
      <FoldBadges />
      <NoteMarkers />
    </>
  )
}

const components: TLComponents = {
  ShapeWrapper: PresShapeWrapper,
  OnTheCanvas: CanvasBadges,
  InFrontOfTheCanvas: SpotlightOverlay,
}

export default function Viewer({
  snapshot,
  licenseKey,
  reportShareId,
}: {
  snapshot: TLStoreSnapshot
  licenseKey?: string
  /** Présentation publiée sur ce serveur : bouton de signalement. */
  reportShareId?: string
}) {
  const t = useT()
  const [editor, setEditor] = useState<Editor | null>(null)
  const dark = useValue('dark mode', () => editor?.user.getIsDarkMode() ?? false, [editor])

  useEffect(() => {
    viewerAtom.set(true)
    return () => {
      viewerAtom.set(false)
      modeAtom.set('edit')
      stepIndexAtom.set(-1)
    }
  }, [])

  useEffect(() => {
    if (!editor) return
    if (process.env.NODE_ENV === 'development') Object.assign(window, { editor })
    enterPresentation()
  }, [editor])

  const [locale] = useLocale()
  useEffect(() => {
    editor?.user.updateUserPreferences({ locale })
  }, [editor, locale])

  return (
    <div className="studio flex h-dvh w-full overflow-hidden" data-mode="present" data-unlocked="false" data-theme={dark ? 'dark' : 'light'}>
      <div className="relative min-w-0 flex-1">
        <Tldraw
          snapshot={snapshot}
          shapeUtils={shapeUtils}
          components={components}
          overlayUtils={overlayUtils}
          licenseKey={licenseKey}
          onMount={setEditor}
        />
        <Link
          href="/"
          className="group pointer-events-auto absolute left-3 top-3 z-[500] flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          title={t.viewer.madeWith}
        >
          <LogoMark className="h-5 w-5" />
          Unveilboard
        </Link>
        {reportShareId && <ReportButton shareId={reportShareId} />}
        {editor && <ProgressBar editor={editor} />}
        {editor && <Legend editor={editor} />}
        <ShortcutsHelp />
      </div>
      {editor && <PresentationHost editor={editor} />}
      {editor && <NarrationPanel editor={editor} />}
    </div>
  )
}

function PresentationHost({ editor }: { editor: Editor }) {
  usePresentation(editor)
  return null
}

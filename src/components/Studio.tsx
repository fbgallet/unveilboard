'use client'

import { useEffect, useState } from 'react'
import { Tldraw, useValue, type Editor, type TLComponents } from 'tldraw'
import 'tldraw/tldraw.css'
import { LaserOverlayUtil } from '@/lib/canvas/laser'
import { SpotlightShapeUtil } from '@/lib/canvas/spotlight'
import { activeStepIdAtom, editUnlockedAtom, modeAtom, stepIndexAtom } from '@/lib/presentation/store'
import { assetStore } from '@/lib/sync/assetStore'
import { startCloudSync } from '@/lib/sync/cloudSync'
import { PresShapeWrapper } from './PresShapeWrapper'
import { StepBadges } from './StepBadges'
import { SequencePanel } from './SequencePanel'
import { NarrationPanel, ProgressBar } from './PresenterUI'
import { usePresentation } from './usePresentation'
import { QuickAssign } from './QuickAssign'
import { SyncBanner } from './SyncIndicator'
import { SpotlightOverlay } from './SpotlightOverlay'

const overlayUtils = [LaserOverlayUtil]
const shapeUtils = [SpotlightShapeUtil]

const components: TLComponents = {
  ShapeWrapper: PresShapeWrapper,
  OnTheCanvas: StepBadges,
  InFrontOfTheCanvas: SpotlightOverlay,
}

export default function Studio({ docId, seedDemo }: { docId: string; seedDemo: boolean }) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const mode = useValue(modeAtom)
  const unlocked = useValue(editUnlockedAtom)

  // Synchronisation avec le serveur, et remise à zéro de l'état de présentation en quittant le document.
  useEffect(() => {
    if (!editor) return
    // En développement : l'éditeur est accessible depuis la console et les tests Playwright.
    if (process.env.NODE_ENV === 'development') Object.assign(window, { editor })
    const stop = startCloudSync(editor, docId, { seedDemo })
    return () => {
      stop()
      modeAtom.set('edit')
      editUnlockedAtom.set(false)
      stepIndexAtom.set(-1)
      activeStepIdAtom.set(null)
    }
  }, [editor, docId, seedDemo])

  return (
    <div className="studio flex h-dvh w-full overflow-hidden" data-mode={mode} data-unlocked={unlocked}>
      <div className="relative min-w-0 flex-1">
        <Tldraw
          // Cache local (IndexedDB) propre à chaque document.
          persistenceKey={`doc:${docId}`}
          assets={assetStore}
          shapeUtils={shapeUtils}
          components={components}
          overlayUtils={overlayUtils}
          licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
          onMount={setEditor}
        />
        {editor && mode === 'present' && <ProgressBar editor={editor} />}
        {editor && mode === 'present' && unlocked && <QuickAssign editor={editor} />}
        {editor && <SyncBanner />}
      </div>
      {editor && <PresentationHost editor={editor} />}
      {editor && mode === 'edit' && <SequencePanel editor={editor} />}
      {editor && mode === 'present' && <NarrationPanel editor={editor} />}
    </div>
  )
}

function PresentationHost({ editor }: { editor: Editor }) {
  usePresentation(editor)
  return null
}

'use client'

import { useEffect, useState } from 'react'
import { Tldraw, useValue, type Editor, type TLComponents, type TLShape, type TLUiOverrides } from 'tldraw'
import 'tldraw/tldraw.css'
import { LaserOverlayUtil } from '@/lib/canvas/laser'
import { SpotlightShapeUtil } from '@/lib/canvas/spotlight'
import { isHiddenByFold, registerTreeSideEffects, withBranchesToDelete } from '@/lib/canvas/tree'
import { activeStepIdAtom, editUnlockedAtom, modeAtom, quickSequenceAtom, stepIndexAtom } from '@/lib/presentation/store'
import { assetStore } from '@/lib/sync/assetStore'
import { startCloudSync } from '@/lib/sync/cloudSync'
import { PresShapeWrapper } from './PresShapeWrapper'
import { StepBadges } from './StepBadges'
import { SequencePanel } from './SequencePanel'
import { NarrationPanel, ProgressBar } from './PresenterUI'
import { usePresentation } from './usePresentation'
import { QuickAssign, QuickSequence } from './QuickAssign'
import { SyncBanner } from './SyncIndicator'
import { SpotlightOverlay } from './SpotlightOverlay'
import { FoldBadges, TreeToolbar, useTreeKeyboard } from './TreeTools'

const overlayUtils = [LaserOverlayUtil]
const shapeUtils = [SpotlightShapeUtil]

function CanvasBadges() {
  return (
    <>
      <StepBadges />
      <FoldBadges />
    </>
  )
}

const components: TLComponents = {
  ShapeWrapper: PresShapeWrapper,
  OnTheCanvas: CanvasBadges,
  InFrontOfTheCanvas: SpotlightOverlay,
}

// Supprimer un nœud d'arbre supprime sa branche.
const overrides: TLUiOverrides = {
  actions(editor, actions) {
    const del = actions['delete']
    if (del) {
      actions['delete'] = {
        ...del,
        onSelect(source) {
          editor.setSelectedShapes(withBranchesToDelete(editor, editor.getSelectedShapeIds()))
          return del.onSelect(source)
        },
      }
    }
    return actions
  },
}

// En édition, une branche repliée est réellement masquée (ni affichée, ni sélectionnable).
// En présentation, c'est la séquence qui décide (classes CSS).
const getShapeVisibility = (shape: TLShape, editor: Editor) =>
  modeAtom.get() === 'edit' && isHiddenByFold(editor, shape) ? 'hidden' : 'inherit'

export default function Studio({ docId, seedDemo }: { docId: string; seedDemo: boolean }) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const mode = useValue(modeAtom)
  const unlocked = useValue(editUnlockedAtom)
  const quickSequence = useValue(quickSequenceAtom)

  // Synchronisation avec le serveur, et remise à zéro de l'état de présentation en quittant le document.
  useEffect(() => {
    if (!editor) return
    // En développement : l'éditeur est accessible depuis la console et les tests Playwright.
    if (process.env.NODE_ENV === 'development') Object.assign(window, { editor })
    const stop = startCloudSync(editor, docId, { seedDemo })
    const stopTree = registerTreeSideEffects(editor)
    return () => {
      stop()
      stopTree()
      modeAtom.set('edit')
      editUnlockedAtom.set(false)
      quickSequenceAtom.set(false)
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
          getShapeVisibility={getShapeVisibility}
          overrides={overrides}
          licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
          onMount={setEditor}
        />
        {editor && mode === 'present' && <ProgressBar editor={editor} />}
        {editor && mode === 'present' && unlocked && <QuickAssign editor={editor} />}
        {editor && mode === 'edit' && quickSequence && <QuickSequence editor={editor} />}
        {editor && (mode === 'edit' || unlocked) && <TreeToolbar editor={editor} />}
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
  useTreeKeyboard(editor)
  return null
}

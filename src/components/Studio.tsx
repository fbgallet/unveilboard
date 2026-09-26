'use client'

import { useEffect, useState } from 'react'
import { Tldraw, useValue, type Editor, type TLComponents, type TLShape, type TLUiOverrides } from 'tldraw'
import 'tldraw/tldraw.css'
import { LaserOverlayUtil } from '@/lib/canvas/laser'
import { SpotlightShapeUtil } from '@/lib/canvas/spotlight'
import { registerTreeSideEffects, withBranchesToDelete } from '@/lib/canvas/tree'
import { registerDetailSideEffects } from '@/lib/canvas/details'
import { isHiddenInEdit } from '@/lib/canvas/visibility'
import { activeStepIdAtom, editUnlockedAtom, modeAtom, quickSequenceAtom, stepIndexAtom } from '@/lib/presentation/store'
import { assetStore } from '@/lib/sync/assetStore'
import { startDocumentSync } from '@/lib/sync/documentSync'
import { documentStore, settingsStore } from '@/lib/storage'
import type { StorageMode } from '@/lib/storage/types'
import { PresShapeWrapper } from './PresShapeWrapper'
import { StepBadges } from './StepBadges'
import { SequencePanel } from './SequencePanel'
import { NarrationPanel, ProgressBar } from './PresenterUI'
import { usePresentation } from './usePresentation'
import { QuickAssign, QuickSequence } from './QuickAssign'
import { SyncBanner } from './SyncIndicator'
import { SpotlightOverlay } from './SpotlightOverlay'
import { DetailBadges, FoldBadges, TreeToolbar, useTreeKeyboard } from './TreeTools'
import { MainMenu } from './FileMenu'
import { PresetManager, PresetStylePanel } from './PresetTools'
import { loadPresetSettings } from '@/lib/canvas/presets'

const overlayUtils = [LaserOverlayUtil]
const shapeUtils = [SpotlightShapeUtil]

function CanvasBadges() {
  return (
    <>
      <StepBadges />
      <FoldBadges />
      <DetailBadges />
    </>
  )
}

const components: TLComponents = {
  ShapeWrapper: PresShapeWrapper,
  OnTheCanvas: CanvasBadges,
  InFrontOfTheCanvas: SpotlightOverlay,
  MainMenu,
  StylePanel: PresetStylePanel,
}

// Supprimer un nœud d'arbre supprime sa branche ; supprimer une boîte supprime ses détails.
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

// En édition, une branche ou un détail repliés sont réellement masqués (ni affichés, ni sélectionnables).
// En présentation, c'est la séquence qui décide (classes CSS).
const getShapeVisibility = (shape: TLShape, editor: Editor) =>
  modeAtom.get() === 'edit' && isHiddenInEdit(editor, shape) ? 'hidden' : 'inherit'

export default function Studio({ docId, seedDemo, storage }: { docId: string; seedDemo: boolean; storage: StorageMode }) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const mode = useValue(modeAtom)
  const unlocked = useValue(editUnlockedAtom)
  const quickSequence = useValue(quickSequenceAtom)

  // Synchronisation avec le stockage (serveur ou navigateur), et remise à zéro de l'état de présentation en quittant le document.
  useEffect(() => {
    if (!editor) return
    // En développement : l'éditeur est accessible depuis la console et les tests Playwright.
    if (process.env.NODE_ENV === 'development') Object.assign(window, { editor })
    const stop = startDocumentSync(editor, docId, documentStore(storage), { seedDemo })
    const stopTree = registerTreeSideEffects(editor)
    const stopDetails = registerDetailSideEffects(editor)
    void loadPresetSettings(settingsStore(storage))
    return () => {
      stop()
      stopTree()
      stopDetails()
      modeAtom.set('edit')
      editUnlockedAtom.set(false)
      quickSequenceAtom.set(false)
      stepIndexAtom.set(-1)
      activeStepIdAtom.set(null)
    }
  }, [editor, docId, seedDemo, storage])

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
        {editor && <PresetManager editor={editor} />}
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

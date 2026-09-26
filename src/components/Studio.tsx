'use client'

import { useLocale } from '@/i18n/client'
import type { DemoName } from '@/lib/demoNames'
import { useEffect, useState } from 'react'
import { Tldraw, useValue, type Editor, type TLComponents, type TLShape, type TLUiOverrides } from 'tldraw'
import 'tldraw/tldraw.css'
import { LaserOverlayUtil } from '@/lib/canvas/laser'
import { SpotlightShapeUtil } from '@/lib/canvas/spotlight'
import { registerTreeSideEffects, withBranchesToDelete } from '@/lib/canvas/tree'
import { convertLegacyDetails } from '@/lib/canvas/notes'
import { isHiddenInEdit } from '@/lib/canvas/visibility'
import { activeStepIdAtom, editUnlockedAtom, modeAtom, quickSequenceAtom, stepIndexAtom } from '@/lib/presentation/store'
import { assetStore } from '@/lib/sync/assetStore'
import { startDocumentSync } from '@/lib/sync/documentSync'
import { documentStore, settingsStore } from '@/lib/storage'
import type { StorageMode } from '@/lib/storage/types'
import { PresShapeWrapper } from './PresShapeWrapper'
import { StepBadges } from './StepBadges'
import { SequencePanel } from './SequencePanel'
import { Legend, NarrationPanel, NoteMarkers, ProgressBar } from './PresenterUI'
import { usePresentation } from './usePresentation'
import { QuickAssign, QuickSequence } from './QuickAssign'
import { SyncBanner } from './SyncIndicator'
import { SpotlightOverlay } from './SpotlightOverlay'
import { FoldBadges, RelationPicker, TreeToolbar, useTreeKeyboard } from './TreeTools'
import { MainMenu } from './FileMenu'
import { PresetManager, PresetStylePanel } from './PresetTools'
import { ShareDialog, shareDialogOpenAtom } from './ShareDialog'
import { loadPresetSettings, registerPresetSideEffects } from '@/lib/canvas/presets'

const overlayUtils = [LaserOverlayUtil]
const shapeUtils = [SpotlightShapeUtil]

function CanvasBadges() {
  return (
    <>
      <StepBadges />
      <FoldBadges />
      <NoteMarkers />
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

export default function Studio({
  docId,
  demo,
  storage,
  licenseKey,
  publicSharing,
}: {
  docId: string
  demo: DemoName | null
  storage: StorageMode
  licenseKey?: string
  /** Instance publique : publication d'un lien court ouverte à tous (partages publics). */
  publicSharing: boolean
}) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const mode = useValue(modeAtom)
  const unlocked = useValue(editUnlockedAtom)
  const quickSequence = useValue(quickSequenceAtom)
  // Le thème choisi dans tldraw (clair, sombre ou système) s'applique aussi à nos panneaux.
  const dark = useValue('dark mode', () => editor?.user.getIsDarkMode() ?? false, [editor])

  // Synchronisation avec le stockage (serveur ou navigateur), et remise à zéro de l'état de présentation en quittant le document.
  useEffect(() => {
    if (!editor) return
    // En développement : l'éditeur est accessible depuis la console et les tests Playwright.
    if (process.env.NODE_ENV === 'development') Object.assign(window, { editor })
    const stop = startDocumentSync(editor, docId, documentStore(storage), {
      demo,
      // Anciens « détails » → notes, séquence au format courant.
      onLoaded: () => convertLegacyDetails(editor),
    })
    const stopTree = registerTreeSideEffects(editor)
    const stopPresets = registerPresetSideEffects(editor)
    void loadPresetSettings(settingsStore(storage))
    return () => {
      stop()
      stopTree()
      stopPresets()
      modeAtom.set('edit')
      editUnlockedAtom.set(false)
      quickSequenceAtom.set(false)
      stepIndexAtom.set(-1)
      activeStepIdAtom.set(null)
      shareDialogOpenAtom.set(false)
    }
  }, [editor, docId, demo, storage])

  // L'interface de tldraw (menus, outils) suit la langue de l'app.
  const [locale] = useLocale()
  useEffect(() => {
    editor?.user.updateUserPreferences({ locale })
  }, [editor, locale])

  return (
    <div className="studio flex h-dvh w-full overflow-hidden" data-mode={mode} data-unlocked={unlocked} data-theme={dark ? 'dark' : 'light'}>
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
          licenseKey={licenseKey}
          onMount={setEditor}
        />
        {editor && mode === 'present' && <ProgressBar editor={editor} />}
        {editor && mode === 'present' && <Legend editor={editor} />}
        {editor && mode === 'present' && unlocked && <QuickAssign editor={editor} />}
        {editor && mode === 'edit' && quickSequence && <QuickSequence editor={editor} />}
        {editor && (mode === 'edit' || unlocked) && <TreeToolbar editor={editor} />}
        {editor && (mode === 'edit' || unlocked) && <RelationPicker editor={editor} />}
        {editor && <SyncBanner />}
        {editor && <PresetManager editor={editor} />}
        {editor && <ShareDialog editor={editor} docId={docId} publicSharing={publicSharing} />}
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

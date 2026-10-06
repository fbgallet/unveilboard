'use client'

import { useLocale, useT } from '@/i18n/client'
import type { DemoName } from '@/lib/demoNames'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
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
import { startFileSync } from '@/lib/sync/fileSync'
import { documentStore, settingsStore } from '@/lib/storage'
import type { StorageMode } from '@/lib/storage/types'
import { PresShapeWrapper } from './PresShapeWrapper'
import { StepBadges } from './StepBadges'
import { ContextMenu } from './SequenceMenu'
import { SequencePanel } from './SequencePanel'
import { Legend, NarrationPanel, NoteMarkers, ProgressBar } from './PresenterUI'
import { pinNarrationScale, usePresentation } from './usePresentation'
import { QuickAssign, QuickSequence, SelectionAssign } from './QuickAssign'
import { FileBanner, SyncBanner } from './SyncIndicator'
import { SpotlightOverlay } from './SpotlightOverlay'
import { CameraAreaEditor } from './CameraAreaEditor'
import { FoldBadges, RelationPicker, TreeToolbar, useTreeKeyboard } from './TreeTools'
import { MainMenu } from './FileMenu'
import { PresetGuide, PresetManager, PresetStylePanel } from './PresetTools'
import { ShareDialog, shareDialogOpenAtom } from './ShareDialog'
import { ScreenControls } from './ScreenControls'
import { useScreenPresenter } from './useScreenPresenter'
import { openScreen } from '@/lib/presentation/screen'
import { remoteDialogOpenAtom, startRemote, stopRemote } from '@/lib/remote/host'
import { RemoteDialog } from './RemoteDialog'
import { ShortcutsHelp } from './ShortcutsHelp'
import { Handout, handoutOpenAtom } from './Handout'
import { AssistantDialog, MapImportDialog, assistantOpenAtom, mapImportOpenAtom } from './MapJsonDialog'
import { loadPresetSettings, registerPresetSideEffects } from '@/lib/canvas/presets'
import { installPageApi } from '@/lib/canvas/assistant'
import { loadAiSettings, serverAiAtom } from '@/lib/ai/client'
import { AiSettingsDialog, aiSettingsOpenAtom } from './AiSettingsDialog'
import { PromptLibraryDialog } from './PromptLibraryDialog'
import { loadPromptLibrary, promptLibraryOpenAtom } from '@/lib/prompts/library'
import { SuggestionBadges, SuggestionBar } from './Suggestions'
import { ElementAiPanel, elementAiAtom } from './ElementAi'
import { SourceDialog, sourceDialogOpenAtom } from './SourceDialog'
import { ReviewBadges, ReviewPanel } from './ReviewPanel'
import { PlanPanel } from './PlanPanel'
import { SourcePanel, sourcePresentOpenAtom } from './SourcePanel'
import { readPageSource } from '@/lib/canvas/source'
import { AiLauncher } from './AiLauncher'
import { PasteListDialog, registerListPaste } from './PasteList'
import { loadReview, reviewOpenAtom } from '@/lib/canvas/review'
import { loadChat } from '@/lib/canvas/chat'

const overlayUtils = [LaserOverlayUtil]
const shapeUtils = [SpotlightShapeUtil]

function CanvasBadges() {
  return (
    <>
      <StepBadges />
      <FoldBadges />
      <SuggestionBadges />
      <ReviewBadges />
      <NoteMarkers />
    </>
  )
}

function InFrontOfTheCanvas() {
  return (
    <>
      <CameraAreaEditor />
      <SpotlightOverlay />
    </>
  )
}

const components: TLComponents = {
  ShapeWrapper: PresShapeWrapper,
  OnTheCanvas: CanvasBadges,
  InFrontOfTheCanvas,
  MainMenu,
  StylePanel: PresetStylePanel,
  SharePanel: AiLauncher,
  ContextMenu,
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
// Les suggestions de l'IA en attente ne sont jamais présentées.
const getShapeVisibility = (shape: TLShape, editor: Editor) => {
  if (modeAtom.get() === 'edit') return isHiddenInEdit(editor, shape) ? 'hidden' : 'inherit'
  return shape.meta.suggestion ? 'hidden' : 'inherit'
}

export default function Studio({
  docId,
  demo,
  storage,
  licenseKey,
  publicSharing,
  serverAi,
}: {
  docId: string
  demo: DemoName | null
  storage: StorageMode
  licenseKey?: string
  /** Instance publique : publication d'un lien court ouverte à tous (partages publics). */
  publicSharing: boolean
  /** IA de l'instance (clé côté serveur), si elle en a une. */
  serverAi: { model: string; models: string[] } | null
}) {
  const t = useT()
  const router = useRouter()
  const routerRef = useRef(router)
  useEffect(() => {
    routerRef.current = router
  }, [router])
  const [editor, setEditor] = useState<Editor | null>(null)
  const mode = useValue(modeAtom)
  const unlocked = useValue(editUnlockedAtom)
  const quickSequence = useValue(quickSequenceAtom)
  const sourceOpen = useValue(sourcePresentOpenAtom)
  const hasSource = useValue('has source', () => !!editor && !!readPageSource(editor), [editor])
  // Le thème choisi dans tldraw (clair, sombre ou système) s'applique aussi à nos panneaux.
  const dark = useValue('dark mode', () => editor?.user.getIsDarkMode() ?? false, [editor])

  // Synchronisation avec le stockage (serveur ou navigateur), et remise à zéro de l'état de présentation en quittant le document.
  useEffect(() => {
    if (!editor) return
    // En développement : l'éditeur est accessible depuis la console et les tests de bout en bout (tests/e2e).
    if (process.env.NODE_ENV === 'development') Object.assign(window, { editor })
    const stop = startDocumentSync(editor, docId, documentStore(storage), {
      demo,
      // Anciens « détails » → notes, séquence au format courant.
      onLoaded: () => convertLegacyDetails(editor),
    })
    // Fichier .tldr lié (ouvert ou enregistré depuis ce schéma), tenu à jour automatiquement.
    const stopFile = startFileSync(editor, docId)
    const stopTree = registerTreeSideEffects(editor)
    const stopPresets = registerPresetSideEffects(editor)
    // Une liste collée devient une carte mentale (ou des branches de la boîte sur laquelle on la colle).
    const stopPaste = registerListPaste(editor)
    // window.unveilboard : lire et modifier le schéma, pour un agent qui pilote le navigateur.
    const stopApi = installPageApi(editor, (url) => routerRef.current.push(url))
    // Relecture critique gardée pour ce schéma (sur cet appareil).
    loadReview(docId)
    // Conversation de l'onglet Chat gardée pour ce schéma (sur cet appareil).
    loadChat(docId)
    void loadPresetSettings(settingsStore(storage))
    void loadPromptLibrary(settingsStore(storage))
    return () => {
      stop()
      stopFile()
      stopTree()
      stopPresets()
      stopPaste()
      stopApi()
      modeAtom.set('edit')
      editUnlockedAtom.set(false)
      quickSequenceAtom.set(false)
      stepIndexAtom.set(-1)
      activeStepIdAtom.set(null)
      shareDialogOpenAtom.set(false)
      remoteDialogOpenAtom.set(false)
      handoutOpenAtom.set(false)
      mapImportOpenAtom.set(false)
      assistantOpenAtom.set(false)
      aiSettingsOpenAtom.set(false)
      promptLibraryOpenAtom.set(false)
      elementAiAtom.set(null)
      sourceDialogOpenAtom.set(false)
      reviewOpenAtom.set(false)
      stopRemote()
    }
  }, [editor, docId, demo, storage])

  // IA : celle de l'instance, et les réglages de cet appareil.
  useEffect(() => {
    serverAiAtom.set(serverAi)
    loadAiSettings(serverAi)
  }, [serverAi])

  // L'interface de tldraw (menus, outils) suit la langue de l'app.
  const [locale] = useLocale()
  useEffect(() => {
    editor?.user.updateUserPreferences({ locale })
  }, [editor, locale])

  return (
    <div className="studio flex h-dvh w-full overflow-hidden" data-mode={mode} data-unlocked={unlocked} data-theme={dark ? 'dark' : 'light'}>
      {/* Texte source : en édition, et en présentation (lecture seule, au fil des étapes). */}
      {editor && <SourcePanel editor={editor} presenting={mode === 'present' && !unlocked} />}
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
        {editor && mode === 'present' && (
          <ProgressBar
            editor={editor}
            onProject={() => {
              if (!openScreen(docId)) alert(t.screen.popupBlocked)
            }}
            onRemote={() => {
              void startRemote(editor)
              remoteDialogOpenAtom.set(true)
            }}
            sourceText={hasSource ? { open: sourceOpen, toggle: () => sourcePresentOpenAtom.set(!sourceOpen) } : undefined}
          />
        )}
        {editor && mode === 'present' && <Legend editor={editor} />}
        {mode === 'present' && <ShortcutsHelp />}
        {editor && mode === 'present' && unlocked && <QuickAssign editor={editor} />}
        {editor && mode === 'edit' && quickSequence && <QuickSequence editor={editor} />}
        {editor && mode === 'edit' && !quickSequence && <SelectionAssign editor={editor} />}
        {editor && (mode === 'edit' || unlocked) && <TreeToolbar editor={editor} />}
        {editor && (mode === 'edit' || unlocked) && <RelationPicker editor={editor} />}
        {editor && mode === 'edit' && <SuggestionBar editor={editor} />}
        {editor && mode === 'edit' && <ElementAiPanel editor={editor} />}
        {editor && mode === 'edit' && <ReviewPanel editor={editor} />}
        {editor && mode === 'edit' && <PlanPanel editor={editor} />}
        {editor && mode === 'edit' && <PasteListDialog editor={editor} />}
        {editor && <SyncBanner />}
        {editor && <FileBanner />}
        {editor && <PresetManager editor={editor} />}
        {editor && <PresetGuide editor={editor} />}
        {editor && <ShareDialog editor={editor} docId={docId} publicSharing={publicSharing} />}
        {editor && <RemoteDialog editor={editor} />}
        {editor && <Handout editor={editor} />}
        {editor && <MapImportDialog editor={editor} />}
        {editor && <AssistantDialog editor={editor} />}
        {editor && <AiSettingsDialog />}
        {editor && <PromptLibraryDialog />}
        {editor && <SourceDialog editor={editor} />}
      </div>
      {editor && <PresentationHost editor={editor} docId={docId} />}
      {editor && mode === 'edit' && <SequencePanel editor={editor} />}
      {editor && mode === 'present' && <NarrationPanel editor={editor} top={<ScreenControls editor={editor} />} onPinScale={() => pinNarrationScale(editor)} />}
    </div>
  )
}

function PresentationHost({ editor, docId }: { editor: Editor; docId: string }) {
  usePresentation(editor)
  useScreenPresenter(editor, docId)
  useTreeKeyboard(editor)
  return null
}

'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  DefaultMainMenu,
  DefaultMainMenuContent,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  TldrawUiMenuSubmenu,
  useEditor,
  useValue,
  useToasts,
} from 'tldraw'
import { documentStore } from '@/lib/storage'
import { recentlyOpened } from '@/lib/storage/recent'
import type { DocumentSummary } from '@/lib/storage/types'
import { openTldrFile, pickTldrFile } from '@/lib/storage/tldrFile'
import { fileActionsAtom, fileLinkAtom } from '@/lib/sync/fileSync'
import { storageModeAtom } from '@/lib/sync/documentSync'
import { presetGuideOpenAtom, presetManagerOpenAtom } from './PresetTools'
import { shareDialogOpenAtom } from './ShareDialog'
import { handoutOpenAtom } from './Handout'
import { aiSettingsOpenAtom } from './AiSettingsDialog'
import { promptLibraryOpenAtom } from '@/lib/prompts/library'
import { sourceDialogOpenAtom } from './SourceDialog'
import { reviewOpenAtom } from '@/lib/canvas/review'
import { assistantOpenAtom, downloadMapJson, mapImportOpenAtom, mapJsonText } from './MapJsonDialog'
import { markdownListOf } from '@/lib/canvas/listExport'
import { useT } from '@/i18n/client'

/**
 * Menu principal de tldraw (en haut à gauche), précédé de nos entrées : navigation entre schémas,
 * puis fichier, partage, IA et styles (en sous-menus, pour que le menu tienne à l'écran).
 */
export function MainMenu() {
  const t = useT()
  const actions = useValue(fileActionsAtom)
  const linked = useValue(fileLinkAtom)
  const router = useRouter()
  const editor = useEditor()
  const { addToast } = useToasts()
  const fail = (e: unknown) =>
    addToast({ title: e instanceof Error ? e.message : t.common.genericError, severity: 'error' })

  async function open() {
    try {
      const picked = await pickTldrFile()
      if (!picked) return
      const id = await openTldrFile(documentStore(storageModeAtom.get()), picked)
      router.push(`/d/${id}`)
    } catch (e) {
      fail(e)
    }
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(mapJsonText(editor))
      addToast({ title: t.mapJson.copied, severity: 'success' })
    } catch (e) {
      fail(e)
    }
  }

  async function copyList() {
    try {
      await navigator.clipboard.writeText(markdownListOf(editor))
      addToast({ title: t.listExport.copied, severity: 'success' })
    } catch (e) {
      fail(e)
    }
  }

  async function create() {
    try {
      const id = await documentStore(storageModeAtom.get()).create(t.common.untitled)
      router.push(`/d/${id}`)
    } catch (e) {
      fail(e)
    }
  }

  return (
    <DefaultMainMenu>
      <TldrawUiMenuGroup id="schema-nav">
        <TldrawUiMenuItem id="my-diagrams" label={t.nav.myDiagrams} readonlyOk onSelect={() => router.push('/')} />
        <RecentDiagrams />
        <TldrawUiMenuItem id="new-diagram" label={t.nav.newDiagram} readonlyOk onSelect={() => void create()} />
      </TldrawUiMenuGroup>
      <TldrawUiMenuGroup id="schema-file">
        <TldrawUiMenuSubmenu id="schema-file-menu" label={t.nav.file}>
          <TldrawUiMenuGroup id="schema-tldr">
            <TldrawUiMenuItem id="open-tldr" label={t.files.open} readonlyOk onSelect={() => void open()} />
            {linked && (
              <TldrawUiMenuItem id="save-tldr" label={t.files.save} readonlyOk onSelect={() => void actions?.save().catch(fail)} />
            )}
            <TldrawUiMenuItem
              id="save-tldr-as"
              label={t.files.saveAs}
              readonlyOk
              onSelect={() => void actions?.saveAs().catch(fail)}
            />
            {linked && (
              <TldrawUiMenuItem id="unlink-tldr" label={t.files.unlink} readonlyOk onSelect={() => void actions?.unlink()} />
            )}
          </TldrawUiMenuGroup>
          <TldrawUiMenuGroup id="schema-json">
            <TldrawUiMenuItem id="export-json" label={t.mapJson.menuExport} readonlyOk onSelect={() => downloadMapJson(editor)} />
            <TldrawUiMenuItem id="copy-json" label={t.mapJson.menuCopy} readonlyOk onSelect={() => void copyJson()} />
            <TldrawUiMenuItem id="copy-list" label={t.listExport.menu} readonlyOk onSelect={() => void copyList()} />
            <TldrawUiMenuItem id="import-json" label={t.mapJson.menuImport} onSelect={() => void mapImportOpenAtom.set(true)} />
          </TldrawUiMenuGroup>
        </TldrawUiMenuSubmenu>
        <TldrawUiMenuItem id="share" label={t.share.menu} readonlyOk onSelect={() => void shareDialogOpenAtom.set(true)} />
        <TldrawUiMenuItem id="handout" label={t.handout.menu} readonlyOk onSelect={() => void handoutOpenAtom.set(true)} />
      </TldrawUiMenuGroup>
      <TldrawUiMenuGroup id="schema-tools">
        <TldrawUiMenuSubmenu id="schema-ai" label={t.nav.ai}>
          <TldrawUiMenuGroup id="schema-ai-actions">
            <TldrawUiMenuItem id="assistant" label={t.assistant.menu} onSelect={() => void assistantOpenAtom.set(true)} />
            <TldrawUiMenuItem id="review" label={t.review.menu} onSelect={() => void reviewOpenAtom.set(true)} />
            <TldrawUiMenuItem id="from-source" label={t.source.menu} readonlyOk onSelect={() => void sourceDialogOpenAtom.set(true)} />
          </TldrawUiMenuGroup>
          <TldrawUiMenuGroup id="schema-ai-settings">
            <TldrawUiMenuItem id="ai-prompts" label={t.prompts.menu} readonlyOk onSelect={() => void promptLibraryOpenAtom.set(true)} />
            <TldrawUiMenuItem id="ai-settings" label={t.ai.settingsMenu} readonlyOk onSelect={() => void aiSettingsOpenAtom.set(true)} />
          </TldrawUiMenuGroup>
        </TldrawUiMenuSubmenu>
        <TldrawUiMenuSubmenu id="schema-presets" label={t.nav.styles}>
          <TldrawUiMenuGroup id="schema-presets-items">
            <TldrawUiMenuItem id="presets" label={t.presets.menu} onSelect={() => void presetManagerOpenAtom.set(true)} />
            <TldrawUiMenuItem id="preset-guide" label={t.guide.menu} readonlyOk onSelect={() => void presetGuideOpenAtom.set(true)} />
          </TldrawUiMenuGroup>
        </TldrawUiMenuSubmenu>
      </TldrawUiMenuGroup>
      <DefaultMainMenuContent />
    </DefaultMainMenu>
  )
}

/** Nombre de schémas proposés dans « Schémas récents ». */
const RECENT_COUNT = 8

/**
 * Sous-menu des schémas récents (hors celui-ci) : les derniers ouverts dans ce navigateur,
 * puis les derniers modifiés. La liste est lue à l'ouverture du menu.
 */
function RecentDiagrams() {
  const t = useT()
  const router = useRouter()
  const { id: currentId } = useParams<{ id: string }>()
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null)

  useEffect(() => {
    let cancelled = false
    documentStore(storageModeAtom.get())
      .list()
      .then((list) => {
        if (cancelled) return
        const opened = recentlyOpened()
        const time = (d: DocumentSummary) => opened[d.id] ?? 0
        const recent = list
          .filter((d) => d.id !== currentId)
          .sort((a, b) => time(b) - time(a) || b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, RECENT_COUNT)
        setDocs(recent)
      })
      .catch(() => !cancelled && setDocs([]))
    return () => {
      cancelled = true
    }
  }, [currentId])

  if (!docs?.length) return null
  return (
    <TldrawUiMenuSubmenu id="recent-diagrams" label={t.nav.recent}>
      <TldrawUiMenuGroup id="recent-diagrams-list">
        {docs.map((d) => (
          <TldrawUiMenuItem
            key={d.id}
            id={`recent-${d.id}`}
            label={d.title || t.common.untitled}
            readonlyOk
            onSelect={() => router.push(`/d/${d.id}`)}
          />
        ))}
      </TldrawUiMenuGroup>
      <TldrawUiMenuGroup id="recent-diagrams-all">
        <TldrawUiMenuItem id="recent-all" label={t.nav.allDiagrams} readonlyOk onSelect={() => router.push('/')} />
      </TldrawUiMenuGroup>
    </TldrawUiMenuSubmenu>
  )
}

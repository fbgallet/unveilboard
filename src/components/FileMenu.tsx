'use client'

import { useRouter } from 'next/navigation'
import {
  DefaultMainMenu,
  DefaultMainMenuContent,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  useEditor,
  useToasts,
} from 'tldraw'
import { documentStore } from '@/lib/storage'
import { importTldrFile, pickTldrFile } from '@/lib/storage/tldrFile'
import { saveTldrAs } from '@/lib/storage/tldrSave'
import { storageModeAtom } from '@/lib/sync/documentSync'
import { presetManagerOpenAtom } from './PresetTools'
import { shareDialogOpenAtom } from './ShareDialog'
import { handoutOpenAtom } from './Handout'
import { useT } from '@/i18n/client'

/** Menu principal de tldraw (en haut à gauche), précédé des commandes de fichier .tldr. */
export function MainMenu() {
  const t = useT()
  const editor = useEditor()
  const router = useRouter()
  const { addToast } = useToasts()
  const fail = (e: unknown) =>
    addToast({ title: e instanceof Error ? e.message : t.common.genericError, severity: 'error' })

  async function open() {
    try {
      const file = await pickTldrFile()
      if (!file) return
      const id = await importTldrFile(documentStore(storageModeAtom.get()), file)
      router.push(`/d/${id}`)
    } catch (e) {
      fail(e)
    }
  }

  return (
    <DefaultMainMenu>
      <TldrawUiMenuGroup id="schema-file">
        <TldrawUiMenuItem id="open-tldr" label={t.files.open} readonlyOk onSelect={() => void open()} />
        <TldrawUiMenuItem
          id="save-tldr"
          label={t.files.saveAs}
          readonlyOk
          onSelect={() => void saveTldrAs(editor).catch(fail)}
        />
        <TldrawUiMenuItem id="share" label={t.share.menu} readonlyOk onSelect={() => void shareDialogOpenAtom.set(true)} />
        <TldrawUiMenuItem id="handout" label={t.handout.menu} readonlyOk onSelect={() => void handoutOpenAtom.set(true)} />
      </TldrawUiMenuGroup>
      <TldrawUiMenuGroup id="schema-presets">
        <TldrawUiMenuItem id="presets" label={t.presets.menu} onSelect={() => void presetManagerOpenAtom.set(true)} />
      </TldrawUiMenuGroup>
      <DefaultMainMenuContent />
    </DefaultMainMenu>
  )
}

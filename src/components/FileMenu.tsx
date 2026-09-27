'use client'

import { useRouter } from 'next/navigation'
import {
  DefaultMainMenu,
  DefaultMainMenuContent,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  useValue,
  useToasts,
} from 'tldraw'
import { documentStore } from '@/lib/storage'
import { openTldrFile, pickTldrFile } from '@/lib/storage/tldrFile'
import { fileActionsAtom, fileLinkAtom } from '@/lib/sync/fileSync'
import { storageModeAtom } from '@/lib/sync/documentSync'
import { presetGuideOpenAtom, presetManagerOpenAtom } from './PresetTools'
import { shareDialogOpenAtom } from './ShareDialog'
import { handoutOpenAtom } from './Handout'
import { useT } from '@/i18n/client'

/** Menu principal de tldraw (en haut à gauche), précédé des commandes de fichier .tldr. */
export function MainMenu() {
  const t = useT()
  const actions = useValue(fileActionsAtom)
  const linked = useValue(fileLinkAtom)
  const router = useRouter()
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

  return (
    <DefaultMainMenu>
      <TldrawUiMenuGroup id="schema-file">
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
        <TldrawUiMenuItem id="share" label={t.share.menu} readonlyOk onSelect={() => void shareDialogOpenAtom.set(true)} />
        <TldrawUiMenuItem id="handout" label={t.handout.menu} readonlyOk onSelect={() => void handoutOpenAtom.set(true)} />
      </TldrawUiMenuGroup>
      <TldrawUiMenuGroup id="schema-presets">
        <TldrawUiMenuItem id="presets" label={t.presets.menu} onSelect={() => void presetManagerOpenAtom.set(true)} />
        <TldrawUiMenuItem id="preset-guide" label={t.guide.menu} readonlyOk onSelect={() => void presetGuideOpenAtom.set(true)} />
      </TldrawUiMenuGroup>
      <DefaultMainMenuContent />
    </DefaultMainMenu>
  )
}

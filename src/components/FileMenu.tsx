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
import { importTldrFile, pickTldrFile, saveTldrAs } from '@/lib/storage/tldrFile'
import { storageModeAtom } from '@/lib/sync/documentSync'
import { presetManagerOpenAtom } from './PresetTools'

/** Menu principal de tldraw (en haut à gauche), précédé des commandes de fichier .tldr. */
export function MainMenu() {
  const editor = useEditor()
  const router = useRouter()
  const { addToast } = useToasts()
  const fail = (e: unknown) =>
    addToast({ title: e instanceof Error ? e.message : 'Une erreur est survenue.', severity: 'error' })

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
        <TldrawUiMenuItem id="open-tldr" label="Ouvrir un fichier .tldr…" readonlyOk onSelect={() => void open()} />
        <TldrawUiMenuItem
          id="save-tldr"
          label="Enregistrer sous… (.tldr)"
          readonlyOk
          onSelect={() => void saveTldrAs(editor).catch(fail)}
        />
      </TldrawUiMenuGroup>
      <TldrawUiMenuGroup id="schema-presets">
        <TldrawUiMenuItem id="presets" label="Préréglages de styles…" onSelect={() => void presetManagerOpenAtom.set(true)} />
      </TldrawUiMenuGroup>
      <DefaultMainMenuContent />
    </DefaultMainMenu>
  )
}

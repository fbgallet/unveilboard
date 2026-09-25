'use client'

import { useState } from 'react'
import { Tldraw, useValue, type Editor, type TLComponents } from 'tldraw'
import 'tldraw/tldraw.css'
import { readSequence, writeSequence } from '@/lib/canvas/adapter'
import { seedDemo } from '@/lib/demo'
import { LaserOverlayUtil } from '@/lib/canvas/laser'
import { emptySequence } from '@/lib/sequence/types'
import { editUnlockedAtom, modeAtom } from '@/lib/presentation/store'
import { PresShapeWrapper } from './PresShapeWrapper'
import { StepBadges } from './StepBadges'
import { SequencePanel } from './SequencePanel'
import { NarrationPanel, ProgressBar } from './PresenterUI'
import { usePresentation } from './usePresentation'
import { QuickAssign } from './QuickAssign'

const overlayUtils = [LaserOverlayUtil]

const components: TLComponents = {
  ShapeWrapper: PresShapeWrapper,
  OnTheCanvas: StepBadges,
}

function onMount(editor: Editor) {
  if (readSequence(editor)) return
  const isEmpty = editor.getCurrentPageShapeIds().size === 0
  writeSequence(editor, isEmpty ? seedDemo(editor) : emptySequence())
  editor.zoomToFit()
}

export default function Studio() {
  const [editor, setEditor] = useState<Editor | null>(null)
  const mode = useValue(modeAtom)
  const unlocked = useValue(editUnlockedAtom)

  return (
    <div className="studio flex h-dvh w-full overflow-hidden" data-mode={mode} data-unlocked={unlocked}>
      <div className="relative min-w-0 flex-1">
        <Tldraw
          persistenceKey="animated-tldraw-phase0"
          components={components}
          overlayUtils={overlayUtils}
          licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
          onMount={(e) => {
            onMount(e)
            setEditor(e)
          }}
        />
        {editor && mode === 'present' && <ProgressBar editor={editor} />}
        {editor && mode === 'present' && unlocked && <QuickAssign editor={editor} />}
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

'use client'

import {
  DefaultContextMenu,
  DefaultContextMenuContent,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  TldrawUiMenuSubmenu,
  useEditor,
  useValue,
  type TLUiContextMenuProps,
} from 'tldraw'
import { readSequence, writeSequence } from '@/lib/canvas/adapter'
import { addStep, addTargets, removeTargets } from '@/lib/sequence/edit'
import { emptySequence, type Sequence, type Step, type StepActionType } from '@/lib/sequence/types'
import { activeStepIdAtom, modeAtom } from '@/lib/presentation/store'
import { useT } from '@/i18n/client'
import { ElementMenu } from './ElementMenu'

/** Actions proposées pour l'étape active (les autres restent dans le panneau des étapes). */
const ACTIVE_STEP_ACTIONS: StepActionType[] = ['show', 'highlight', 'focus', 'dim', 'undim', 'hide']

/** Menu contextuel de tldraw, complété d'un sous-menu « Séquence » pour la sélection (mode édition). */
export function ContextMenu(props: TLUiContextMenuProps) {
  return (
    <DefaultContextMenu {...props}>
      <SequenceMenu />
      <ElementMenu />
      <DefaultContextMenuContent />
    </DefaultContextMenu>
  )
}

const MAX_TITLE = 32
const short = (title: string) => (title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title)

/**
 * Rattacher la sélection à la séquence de la page sans passer par le panneau :
 * la faire apparaître à n'importe quelle étape (ou à une nouvelle), lui appliquer une action
 * à l'étape active, ou l'en retirer.
 */
function SequenceMenu() {
  const t = useT()
  const editor = useEditor()
  const selection = useValue('selection', () => editor.getSelectedShapeIds(), [editor])
  const seq = useValue('sequence', () => readSequence(editor) ?? emptySequence(t.sequence.defaultTitle), [editor, t])
  const activeId = useValue(activeStepIdAtom)
  const mode = useValue(modeAtom)
  if (mode !== 'edit' || !selection.length) return null

  const activeIndex = seq.steps.findIndex((s) => s.id === activeId)
  const active = seq.steps[activeIndex]
  const selected = new Set<string>(selection)
  const targets = (step: Step) => step.actions.some((a) => a.targets.some((id) => selected.has(id)))
  const inActive = !!active && targets(active)
  const inSequence = seq.steps.some(targets)

  const save = (next: Sequence, stepId?: string) => {
    writeSequence(editor, next)
    if (stepId) activeStepIdAtom.set(stepId)
  }

  return (
    <TldrawUiMenuGroup id="sequence">
      <TldrawUiMenuSubmenu id="sequence" label={t.seqMenu.title}>
        <TldrawUiMenuSubmenu id="sequence-show-at" label={t.seqMenu.showAt}>
          <TldrawUiMenuGroup id="sequence-steps">
            {seq.steps.map((step, i) => (
              <TldrawUiMenuItem
                key={step.id}
                id={`sequence-show-${step.id}`}
                label={`${i + 1}. ${short(step.title)}`}
                onSelect={() => save(addTargets(seq, step.id, 'show', selection), step.id)}
              />
            ))}
          </TldrawUiMenuGroup>
          <TldrawUiMenuGroup id="sequence-new">
            <TldrawUiMenuItem
              id="sequence-new-step"
              label={t.seqMenu.newStep}
              onSelect={() => {
                const [next, step] = addStep(seq, seq.steps.length, {
                  title: t.step.defaultTitle(seq.steps.length + 1),
                  actions: [{ type: 'show', targets: selection, effect: 'fade' }],
                })
                save(next, step.id)
              }}
            />
          </TldrawUiMenuGroup>
        </TldrawUiMenuSubmenu>
        {active && (
          <TldrawUiMenuSubmenu id="sequence-active" label={t.seqMenu.activeStep(activeIndex + 1)}>
            {ACTIVE_STEP_ACTIONS.map((type) => (
              <TldrawUiMenuItem
                key={type}
                id={`sequence-active-${type}`}
                label={t.actions[type]}
                onSelect={() => save(addTargets(seq, active.id, type, selection))}
              />
            ))}
          </TldrawUiMenuSubmenu>
        )}
        {active && inActive && (
          <TldrawUiMenuItem
            id="sequence-remove-active"
            label={t.seqMenu.removeFromActive(activeIndex + 1)}
            onSelect={() => save(removeTargets(seq, active.id, selection))}
          />
        )}
        {inSequence && (
          <TldrawUiMenuItem
            id="sequence-remove-all"
            label={t.seqMenu.removeFromSequence}
            onSelect={() => save(seq.steps.reduce((next, step) => removeTargets(next, step.id, selection), seq))}
          />
        )}
      </TldrawUiMenuSubmenu>
    </TldrawUiMenuGroup>
  )
}

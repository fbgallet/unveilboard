'use client'

import { useEffect, useRef } from 'react'
import { react, type Editor, type TLCamera, type TLEventInfo } from 'tldraw'
import { activeSpotlights, boundsOf, computeEditorStage, drawClip, moveCamera, readSequence, writeSequence } from '@/lib/canvas/adapter'
import { stateOf, type Stage } from '@/lib/sequence/compute'
import { branchOf, getTreeIndex } from '@/lib/canvas/tree'
import { noteOf, panelNoteIds } from '@/lib/canvas/notes'
import { swallowNextKeyUp } from '@/lib/keyboard'
import { applyLaserTiming } from '@/lib/canvas/laser'
import {
  activeSpotsAtom,
  activeStepIdAtom,
  editUnlockedAtom,
  foldBadgesAtom,
  foldOverridesAtom,
  laserPopoverOpenAtom,
  laserSettingsAtom,
  liveSpotAtom,
  modeAtom,
  narrationVisibleAtom,
  overviewAtom,
  pendingShapesAtom,
  quickSequenceAtom,
  recenterAtom,
  shapeClassesAtom,
  type ShapePresentation,
  spotToolAtom,
  stepIndexAtom,
  changeNarrationScale,
  openedNotesAtom,
  toggleOpenedNote,
  legendVisibleAtom,
  viewerAtom,
  presentationStartedAtAtom,
  moreMenuOpenAtom,
  shortcutsHelpOpenAtom,
  activeNoteAtom,
  narrationScaleAtom,
  narrationScaleDefaultAtom,
  NARRATION_SCALE,
} from '@/lib/presentation/store'

export function enterPresentation(fromIndex = -1) {
  presentationStartedAtAtom.set(Date.now())
  stepIndexAtom.set(fromIndex)
  overviewAtom.set(false)
  modeAtom.set('present')
}

export function exitPresentation() {
  laserPopoverOpenAtom.set(false)
  moreMenuOpenAtom.set(false)
  shortcutsHelpOpenAtom.set(false)
  clearLiveSpot()
  modeAtom.set('edit')
  editUnlockedAtom.set(false)
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
}

export function goToStep(editor: Editor, index: number) {
  const seq = readSequence(editor)
  if (!seq) return
  overviewAtom.set(false)
  stepIndexAtom.set(Math.max(-1, Math.min(index, seq.steps.length - 1)))
}

/**
 * Branche le moteur de présentation sur l'éditeur : classes CSS, caméra, clavier.
 * keyboard: false pour la fenêtre public du double affichage, qui renvoie ses touches au présentateur.
 */
export function usePresentation(editor: Editor, { keyboard = true }: { keyboard?: boolean } = {}) {
  const savedCamera = useRef<TLCamera | null>(null)

  // Notes d'objets : double-clic sur un objet visible qui en a une ; refermées à chaque étape.
  // Une note programmée à l'étape s'affiche d'emblée (la narration reste à un onglet).
  useEffect(() => {
    const stopReset = react('reset notes', () => {
      const index = stepIndexAtom.get()
      modeAtom.get()
      openedNotesAtom.set([])
      const step = readSequence(editor)?.steps[index]
      activeNoteAtom.set(panelNoteIds(editor, step, [])[0] ?? null)
    })
    const onEvent = (info: TLEventInfo) => {
      if (modeAtom.get() !== 'present' || info.name !== 'double_click' || info.type !== 'click' || info.phase !== 'up') return
      // tldraw ne résout pas la forme visée pour un double-clic : on cherche, sous le pointeur,
      // l'objet le plus haut qui a une note et que la séquence n'a pas caché.
      const classes = shapeClassesAtom.get()
      const hidden = (id: string) => !!classes && (classes.byId.get(id) ?? classes.fallback).className.includes('pres-hidden')
      const shape = editor
        .getShapesAtPoint(editor.inputs.getCurrentPagePoint(), { hitInside: true, margin: 4 })
        .reverse()
        .find((s) => !hidden(s.id) && noteOf(s))
      if (shape) toggleOpenedNote(shape.id)
    }
    editor.on('event', onEvent)
    return () => {
      stopReset()
      editor.off('event', onEvent)
    }
  }, [editor])

  // Replis faits à la main : une étape qui replie ou déplie un nœud reprend la main sur lui ;
  // revenir en arrière (ou quitter la présentation) les efface tous.
  useEffect(() => {
    let prevIndex = -2
    return react('fold overrides', () => {
      const index = stepIndexAtom.get()
      const presenting = modeAtom.get() === 'present'
      const overrides = foldOverridesAtom.__unsafe__getWithoutCapture()
      const from = prevIndex
      prevIndex = presenting ? index : -2
      if (Object.keys(overrides).length === 0) return
      if (!presenting || from === -2 || index < from) return foldOverridesAtom.set({})
      const touched = new Set(
        (readSequence(editor)?.steps.slice(from + 1, index + 1) ?? [])
          .flatMap((step) => step.actions)
          .filter((a) => a.type === 'fold' || a.type === 'unfold')
          .flatMap((a) => a.targets)
      )
      if ([...touched].some((id) => id in overrides))
        foldOverridesAtom.set(Object.fromEntries(Object.entries(overrides).filter(([id]) => !touched.has(id))))
    })
  }, [editor])

  // 1. Classes CSS de chaque forme, recalculées dès que la séquence, l'étape ou le document change.
  useEffect(() => {
    let prevIndex = -2
    let animatedIndex = -2
    let prevSpots = ''
    return react('presentation classes', () => {
      if (modeAtom.get() !== 'present') {
        prevIndex = -2
        prevSpots = ''
        shapeClassesAtom.set(quickSequenceAtom.get() ? quickSequencePreview(editor) : null)
        activeSpotsAtom.set([])
        foldBadgesAtom.set({ folded: [], open: [] })
        return
      }
      const seq = readSequence(editor)
      const index = stepIndexAtom.get()
      if (!seq) return
      if (index !== prevIndex) {
        // On n'anime les entrées que lorsqu'on avance.
        animatedIndex = index > prevIndex ? index : -2
        prevIndex = index
      }
      const animate = animatedIndex === index
      const overrides = Object.entries(foldOverridesAtom.get())
      const stage = computeEditorStage(editor, seq, index, {
        foldOverrides: new Map(overrides.map(([id, o]) => [id, o.folded])),
        liveUnfolds: new Set(overrides.filter(([, o]) => !o.folded && o.step === index).map(([id]) => id)),
      })

      const byId = new Map<string, ShapePresentation>()
      for (const id of editor.getCurrentPageShapeIds()) {
        const s = stateOf(stage, id)
        const cls = ['pres', `pres-${s.visibility}`]
        let style: Record<string, string> | undefined
        if (s.highlighted) cls.push('pres-hl')
        if ((animate || s.live) && s.entering && s.entering !== 'none' && s.visibility !== 'hidden') {
          cls.push(`pres-enter-${s.entering}`)
          if (s.entering === 'draw') {
            const clip = drawClip(editor, id)
            cls.push(`pres-dir-${clip.direction}`)
            style = clip.vars
          }
        }
        byId.set(id, { className: cls.join(' '), style })
      }
      shapeClassesAtom.set({ byId, fallback: { className: 'pres pres-visible' } })
      foldBadgesAtom.set(foldBadges(editor, stage))

      // Calques occultants : quand la séquence en change, elle reprend la main sur la fenêtre tracée à la volée.
      const spots = activeSpotlights(editor, seq, index, stage)
      const spotsKey = spots.join(',')
      if (spotsKey !== prevSpots) {
        if (prevSpots || spotsKey) liveSpotAtom.set(null)
        prevSpots = spotsKey
        activeSpotsAtom.set(spots)
      }
    })
  }, [editor])

  // 2. Caméra : ne bouge que lorsque l'étape ou la vue d'ensemble change.
  useEffect(() => {
    return react('presentation camera', () => {
      const mode = modeAtom.get()
      const index = stepIndexAtom.get()
      const overview = overviewAtom.get()
      recenterAtom.get()
      if (mode !== 'present') return
      const seq = readSequence(editor)
      if (!seq) return
      // Lecture hors suivi : la caméra ne doit pas se recaler à chaque modification du document.
      queueMicrotask(() => {
        const stage = computeEditorStage(editor, seq, index)
        moveCamera(editor, seq, index, stage, overview ? 'overview' : undefined)
      })
    })
  }, [editor])

  // 3. Entrée / sortie du mode présentation, verrouillage du document.
  useEffect(() => {
    let wasPresenting = false
    return react('presentation mode', () => {
      const presenting = modeAtom.get() === 'present'
      const unlocked = editUnlockedAtom.get()
      if (presenting) {
        if (!wasPresenting) savedCamera.current = editor.getCamera()
        // Taille du texte : celle du schéma (la fenêtre écran reçoit celle du présentateur).
        if (!wasPresenting && keyboard) {
          const scale = readSequence(editor)?.narrationScale ?? NARRATION_SCALE.default
          narrationScaleDefaultAtom.set(scale)
          narrationScaleAtom.set(scale)
        }
        if (!unlocked) {
          editor.selectNone()
          if (editor.getCurrentToolId() !== 'laser') editor.setCurrentTool('select')
        }
        editor.updateInstanceState({ isReadonly: !unlocked })
      } else if (wasPresenting) {
        editor.updateInstanceState({ isReadonly: false })
        editor.setCurrentTool('select')
        if (savedCamera.current) editor.setCamera(savedCamera.current, { animation: { duration: 300 } })
      }
      wasPresenting = presenting
    })
  }, [editor, keyboard])

  // Changement de page pendant la présentation : chaque page a sa séquence, qui reprend au début.
  // La fenêtre public reçoit la page et l'étape du présentateur.
  useEffect(() => {
    if (!keyboard) return
    let page = editor.getCurrentPageId()
    return react('presentation page', () => {
      const current = editor.getCurrentPageId()
      if (current === page) return
      page = current
      if (modeAtom.get() !== 'present') return
      clearLiveSpot()
      overviewAtom.set(false)
      stepIndexAtom.set(-1)
    })
  }, [editor, keyboard])

  // Fenêtre redimensionnée (téléphone tourné, panneau replié par le navigateur) : on recadre l'étape.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onResize = () => {
      if (modeAtom.get() !== 'present') return
      clearTimeout(timer)
      timer = setTimeout(recenterAfterResize, 150)
    }
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // 4. Durée d'affichage du laser, appliquée dès que le réglage change.
  useEffect(() => react('laser timing', () => applyLaserTiming(editor, laserSettingsAtom.get())), [editor])

  // 5. Clavier (compatible avec les télécommandes de présentation : PageUp / PageDown).
  useEffect(() => {
    if (!keyboard) return
    function onKeyDown(e: KeyboardEvent) {
      if (modeAtom.get() !== 'present') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      const index = stepIndexAtom.get()

      // Document déverrouillé : les touches servent à l'édition, seule la télécommande navigue.
      if (editUnlockedAtom.get()) {
        if (e.key === 'PageDown') goToStep(editor, index + 1)
        else if (e.key === 'PageUp') goToStep(editor, index - 1)
        else if (e.key === 'Escape' && spotToolAtom.get()) spotToolAtom.set(false)
        else return
        e.preventDefault()
        e.stopPropagation()
        return
      }

      let handled = true
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
        case 'Enter':
          goToStep(editor, index + 1)
          break
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
        case 'Backspace':
          goToStep(editor, index - 1)
          break
        case '?':
          shortcutsHelpOpenAtom.set(!shortcutsHelpOpenAtom.get())
          break
        case 'Home':
          goToStep(editor, -1)
          break
        case 'End':
          goToStep(editor, Number.MAX_SAFE_INTEGER)
          break
        case 'o':
        case 'O':
          toggleOverview()
          break
        case 'c':
        case 'C':
          recenter()
          break
        case 'k':
        case 'K':
          toggleLaser(editor)
          break
        case 'm':
        case 'M':
          toggleSpotTool(editor)
          break
        case 'n':
        case 'N':
          toggleNarration()
          break
        case 'Tab':
          cycleNoteTab(editor, e.shiftKey ? -1 : 1)
          swallowNextKeyUp('Tab')
          break
        case 'l':
        case 'L':
          legendVisibleAtom.set(!legendVisibleAtom.get())
          break
        case '+':
        case '=':
          changeNarrationScale(1)
          break
        case '-':
          changeNarrationScale(-1)
          break
        case '0':
          changeNarrationScale(null)
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 'Escape':
          if (laserPopoverOpenAtom.get() || moreMenuOpenAtom.get() || shortcutsHelpOpenAtom.get()) {
            laserPopoverOpenAtom.set(false)
            moreMenuOpenAtom.set(false)
            shortcutsHelpOpenAtom.set(false)
            break
          }
          // Échap défait d'abord l'outil en cours (calque, laser), puis quitte la présentation.
          if (spotToolAtom.get()) spotToolAtom.set(false)
          else if (liveSpotAtom.get()) clearLiveSpot()
          else if (editor.getCurrentToolId() === 'laser') editor.setCurrentTool('select')
          else if (!viewerAtom.get()) exitPresentation()
          break
        default:
          handled = false
      }
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [editor, keyboard])
}

/** Pastilles d'arbre de l'étape : « +n » sur les nœuds repliés, « − » possible sur les nœuds dépliés. */
function foldBadges(editor: Editor, stage: Stage) {
  const { children } = getTreeIndex(editor)
  const shown = (id: string) => stateOf(stage, id).visibility !== 'hidden'
  const folded: { id: string; n: number }[] = []
  const open: string[] = []
  for (const [id, kids] of children) {
    if (!shown(id)) continue
    if (stateOf(stage, id).folded) {
      // On ne compte que ce que le dépliage montrerait : pas les nœuds que la séquence n'a pas encore révélés.
      const n = branchOf(editor, id).filter((d) => stage.get(d)?.foldHidden).length
      if (n > 0) folded.push({ id, n })
    } else if (kids.some(shown)) open.push(id)
  }
  return { folded, open }
}

/**
 * Séquençage rapide : les objets des étapes suivantes sont estompés (on voit le schéma
 * tel qu'il est à l'étape active), les objets en attente de rattachement sont signalés.
 */
function quickSequencePreview(editor: Editor) {
  const seq = readSequence(editor)
  const index = seq ? seq.steps.findIndex((s) => s.id === activeStepIdAtom.get()) : -1
  const stage = seq ? computeEditorStage(editor, seq, index) : null
  const pending = new Set(pendingShapesAtom.get())
  const byId = new Map<string, ShapePresentation>()
  for (const id of editor.getCurrentPageShapeIds()) {
    if (pending.has(id)) byId.set(id, { className: 'seq-pending' })
    else if (stage && stateOf(stage, id).visibility === 'hidden') byId.set(id, { className: 'seq-ghost' })
  }
  return { byId, fallback: { className: '' } }
}

/** Séquençage rapide : l'étape active par défaut est la dernière. */
export function toggleQuickSequence(editor: Editor) {
  const on = !quickSequenceAtom.get()
  if (on) {
    const steps = readSequence(editor)?.steps ?? []
    if (!steps.some((s) => s.id === activeStepIdAtom.get())) activeStepIdAtom.set(steps.at(-1)?.id ?? null)
  }
  quickSequenceAtom.set(on)
}

/** Champs qui ne prennent pas le clavier : une case cochée ne doit pas bloquer la navigation. */
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'color'])

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type)
  return target.isContentEditable || ['TEXTAREA', 'SELECT'].includes(target.tagName)
}

// ---------- Commandes (clavier et boutons) ----------

export function toggleOverview() {
  overviewAtom.set(!overviewAtom.get())
}

/** Recaler la caméra sur l'étape courante après une navigation libre. */
export function recenter() {
  overviewAtom.set(false)
  recenterAtom.set(recenterAtom.get() + 1)
}

export function toggleLaser(editor: Editor) {
  const on = editor.getCurrentToolId() !== 'laser'
  if (on) spotToolAtom.set(false)
  editor.setCurrentTool(on ? 'laser' : 'select')
}

/**
 * Outil « calque occultant à la volée ». À l'activation, la fenêtre reprend
 * le calque de l'étape s'il y en a un, pour pouvoir l'ajuster.
 */
export function toggleSpotTool(editor: Editor) {
  const on = !spotToolAtom.get()
  if (on) {
    laserPopoverOpenAtom.set(false)
    if (editor.getCurrentToolId() === 'laser') editor.setCurrentTool('select')
    if (!liveSpotAtom.get()) {
      const bounds = boundsOf(editor, activeSpotsAtom.get())
      if (bounds) liveSpotAtom.set(bounds.toJson())
    }
  }
  spotToolAtom.set(on)
}

export function clearLiveSpot() {
  spotToolAtom.set(false)
  liveSpotAtom.set(null)
}

export function toggleNarration() {
  narrationVisibleAtom.set(!narrationVisibleAtom.get())
  recenterAfterResize()
}

export function toggleUnlocked() {
  editUnlockedAtom.set(!editUnlockedAtom.get())
}

export function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  else document.documentElement.requestFullscreen().catch(() => {})
}

/** La zone du canevas a changé de taille : on recadre une fois la mise en page stabilisée. */
export function recenterAfterResize() {
  // recenterAtom relance la caméra en conservant le mode courant (étape ou vue d'ensemble).
  setTimeout(() => recenterAtom.set(recenterAtom.get() + 1), 60)
}

/** Tab : onglet suivant du panneau de droite (narration, puis notes ouvertes) ; Maj+Tab : précédent. */
export function cycleNoteTab(editor: Editor, delta: 1 | -1) {
  const step = readSequence(editor)?.steps[stepIndexAtom.get()]
  const tabs: (string | null)[] = [null, ...panelNoteIds(editor, step, openedNotesAtom.get())]
  if (tabs.length < 2) return
  const i = Math.max(0, tabs.indexOf(activeNoteAtom.get()))
  activeNoteAtom.set(tabs[(i + delta + tabs.length) % tabs.length])
  narrationVisibleAtom.set(true)
}

/** Garde la taille courante du texte de la narration comme défaut du schéma (enregistré dans sa séquence). */
export function pinNarrationScale(editor: Editor) {
  const seq = readSequence(editor)
  if (!seq) return
  const scale = narrationScaleAtom.get()
  writeSequence(editor, { ...seq, narrationScale: scale === NARRATION_SCALE.default ? undefined : scale })
  narrationScaleDefaultAtom.set(scale)
}

'use client'

import { useEffect, useRef } from 'react'
import { react, type Editor, type TLCamera } from 'tldraw'
import { activeSpotlights, boundsOf, computeEditorStage, drawClip, moveCamera, readSequence } from '@/lib/canvas/adapter'
import { stateOf } from '@/lib/sequence/compute'
import { applyLaserTiming } from '@/lib/canvas/laser'
import {
  activeSpotsAtom,
  activeStepIdAtom,
  editUnlockedAtom,
  foldedBadgesAtom,
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
} from '@/lib/presentation/store'

export function enterPresentation(fromIndex = -1) {
  stepIndexAtom.set(fromIndex)
  overviewAtom.set(false)
  modeAtom.set('present')
}

export function exitPresentation() {
  laserPopoverOpenAtom.set(false)
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

/** Branche le moteur de présentation sur l'éditeur : classes CSS, caméra, clavier. */
export function usePresentation(editor: Editor) {
  const savedCamera = useRef<TLCamera | null>(null)

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
        foldedBadgesAtom.set([])
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
      const stage = computeEditorStage(editor, seq, index)

      const byId = new Map<string, ShapePresentation>()
      for (const id of editor.getCurrentPageShapeIds()) {
        const s = stateOf(stage, id)
        const cls = ['pres', `pres-${s.visibility}`]
        let style: Record<string, string> | undefined
        if (s.highlighted) cls.push('pres-hl')
        if (animate && s.entering && s.entering !== 'none' && s.visibility !== 'hidden') {
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
      foldedBadgesAtom.set([...stage].filter(([, s]) => s.folded && s.visibility !== 'hidden').map(([id]) => id))

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
  }, [editor])

  // 4. Durée d'affichage du laser, appliquée dès que le réglage change.
  useEffect(() => react('laser timing', () => applyLaserTiming(editor, laserSettingsAtom.get())), [editor])

  // 5. Clavier (compatible avec les télécommandes de présentation : PageUp / PageDown).
  useEffect(() => {
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
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 'Escape':
          if (laserPopoverOpenAtom.get()) {
            laserPopoverOpenAtom.set(false)
            break
          }
          // Échap défait d'abord l'outil en cours (calque, laser), puis quitte la présentation.
          if (spotToolAtom.get()) spotToolAtom.set(false)
          else if (liveSpotAtom.get()) clearLiveSpot()
          else if (editor.getCurrentToolId() === 'laser') editor.setCurrentTool('select')
          else exitPresentation()
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
  }, [editor])
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

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
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

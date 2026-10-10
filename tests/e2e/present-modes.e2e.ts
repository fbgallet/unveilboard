import { expect, test, type Page } from '@playwright/test'
import { hiddenShapes, openExample, present, stepCounter } from './helpers'

// Deux manières de présenter : « Révélation » (par défaut : chaque étape fait apparaître) et
// « Parcours » (tout visible, chaque étape cadre ses objets) ; un clic sur un objet mène à son
// étape ; la touche V (ou le menu ⋯) affiche tout le schéma, ou l'étape seule.

type Win = { editor: import('tldraw').Editor }

const mutedShapes = (page: Page) => page.evaluate(() => document.querySelectorAll('.tl-shape.pres-muted').length)

/** Clique (au milieu) une boîte que montre la dernière étape qui en montre une ; renvoie son numéro (1…). */
async function clickShapeOfLastStep(page: Page): Promise<number> {
  const { point, step } = await page.evaluate(() => {
    const { editor } = window as unknown as Win
    const steps = (editor.getDocumentSettings().meta.sequence as { steps: { actions: { type: string; targets: string[] }[] }[] }).steps
    const boxOf = (s: (typeof steps)[number]) =>
      s.actions.filter((a) => a.type === 'show').flatMap((a) => a.targets).find((t) => editor.getShape(t as never)?.type === 'geo')
    const index = steps.findLastIndex((s) => boxOf(s))
    const id = boxOf(steps[index])!
    // Au centre du canevas (pas sous le panneau de narration).
    const center = editor.getShapePageBounds(id as never)!.center
    editor.centerOnPoint(center)
    return { point: editor.pageToScreen(center), step: index + 1 }
  })
  await page.mouse.click(point.x, point.y)
  return step
}

test('Parcours : tout visible, l’étape mise en valeur, clic vers l’étape d’un objet, étape seule', async ({ page }) => {
  await openExample(page)
  await page.getByRole('radio', { name: 'Tour' }).click()
  await expect(page.getByRole('radio', { name: 'Tour' })).toHaveAttribute('aria-checked', 'true')
  await present(page)
  const total = Number((await stepCounter(page).textContent())!.split('/')[1])

  // Départ : tout est visible, rien d'atténué.
  await expect.poll(() => hiddenShapes(page)).toBe(0)
  expect(await mutedShapes(page)).toBe(0)

  // Première étape : toujours tout visible, le reste légèrement atténué.
  await page.keyboard.press('ArrowRight')
  await expect(stepCounter(page)).toHaveText(`1 / ${total}`)
  await expect.poll(() => mutedShapes(page)).toBeGreaterThan(0)
  expect(await hiddenShapes(page)).toBe(0)

  // Un clic sur un objet de la dernière étape y mène.
  const target = await clickShapeOfLastStep(page)
  expect(target).toBeGreaterThan(1)
  await expect(stepCounter(page)).toHaveText(`${target} / ${total}`)

  // V : l'étape seule ; encore V : retour à la séquence.
  await page.keyboard.press('v')
  await expect.poll(() => hiddenShapes(page)).toBeGreaterThan(0)
  await page.keyboard.press('v')
  await expect.poll(() => hiddenShapes(page)).toBe(0)
})

test('Révélation : V affiche tout le schéma, où un clic mène à l’étape d’un objet encore caché', async ({ page }) => {
  await openExample(page)
  await expect(page.getByRole('radio', { name: 'Reveal' })).toHaveAttribute('aria-checked', 'true')
  await present(page)
  const total = Number((await stepCounter(page).textContent())!.split('/')[1])
  await page.keyboard.press('ArrowRight')
  const hiddenAtStep1 = await hiddenShapes(page)
  expect(hiddenAtStep1).toBeGreaterThan(0)

  // Menu ⋯ › Affichage : tout le schéma (les objets à venir apparaissent, atténués).
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'View: sequence (V)' }).click()
  await expect.poll(() => hiddenShapes(page)).toBeLessThan(hiddenAtStep1)
  expect(await mutedShapes(page)).toBeGreaterThan(0)

  // Un clic sur un objet encore caché par la séquence mène à son étape, et l'affichage redevient la séquence.
  const target = await clickShapeOfLastStep(page)
  await expect(stepCounter(page)).toHaveText(`${target} / ${total}`)
  expect(await mutedShapes(page)).toBe(0)

  // V deux fois : tout, puis l'étape seule.
  await page.keyboard.press('v')
  await page.keyboard.press('v')
  await expect.poll(() => hiddenShapes(page)).toBeGreaterThan(0)
  // Changer d'étape ramène à la séquence.
  await page.keyboard.press('ArrowLeft')
  await expect(stepCounter(page)).toHaveText(`${target - 1} / ${total}`)
  expect(await mutedShapes(page)).toBe(0)
})

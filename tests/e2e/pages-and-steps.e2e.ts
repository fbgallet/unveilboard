import { expect, test, type Page } from '@playwright/test'
import { openExample, present, stepCounter } from './helpers'

// Une séquence par page, un objet dans plusieurs étapes (menu contextuel), caméra sur une zone définie.

type Win = { editor: import('tldraw').Editor }

const badges = (page: Page) => page.locator('.step-badge')
const stepCards = (page: Page) => page.locator('aside ol > li.rounded-lg')

test('chaque page a sa séquence : pastilles et étapes ne passent pas d’une page à l’autre', async ({ page }) => {
  await openExample(page)
  const firstSteps = await stepCards(page).count()
  expect(firstSteps).toBeGreaterThan(0)
  await expect(badges(page).first()).toBeVisible()

  // Nouvelle page : pas de pastilles, pas d'étapes ; une étape créée ici ne touche pas la page 1.
  await page.evaluate(() => {
    const { editor } = window as unknown as Win
    editor.createPage({ name: 'Second' })
    const second = editor.getPages().at(-1)!
    editor.setCurrentPage(second.id)
    editor.createShape({ type: 'geo', x: 0, y: 0, props: { w: 200, h: 100 } })
    editor.selectAll()
  })
  await expect(badges(page)).toHaveCount(0)
  await expect(stepCards(page)).toHaveCount(0)
  await expect(page.getByText('Steps of the page “Second”')).toBeVisible()
  await page.getByRole('button', { name: 'Step', exact: true }).click()
  await expect(stepCards(page)).toHaveCount(1)
  await expect(badges(page)).toHaveCount(1)

  // En présentation, le sélecteur de page change de séquence.
  await present(page)
  await expect(stepCounter(page)).toHaveText('0 / 1')
  await page.locator('.page-picker').selectOption({ index: 0 })
  await expect(stepCounter(page)).toHaveText(`0 / ${firstSteps}`)
  await page.keyboard.press('Escape')

  await expect(stepCards(page)).toHaveCount(firstSteps)
  // Format enregistré : la première page garde `steps`, les autres vont dans `pages`.
  const stored = await page.evaluate(() => {
    const seq = (window as unknown as Win).editor.getDocumentSettings().meta.sequence as { steps: unknown[]; pages?: Record<string, unknown[]> }
    return { steps: seq.steps.length, pages: Object.values(seq.pages ?? {}).map((s) => s.length) }
  })
  expect(stored).toEqual({ steps: firstSteps, pages: [1] })
})

test('menu contextuel : faire réapparaître un objet à une autre étape après l’avoir caché', async ({ page }) => {
  await openExample(page)
  // Un objet de l'étape 1, caché à l'étape 2 (action ajoutée depuis le menu contextuel).
  const id = await page.evaluate(() => {
    const { editor } = window as unknown as Win
    const seq = editor.getDocumentSettings().meta.sequence as { steps: { actions: { type: string; targets: string[] }[] }[] }
    return seq.steps[0].actions.find((a) => a.type === 'show')!.targets[0]
  })
  const rightClickOn = async () => {
    await page.evaluate((id) => {
      const { editor } = window as unknown as Win
      editor.select(id as never)
    }, id)
    const box = await page.evaluate((id) => {
      const { editor } = window as unknown as Win
      const b = editor.getShapePageBounds(id as never)!
      return editor.pageToViewport(b.center)
    }, id)
    const canvas = await page.locator('.tl-canvas').boundingBox()
    await page.mouse.click(canvas!.x + box.x, canvas!.y + box.y, { button: 'right' })
  }

  await stepCards(page).nth(1).click()
  await rightClickOn()
  await page.getByRole('menuitem', { name: 'Sequence' }).click()
  await page.getByRole('menuitem', { name: 'Active step (2)' }).click()
  await page.getByRole('menuitem', { name: 'Hide' }).click()

  await rightClickOn()
  await page.getByRole('menuitem', { name: 'Sequence' }).click()
  await page.getByRole('menuitem', { name: 'Show at step' }).click()
  await page.getByRole('menuitem', { name: /^3\. / }).click()

  await expect(page.getByText('This object appears at steps 1, 3 (hidden in between).')).toBeVisible()
  await expect(page.locator('.step-badge', { hasText: '1 · 3' })).toHaveCount(1)
})

test('caméra : zone définie, cadrée en présentation', async ({ page }) => {
  await openExample(page)
  await stepCards(page).first().click()
  // Zone : la vue actuelle, qu'on déplace ensuite pour vérifier que la présentation y revient.
  const area = await page.evaluate(() => {
    const { editor } = window as unknown as Win
    editor.selectNone()
    editor.setCamera({ x: -300, y: -200, z: 1.5 })
    const { x, y, w, h } = editor.getViewportPageBounds()
    return { cx: x + w / 2, cy: y + h / 2 }
  })
  await stepCards(page).first().getByRole('combobox').last().selectOption('area')
  await expect(page.locator('.camera-area')).toBeVisible()
  await page.evaluate(() => {
    ;(window as unknown as Win).editor.setCamera({ x: 2000, y: 2000, z: 0.3 })
  })

  await present(page)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(1200)
  const center = await page.evaluate(() => {
    const { editor } = window as unknown as Win
    const vp = editor.getViewportScreenBounds()
    // Centre de la zone utile (au-dessus de la barre de progression, 48 px).
    return editor.screenToPage({ x: vp.x + vp.w / 2, y: vp.y + (vp.h - 48) / 2 })
  })
  expect(Math.abs(center.x - area.cx)).toBeLessThan(40)
  expect(Math.abs(center.y - area.cy)).toBeLessThan(40)
})

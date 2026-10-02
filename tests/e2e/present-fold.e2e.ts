import { expect, test, type Page } from '@playwright/test'
import { hiddenShapes, present } from './helpers'

// Replier / déplier une branche d'arbre pendant la présentation : le geste s'ajoute à la séquence
// sans toucher au document, suit au projecteur, et s'efface quand on revient en arrière.

type Win = { editor: import('tldraw').Editor }

async function openTruthExample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.waitForTimeout(1500)
}

/** Racine de l'arbre (nœud sans parent, avec enfants) et le centre de son cadre à l'écran. */
const rootNode = (page: Page) =>
  page.evaluate(() => {
    const { editor } = window as unknown as Win
    const ends = editor
      .getCurrentPageShapes()
      .filter((s) => s.type === 'arrow' && s.meta.branch)
      .map((a) => editor.getBindingsFromShape(a, 'arrow') as unknown as { toId: string; props: { terminal: string } }[])
    const from = new Set(ends.map((b) => b.find((x) => x.props.terminal === 'start')!.toId))
    const to = new Set(ends.map((b) => b.find((x) => x.props.terminal === 'end')!.toId))
    const id = [...from].find((f) => !to.has(f))!
    const b = editor.getShapePageBounds(id as never)!
    const p = editor.pageToViewport({ x: b.midX, y: b.midY })
    const origin = editor.getViewportScreenBounds()
    return { id, x: origin.x + p.x, y: origin.y + p.y, folded: !!editor.getShape(id as never)!.meta.folded }
  })

/**
 * Racine une fois la caméra et l'arbre immobiles : tldraw ne met pas à jour la forme survolée pendant
 * que la caméra bouge (cadrage de l'étape, arbre resserré ou écarté), et un survol pendant le
 * mouvement resterait sans effet.
 */
async function settledRoot(page: Page) {
  let last = ''
  await expect
    .poll(
      async () => {
        const root = await rootNode(page)
        const camera = await page.evaluate(() => JSON.stringify((window as unknown as Win).editor.getCamera()))
        const now = `${camera}|${root.x},${root.y}`
        const still = now === last
        last = now
        return still
      },
      { intervals: [250] }
    )
    .toBe(true)
  return rootNode(page)
}

test('présentation : replier et déplier une branche à la main', async ({ page, context }) => {
  await openTruthExample(page)
  await present(page)
  await page.getByTitle('More').click()
  const [screen] = await Promise.all([context.waitForEvent('page'), page.getByRole('menuitem', { name: /Project on a second screen/ }).click()])
  await expect(screen.locator('.screen-view')).toBeVisible()

  await page.keyboard.press('End')
  const before = await hiddenShapes(page)

  // Survol de la racine : « − » pour replier sa branche.
  const root = await settledRoot(page)
  await page.mouse.move(root.x, root.y)
  const collapse = page.locator('.fold-badge-open')
  await expect(collapse).toHaveCount(1)
  await collapse.click()

  const badge = page.locator('.fold-badge:not(.fold-badge-open)')
  await expect(badge).toHaveText(/^\+\d+$/)
  expect(await hiddenShapes(page)).toBeGreaterThan(before)
  // Au projecteur aussi, mais sans pastille cliquable.
  await expect.poll(() => hiddenShapes(screen)).toBe(await hiddenShapes(page))
  await expect(screen.locator('.fold-badge')).toBeDisabled()
  // Le document n'est pas modifié.
  expect((await rootNode(page)).folded).toBe(root.folded)

  // « +n » : déplier rend l'état de la séquence.
  await badge.click()
  await expect.poll(() => hiddenShapes(page)).toBe(before)

  // Revenir en arrière efface les gestes faits à la main.
  const again = await settledRoot(page)
  await page.mouse.move(again.x - 1, again.y)
  await page.mouse.move(again.x, again.y)
  await page.locator('.fold-badge-open').click()
  await expect.poll(() => hiddenShapes(page)).toBeGreaterThan(before)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('End')
  await expect.poll(() => hiddenShapes(page)).toBe(before)
})

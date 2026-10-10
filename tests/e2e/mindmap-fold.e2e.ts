import { expect, test, type Page } from '@playwright/test'
import { present } from './helpers'

// Carte mentale (branches courbes) : déplier ouvre toute la branche, repli par niveau, et en
// présentation, dépliage sans plantage, niveaux (menu ⋯, touches 1 à 9), pastille « − » au laser.

type Win = { editor: import('tldraw').Editor; unveilboard: { apply(json: object): Promise<unknown> } }

// r → A, B, C, D → A1…D3 → feuilles x, y. B et les sous-branches n°2 sont repliées au départ.
const elements: object[] = [{ id: 'r', text: 'Racine', tree: { kind: 'mindmap', direction: 'both' } }]
for (const a of ['A', 'B', 'C', 'D']) {
  elements.push({ id: a, text: `Branche ${a}`, parent: 'r', ...(a === 'B' && { folded: true }) })
  for (const b of [1, 2, 3]) {
    elements.push({ id: `${a}${b}`, text: `Sous-branche ${a}${b}`, parent: a, ...(b === 2 && { folded: true }) })
    for (const c of ['x', 'y']) elements.push({ id: `${a}${b}${c}`, text: `Feuille ${a}${b}${c}`, parent: `${a}${b}` })
  }
}
const steps = [
  { title: 'Racine', actions: [{ do: 'show', targets: ['r'] }] },
  { title: 'Branches', actions: [{ do: 'show', targets: ['A', 'B', 'C', 'D'] }] },
  { title: 'Replier A', actions: [{ do: 'fold', targets: ['A'] }] },
]

async function openMindMap(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard)
  await page.waitForTimeout(1500)
  const before = page.url()
  const map = { format: 'unveilboard/map', version: 1, title: 'Carte', lang: 'fr', elements, sequence: { steps } }
  await page.evaluate((m) => (window as unknown as Win).unveilboard.apply(m), map)
  await page.waitForURL((url) => url.href !== before)
  await page.waitForFunction(() => (window as unknown as Win).editor?.getCurrentPageShapes().filter((s) => s.meta.ref).length === 41)
  await page.waitForTimeout(500)
}

const shapeOf = (page: Page, ref: string) =>
  page.evaluate((ref) => String((window as unknown as Win).editor.getCurrentPageShapes().find((s) => s.meta.ref === ref)!.id), ref)

/** Édition : nœuds visibles (non masqués par un repli). */
const visibleNodes = (page: Page) =>
  page.evaluate(() => {
    const { editor } = window as unknown as Win
    return editor.getCurrentPageShapes().filter((s) => s.meta.ref && !editor.isShapeHidden(s)).length
  })

/** Présentation : nœuds (pas les flèches) cachés par la séquence. */
const hiddenNodes = (page: Page) =>
  page.evaluate(() => {
    const { editor } = window as unknown as Win
    return editor.getCurrentPageShapes().filter((s) => s.meta.ref && document.querySelector(`[data-shape-id="${s.id}"]`)?.classList.contains('pres-hidden')).length
  })

/** Centre d'un nœud à l'écran, une fois la caméra et les nœuds immobiles. */
async function settledCenter(page: Page, ref: string) {
  let last = ''
  const center = () =>
    page.evaluate((ref) => {
      const { editor } = window as unknown as Win
      const s = editor.getCurrentPageShapes().find((x) => x.meta.ref === ref)!
      const b = editor.getShapePageBounds(s.id)!
      const p = editor.pageToViewport({ x: b.midX, y: b.midY })
      const o = editor.getViewportScreenBounds()
      return { x: o.x + p.x, y: o.y + p.y }
    }, ref)
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await center())
        const still = now === last
        last = now
        return still
      },
      { intervals: [250] }
    )
    .toBe(true)
  return center()
}

test('carte mentale : déplier ouvre toute la branche, repli par niveau', async ({ page }) => {
  await openMindMap(page)
  // B repliée (+9 : ses 3 sous-branches et leurs 6 feuilles), sous-branches n°2 repliées ailleurs.
  expect(await visibleNodes(page)).toBe(26)
  const b = await shapeOf(page, 'B')
  await page.evaluate((id) => void (window as unknown as Win).editor.select(id as never), b)
  const plusB = page.locator('.fold-badge', { hasText: '+9' })
  await expect(plusB).toHaveCount(1)
  await plusB.click()
  // Les 9 apparaissent : B2, repliée dans B, s'ouvre avec elle.
  await expect.poll(() => visibleNodes(page)).toBe(35)

  // Niveaux (bouton de la barre d'arbre, qui ouvre les niveaux) : 1 ne laisse que la racine et ses
  // branches ; « All » déplie tout. Le bouton affiche le niveau courant (« – » : replis mêlés).
  const levelsButton = page.getByRole('button', { name: /Collapse the whole tree to a level/ })
  await expect(levelsButton).toContainText('–')
  await levelsButton.click()
  const levels = page.getByRole('group', { name: 'Levels' })
  await levels.getByRole('button', { name: '1', exact: true }).click()
  await expect.poll(() => visibleNodes(page)).toBe(5)
  await expect(levels.getByRole('button', { name: '1', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(levelsButton).toContainText('1')
  await levels.getByRole('button', { name: '2', exact: true }).click()
  await expect.poll(() => visibleNodes(page)).toBe(17)
  await levels.getByRole('button', { name: 'All', exact: true }).click()
  await expect.poll(() => visibleNodes(page)).toBe(41)
  await page.keyboard.press('Control+z')
  await expect.poll(() => visibleNodes(page)).toBe(17)
})

test('carte mentale en présentation : déplier, niveaux, pastille « − » avec le laser', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openMindMap(page)
  await present(page)
  await page.keyboard.press('End')
  // Étape 3 : A repliée par la séquence (9 nœuds), B par le document (9), C2 et D2 aussi (2 + 2).
  await expect.poll(() => hiddenNodes(page)).toBe(22)
  const before = await hiddenNodes(page)

  // « +9 » sur A : toute la branche s'ouvre (A2 comprise), en glissant, sans plantage.
  await page.locator('.fold-badge', { hasText: '+9' }).first().click()
  await expect.poll(() => hiddenNodes(page)).toBe(before - 9)
  expect(errors).toEqual([])

  // Touche 1 : la racine et ses branches ; 1 encore : tout déplié.
  await page.keyboard.press('1')
  await expect.poll(() => hiddenNodes(page)).toBe(36)
  await page.keyboard.press('1')
  await expect.poll(() => hiddenNodes(page)).toBe(0)
  // Menu ⋯ : niveau 2.
  await page.getByTitle('More').click()
  await page.locator('.more-levels').getByRole('button', { name: '2' }).click()
  await expect.poll(() => hiddenNodes(page)).toBe(24)

  // Laser actif : le pointeur près de la racine montre « − », qui replie tout l'arbre.
  await page.keyboard.press('k')
  const root = await settledCenter(page, 'r')
  await page.mouse.move(root.x, root.y)
  const collapse = page.locator('.fold-badge-open')
  await expect(collapse).toHaveCount(1)
  await collapse.click()
  await expect.poll(() => hiddenNodes(page)).toBe(40)
  expect(errors).toEqual([])
})

test('orientation : choisie au sélecteur, elle oriente le prochain arbre créé', async ({ page }) => {
  await openMindMap(page)
  await page.evaluate(async () => {
    const { editor } = window as unknown as Win
    editor.select(editor.getCurrentPageShapes().find((s) => s.meta.ref === 'r')!.id)
  })
  // Le bouton d'orientation montre la flèche courante, et ouvre les cinq orientations.
  const direction = page.getByRole('button', { name: /Direction of the tree/ })
  await expect(direction).toHaveText('↔')
  await direction.click()
  await page.getByRole('group', { name: /Direction of the tree/ }).getByRole('button', { name: '↓' }).click()
  await expect(direction).toHaveText('↓')

  // Nouvelle boîte, Tab : l'arbre qui commence s'oriente vers le bas.
  const dir = await page.evaluate(() => {
    const { editor } = window as unknown as Win
    editor.createShape({ type: 'geo', x: 3000, y: 3000, props: { w: 160, h: 60 } })
    const box = editor.getCurrentPageShapes().find((s) => s.x === 3000)!
    editor.select(box.id)
    return String(box.id)
  })
  await page.keyboard.press('Tab')
  await page.keyboard.press('Escape')
  await page.evaluate((id) => void (window as unknown as Win).editor.select(id as never), dir)
  await expect(direction).toHaveText('↓')
})

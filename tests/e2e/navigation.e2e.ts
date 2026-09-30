import { expect, test, type Page } from '@playwright/test'
import { openExample, present } from './helpers'

// Revenir à la liste des schémas, ou passer à un autre, depuis l'éditeur : menu ☰ et panneau replié.

async function newDiagram(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram', exact: true }).first().click()
  await page.waitForURL(/\/d\//)
  await page.waitForFunction(() => (window as unknown as { editor?: unknown }).editor && document.querySelector('aside'))
  return page.url()
}

test('menu ☰ : schémas récents, nouveau schéma et retour à la liste', async ({ page }) => {
  const first = await newDiagram(page)
  const second = await newDiagram(page)
  expect(second).not.toBe(first)

  // Récents : le schéma précédent, pas celui qui est ouvert.
  await page.getByTestId('main-menu.button').click()
  await page.getByText('Recent diagrams').click()
  await page.getByTestId(`main-menu.recent-${first.split('/d/')[1]}`).click()
  await page.waitForURL(first)

  // Nouveau schéma, directement depuis le menu.
  await page.waitForFunction(() => (window as unknown as { editor?: unknown }).editor)
  await page.getByTestId('main-menu.button').click()
  await page.getByTestId('main-menu.new-diagram').click()
  await page.waitForURL((url) => url.pathname.startsWith('/d/') && url.href !== first)

  // Retour à la liste.
  await page.waitForFunction(() => (window as unknown as { editor?: unknown }).editor)
  await page.getByTestId('main-menu.button').click()
  await page.getByTestId('main-menu.my-diagrams').click()
  await page.waitForURL((url) => url.pathname === '/')
})

test('panneau des étapes replié : le logo ramène à la liste', async ({ page }) => {
  await newDiagram(page)
  await page.getByRole('button', { name: 'Collapse the panel' }).click()
  await page.getByRole('link', { name: 'Back to my diagrams' }).click()
  await page.waitForURL((url) => url.pathname === '/')
})

test('fin de la présentation : un bouton explicite pour la quitter', async ({ page }) => {
  await openExample(page)
  await present(page)
  await expect(page.getByRole('button', { name: 'End the presentation' })).toHaveCount(0)
  await page.keyboard.press('End')
  await page.getByRole('button', { name: 'End the presentation' }).click()
  await expect(page.getByRole('button', { name: '▶ Present', exact: true })).toBeVisible()
})

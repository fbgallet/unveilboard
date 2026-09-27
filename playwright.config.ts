import { defineConfig, devices } from '@playwright/test'

// Tests de bout en bout, en mode local (sans base de données), sur un serveur de développement :
// le partage public y utilise un stockage en mémoire, et le signalement s'affiche dans la console.
// E2E_BASE_URL : réutiliser un serveur déjà lancé (un seul `next dev` par dossier).
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100'

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'en-US',
    viewport: { width: 1400, height: 850 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 850 } } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm exec next dev --port 3100',
        url: baseURL,
        env: { DATABASE_URL: '', LEGAL_PUBLISHER: 'Test Publisher', LEGAL_LINKS: 'https://example.com' },
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
      },
})

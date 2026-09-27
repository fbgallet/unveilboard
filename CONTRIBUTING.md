# Contributing to Unveilboard

Thanks for your interest! Unveilboard is a small side project maintained on free time, so replies may take a few days.

## Before you start

- For anything bigger than a small fix, please **open an issue first** to discuss it. It avoids working on something that doesn't fit the project.
- Bug reports are very welcome: describe what you did, what you expected, and what happened (a `.tldr` file helps).

## Development

```bash
pnpm install
pnpm dev          # local mode: no database needed
```

Before submitting a pull request:

```bash
npx tsc --noEmit
pnpm lint
pnpm test         # unit tests (sequence engine, trees, presets, sharing)
pnpm test:e2e     # end-to-end tests in a browser (starts a dev server on port 3100)
```

`pnpm test:e2e` needs Chromium for Playwright once: `pnpm exec playwright install chromium`. If a dev server is already running (only one `next dev` per folder), reuse it: `E2E_BASE_URL=http://localhost:3000 pnpm test:e2e`. The phone remote test uses PeerJS's public service and is skipped unless `E2E_PEERJS=1`. CI runs types, lint, unit and end-to-end tests on every pull request.

Please test your change in the browser, both in editing and in presentation mode, in light and dark themes.

## Guidelines

- **Keep tldraw behind the adapter.** The presentation engine only talks to tldraw through `src/lib/canvas/adapter.ts`. The sequence model (`src/lib/sequence/`) stays pure data.
- **Never modify the document during a presentation.** Presentation state is computed and applied with CSS classes.
- **Storage goes through `DocumentStore`** (`src/lib/storage/`), so both local and cloud modes keep working.
- **Use the Tailwind palette for colors** (`bg-white`, `text-stone-600`, `var(--color-stone-500)` in CSS), not hard-coded values: dark mode works by redefining the palette. Check your change in both themes (tldraw's menu › Preferences › Color scheme).
- **Don't hide the tldraw watermark**, and don't use the tldraw name or logo in branding (see the [tldraw trademark guidelines](https://tldraw.dev/legal/trademarks)).
- Existing code comments are in French. New comments can be in English or French.

## Code of conduct and security

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). To report a vulnerability, see [SECURITY.md](SECURITY.md): please do not open a public issue.

## License

By contributing, you agree that your contributions will be released under the project's [MIT license](LICENSE).

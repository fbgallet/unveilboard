# Architecture and development

**English** · [Français](architecture.fr.md)

For contributors: how the code is organised, tests, languages and dark mode.

## Architecture

- `src/lib/sequence/`: the sequence model and the computation of the state at a given step. Pure data, no dependency on tldraw.
- `src/lib/canvas/adapter.ts`: the only place where the presentation engine touches tldraw (reading and writing the sequence in `document.meta`, camera, geometry).
- `src/components/usePresentation.ts`: applies the computed state (CSS classes on shapes), drives the camera and the keyboard.
- `src/components/PresShapeWrapper.tsx`: wraps each rendered shape. The document is never modified during a presentation.
- `src/lib/tree/` and `src/lib/canvas/tree.ts`: trees (mind maps) on regular tldraw shapes, connected by arrows marked `meta.branch`. Without this module, the document stays a normal tldraw diagram.
- `src/lib/share/`: shared links (compression into the link, checks before public publication); `src/lib/presentation/screen.ts` and `src/lib/remote/`: dual screen and phone remote.
- `src/lib/map/`: the JSON diagram format (Zod schema, checks, sequence conversion), without tldraw; `src/lib/canvas/mapExport.ts` and `mapImport.ts`: conversion to and from the tldraw document.

The sequence is stored in the tldraw document: it benefits from undo/redo and local persistence (IndexedDB).

## Tests

```bash
pnpm test         # unit tests (Vitest): sequence engine, trees, presets, sharing
pnpm test:e2e     # end-to-end tests (Playwright), in local mode, on a dev server started on port 3100
```

The first time: `pnpm exec playwright install chromium`. To reuse a dev server that is already running: `E2E_BASE_URL=http://localhost:3000 pnpm test:e2e`. The phone remote test uses PeerJS's public service and only runs with `E2E_PEERJS=1`. CI (GitHub Actions) runs types, lint, unit and end-to-end tests.

## Languages

The interface exists in English and French (EN · FR selector on the home and login pages); by default it follows the browser's language, and the choice is kept in a cookie. tldraw's own interface follows the same language. Texts are in `src/i18n/`: `en.ts` is the reference, and TypeScript flags any key missing in `fr.ts`. Adding a language means adding one file. The content of diagrams is never translated; only defaults follow the language (titles, default presets, example: liberty in French, the water cycle in English).

## Dark mode

In the editor, the app's panels (steps, narration, toolbars) follow the color scheme chosen in tldraw's preferences: light, dark or system. The home, login and legal pages follow the system. In dark mode, the Tailwind palette is redefined in `globals.css` (`dark-palette` utility: inverted grays), so interface colors go through its variables (`bg-white`, `var(--color-stone-500)`…), never hard-coded values.

## Contributing

Contributions are welcome: see [CONTRIBUTING.md](../CONTRIBUTING.md). This project follows the [Contributor Covenant](../CODE_OF_CONDUCT.md). To report a vulnerability, see [SECURITY.md](../SECURITY.md). Changes are listed in [CHANGELOG.md](../CHANGELOG.md).

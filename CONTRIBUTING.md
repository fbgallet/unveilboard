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
pnpm test         # if you touched src/lib/sequence or src/lib/tree
```

Please test your change in the browser, both in editing and in presentation mode.

## Guidelines

- **Keep tldraw behind the adapter.** The presentation engine only talks to tldraw through `src/lib/canvas/adapter.ts`. The sequence model (`src/lib/sequence/`) stays pure data.
- **Never modify the document during a presentation.** Presentation state is computed and applied with CSS classes.
- **Storage goes through `DocumentStore`** (`src/lib/storage/`), so both local and cloud modes keep working.
- **Don't hide the tldraw watermark**, and don't use the tldraw name or logo in branding (see the [tldraw trademark guidelines](https://tldraw.dev/legal/trademarks)).
- Existing code comments are in French. New comments can be in English or French.

## License

By contributing, you agree that your contributions will be released under the project's [MIT license](LICENSE).

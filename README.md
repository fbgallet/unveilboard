# Unveilboard

*Show your diagrams step by step. Built with [tldraw](https://tldraw.dev).*

**English** · [Français](README.fr.md)

![A diagram of the water cycle revealed step by step, with its narration](docs/demo.gif)

Unveilboard turns a tldraw canvas into a progressive presentation. Instead of showing a whole diagram at once, you reveal it step by step, with a narration next to it. It was made for teaching: an audience follows the reasoning more easily when the diagram is built in front of it.

Working on a text? Build the diagram from it: the text stays beside the diagram, and each element is linked to the passages it comes from.

**Try it:** [unveilboard.com](https://unveilboard.com). No account needed; your diagrams stay in your browser.

> Unveilboard is not affiliated with, or endorsed by, tldraw Inc. "tldraw" is a trademark of tldraw Inc.

## Three things it does

**Reveal a diagram step by step.** Each step shows, dims, hides or highlights shapes, moves the camera and displays its narration. Present with the keyboard or a clicker, a laser pointer, a projector window and a phone remote. → [Presenting](docs/presenting.md)

**Build it from a text.** Paste a text or open a file: it stays in a sidebar, its cited passages highlighted in the colors of their elements, even while presenting. Select a passage to turn it into an element, or link it to an existing one. → [Source texts](docs/source-texts.md)

**Use an AI, if you want.** Your own AI (through a copied prompt or your OpenRouter key), a local model, or the instance's: create, enrich, sequence or review a diagram, or build a rich one section by section from a plan. Answers are checked, and excerpts are searched for in the text. → [Working with an AI](docs/ai.md)

## At a glance

- **Diagrams**: trees, mind maps and argument maps on regular tldraw shapes, with element types and relations (the shape tells the type, the color the function). → [Building diagrams](docs/diagrams.md), [Building argument maps](docs/argument-maps.md)
- **Presentation**: steps and camera, narration and object notes, overview, masking layer, legend, shortcuts. → [Presenting](docs/presenting.md)
- **In the classroom**: an audience window for the projector, a phone remote, a printable handout. → [In the classroom](docs/presenting.md#in-the-classroom)
- **Sharing**: a read-only link, a short link with a QR code to project, the source text if you choose to include it. → [Read-only sharing](docs/presenting.md#read-only-sharing)
- **Files and formats**: `.tldr` files (kept in sync with a file in Chrome and Edge), a documented JSON format for diagrams and changes. → [The JSON diagram format](docs/map-format.md)
- **English and French** interface, dark mode.

## Getting started

```bash
pnpm install
pnpm dev
```

That's all for the local mode: no database, no password, diagrams stay in the browser. To deploy on Vercel, set `TLDRAW_LICENSE_KEY`; for the cloud mode (Postgres, password), public sharing and the instance's AI, see [Self-hosting](docs/self-hosting.md).

## Documentation

| | |
|---|---|
| [Presenting](docs/presenting.md) | Steps, camera, narration, shortcuts, classroom, handout, sharing |
| [Source texts](docs/source-texts.md) | The text beside the diagram, passages, building from a text, layers |
| [Working with an AI](docs/ai.md) | Providers, tasks, rich diagrams, critical review |
| [Building diagrams](docs/diagrams.md) | Trees, argument maps, style presets, files |
| [Building argument maps](docs/argument-maps.md) | Element types and relations, with examples |
| [The JSON diagram format](docs/map-format.md) | Diagrams, changes and reviews as JSON |
| [Self-hosting](docs/self-hosting.md) | Storage modes, deployment, settings, saving and sync |
| [Architecture](docs/architecture.md) | Code organisation, tests, languages |

## Contributing

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). To report a vulnerability, see [SECURITY.md](SECURITY.md). Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## License

Unveilboard's code is released under the [MIT license](LICENSE). The Source Serif 4 font files in `assets/fonts/` (used for link preview images) are under the [SIL Open Font License](assets/fonts/OFL.txt).

It depends on the tldraw SDK, which has its own [license](https://tldraw.dev/community/license): every production deployment needs a tldraw license key. A free hobby license is available for non-commercial use; it displays a "made with tldraw" watermark.

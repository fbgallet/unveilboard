# Changelog

All notable changes to Unveilboard. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- JSON diagram format (`unveilboard/map`, documented in `docs/map-format.md`, with a JSON Schema): export a diagram as JSON or copy it for an AI, and import a JSON diagram as a new one, checked (errors and warnings with their path) and laid out automatically. The argument example is now described in this format.
- Handout: one section per step (the diagram at that step, dimmed shapes in grey, and the narration), to print or save as PDF.
- Examples gallery on the home page, with a new bilingual argument tree (“Should we always tell the truth?”, Kant and Constant) built with the same functions as the editor.
- Shortcuts help while presenting (`?` key, or the ⋯ menu).
- Linked `.tldr` files (Chrome, Edge): a diagram opened from a file, or saved to one, keeps it up to date automatically (<kbd>Ctrl/⌘</kbd>+<kbd>S</kbd> to save at once, <kbd>Ctrl/⌘</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> to save elsewhere), so it can live in a synced folder (Google Drive, Dropbox…). Changes made elsewhere are reloaded, conflicts are asked about, and reopening the file no longer creates a duplicate.

### Changed
- Horizontal argument trees are more widely spaced (220 px between levels), so relation labels ("presupposes", "illustrates") no longer break mid-word. Existing trees widen at their next layout.
- CI generates Next's route types before type checking (`pnpm typecheck`).

## [0.2.0] - 2026-09-27

### Added
- Read-only sharing: a link with the diagram inside (any instance), published short links (cloud mode), and public sharing on local-mode instances (Upstash), with content checks, rate limits, 30-day expiry, reports by email and a QR code to project.
- Classroom: dual screen (audience window for the projector, presenter view with timer and next step) and a phone remote (direct WebRTC connection, with a diagnostic of the network path).
- Argument maps: natures (shape) and functions (color), fundamental beliefs, relations that style and orient branches, tree directions, and a legend while presenting.
- Object notes and full Markdown narration (editor with toolbar, shortcuts and images), with a per-diagram text size.
- Dark mode (editor panels follow tldraw's color scheme; home, login and legal pages follow the system).
- Presentation on phones and tablets: narration below the diagram in portrait, narrower in landscape.
- Logo, favicon (light and dark), link preview image and Apple touch icon.
- Legal notice and privacy page with a contact form (`LEGAL_PUBLISHER`).
- End-to-end tests (Playwright), CI (GitHub Actions), code of conduct, security policy, issue templates.

### Changed
- The presentation bar groups less frequent actions (recenter, unlock, project, phone remote) in a ⋯ menu.
- Camera framing keeps the step clear of the presentation bar and adapts its margin to small screens.
- The tldraw license key is read at runtime (`TLDRAW_LICENSE_KEY`).

### Fixed
- A focused checkbox no longer blocks presentation keys.
- Key hints in the quick sequencing bar were invisible (white on white).

## [0.1.0] - 2026-09-26

First public release, under the MIT license.

### Added
- Step-by-step presentations on a tldraw canvas: show, dim, hide, highlight and focus actions, entrance effects, camera per step, narration panel.
- Presentation mode: keyboard and presentation remotes, overview, recenter, laser pointer, masking layer, unlocked editing.
- Quick sequencing.
- Trees and mind maps on regular tldraw shapes (Tab / Enter, automatic layout, collapsible branches).
- Style presets shared by all diagrams.
- Local mode (browser storage, `.tldr` files) and cloud mode (Postgres, password), with optimistic locking and a local cache.
- English and French interface, public home page.

[Unreleased]: https://github.com/fbgallet/unveilboard/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/fbgallet/unveilboard/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/fbgallet/unveilboard/releases/tag/v0.1.0

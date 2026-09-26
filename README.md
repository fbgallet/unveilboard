# Unveilboard

*Show your diagrams step by step. Built with [tldraw](https://tldraw.dev).*

**English** · [Français](README.fr.md)

Unveilboard turns a tldraw canvas into a progressive presentation. Instead of showing a whole diagram at once, you reveal it step by step: each step can show, dim, hide or highlight shapes, move the camera, and display a narration text next to the diagram.

It was made for teaching: an audience follows the reasoning more easily when the diagram is built in front of it, and spends less time copying it down.

**Try it:** [unveilboard.com](https://unveilboard.com). No account needed; your diagrams stay in your browser.

> Unveilboard is not affiliated with, or endorsed by, tldraw Inc. "tldraw" is a trademark of tldraw Inc.

> The interface is available in English and French (switch with the EN · FR selector on the home page). It follows your browser's language by default.

## Features

- **Steps**: show, dim, hide, restore, highlight or focus shapes, with entrance effects (fade, rise, draw).
- **Camera per step**: follow the new shapes, show the whole diagram, or stay put.
- **Narration panel**: a text for each step, shown next to the diagram (resizable, can be hidden).
- **Presentation mode**: keyboard and presentation-remote navigation, overview and recenter, laser pointer (color, width and fade-out delay are configurable), and an "unlocked" mode to edit the diagram during the presentation.
- **Dual screen for the classroom**: while presenting, "Project" opens an audience window for the projector (moved to the second screen on Chrome and Edge). It shows the diagram only (the narration on demand) and follows your screen: steps, overview, laser, hand-drawn masking layer, opened notes, live edits. Your screen becomes a presenter view with a timer and the next step. Keys pressed in the audience window (a presentation remote) are played on yours. No server involved: both windows talk inside the browser.
- **Phone remote**: while presenting, the phone button shows a QR code; scan it and your phone becomes a remote with the narration, the next step and a timer. The two devices connect directly (WebRTC; PeerJS's public service is only used to put them in touch, nothing goes through this site's server). Direct connections can fail on some school Wi-Fi or mobile networks: the app says so and shows the connection type it got.
- **Mobile-friendly reading**: on a phone in portrait, the narration moves below the diagram.
- **Quick sequencing**: create shapes and add them to the current step, or to a new step before or after it, in one click.
- **Trees and mind maps** on regular tldraw shapes: <kbd>Tab</kbd> adds a child, <kbd>Enter</kbd> adds a sibling, automatic layout in any direction or on both sides, collapsible branches.
- **Argument maps**: natures for shapes (statement, fundamental belief, concept, question, problem, example, quote), each with its geometry and a label (with author and descriptive/normative modality), and typed relations for arrows (supports, objects, refutes, answers, explains, implies, presupposes…). In an argument tree, <kbd>Tab</kbd> offers a relation that styles and orients the branch; the shape tells the nature, the color tells the function (justification, objection, explanation…). Presets are editable and shared by all your diagrams; <kbd>L</kbd> shows a legend while presenting.
- **Object notes**: the longer text about a shape is written in the side panel and shown in its own tab of the narration panel on double-click, or at a given step. Narration and notes use Markdown (headings, lists, links, tables, images) with a toolbar, <kbd>Ctrl/⌘</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>K</kbd>, a preview and a large editor.
- **Text size of the side panel**: a default per diagram, adjusted during a presentation with <kbd>+</kbd> / <kbd>−</kbd> or <kbd>Ctrl</kbd> + wheel.
- **Read-only sharing**: "Share" creates a link that opens the presentation for anyone, step by step with its narration, without editing. On any instance, the diagram travels inside the link (after the `#`, never sent to the server; embedded images are left out). You can also publish a short link to a copy stored on the server, update it, unpublish it, or show it as a large QR code to project for students: in cloud mode (images included, no expiry), and on a local-mode instance when public sharing is configured (see below).
- **Files**: save and open `.tldr` files. The sequence is stored inside the tldraw document, so a `.tldr` file keeps it.
- **Dark mode**: in the editor, the side panels follow the color scheme chosen in tldraw's preferences (light, dark or system); the home and login pages follow the system.
- **English and French interface**, including tldraw's own menus. Adding a language means adding one file in `src/i18n/`.

## Two storage modes

The mode depends on whether `DATABASE_URL` is set:

- **Local mode** (no `DATABASE_URL`): no database and no password. Diagrams are stored in each visitor's browser (IndexedDB) and can be saved to or opened from `.tldr` files. This is the mode for sharing the app with a simple URL.
- **Cloud mode** (with `DATABASE_URL`): diagrams are stored in Postgres (e.g. [Neon](https://neon.tech)), available on all your devices, and access is protected by a password. This is meant for a personal instance for now: there are no user accounts yet.

## Running locally

Local mode needs no configuration:

```bash
pnpm install
pnpm dev
```

If your `.env.local` sets `DATABASE_URL` (cloud mode), `pnpm dev:local` still starts the app in local mode, as on the public instance.

Cloud mode, with a local Postgres:

```bash
pnpm install
createdb unveilboard
cp .env.example .env.local   # then set DATABASE_URL, APP_PASSWORD, SESSION_SECRET
pnpm db:migrate
pnpm dev
```

## Deploying (Vercel)

- **Local mode**: import the repository into Vercel and set `TLDRAW_LICENSE_KEY`. That's all.
- **Cloud mode**:
  1. Create a Postgres database (e.g. Neon).
  2. Apply the migrations with the **direct** (non-pooled) connection URL, in single quotes because it contains `&`:
     `DATABASE_URL='postgresql://…/neondb?sslmode=require' pnpm db:migrate`
     Run it again whenever a new migration is added in `drizzle/`.
  3. On Vercel, set `DATABASE_URL` (the **pooled** URL, with `-pooler` in the host), `APP_PASSWORD`, `SESSION_SECRET` (`openssl rand -base64 48`) and `TLDRAW_LICENSE_KEY`.
  4. Optional: add a Vercel Blob store (`BLOB_READ_WRITE_TOKEN`) to store images outside the document.

`TLDRAW_LICENSE_KEY` is read at runtime, so changing it takes effect without a rebuild. Without a valid key covering your domain (including `www.` if you use it), tldraw hides the editor a few seconds after it loads.

**Public sharing** (local mode, optional): with an Upstash Redis store (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, from the Vercel Marketplace), any visitor can publish a short link. Safeguards: only the diagram and its texts are published (clickable links, link cards and embedded images are removed; web images must be `https` and pass the address filter), a short keyword filter (`src/lib/share/blocklist.ts`, extendable with `SHARE_BLOCKLIST`), 256 KB max, 3 publications per hour and 10 per day per IP address, 200 per day in total, deletion 30 days after the last publication, and `SHARING=off` to stop publications at once. Readers can report a link through a form, emailed to `REPORT_EMAIL` via Resend (`RESEND_API_KEY`); to remove a link, delete the key `share:<id>` in the Upstash console. See `.env.example`.

Link previews (social networks, messaging apps) point to `https://unveilboard.com` by default; a self-hosted instance sets `SITE_URL` to its own address.

## Architecture

- `src/lib/sequence/`: the sequence model and the computation of the state at a given step. Pure data, no dependency on tldraw.
- `src/lib/canvas/adapter.ts`: the only place where the presentation engine touches tldraw (reading and writing the sequence in `document.meta`, camera, geometry).
- `src/components/usePresentation.ts`: applies the computed state (CSS classes on shapes), drives the camera and the keyboard.
- `src/components/PresShapeWrapper.tsx`: wraps each rendered shape. The document is never modified during a presentation.
- `src/lib/storage/`: the `DocumentStore` interface, with `cloud.ts` (Postgres, through `/api/documents`) and `local.ts` (IndexedDB).
- `src/lib/sync/documentSync.ts`: saves changes about one second after the last edit, with optimistic locking between devices.
- `src/lib/tree/` and `src/lib/canvas/tree.ts`: trees built on regular tldraw shapes.

More details (in French) in [README.fr.md](README.fr.md).

## Presentation shortcuts

`→` / `Space` / `PageDown` next · `←` / `PageUp` previous · `Home` / `End` · `O` overview · `C` recenter · `K` laser · `N` narration · `+` / `−` / `0` (or Ctrl + wheel) side panel text size · `Tab` narration / notes · `L` legend · `F` fullscreen · `Esc` exit (the first `Esc` turns the laser off)

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Unveilboard's code is released under the [MIT license](LICENSE).

It depends on the tldraw SDK, which has its own [license](https://tldraw.dev/community/license): every production deployment needs a tldraw license key. A free hobby license is available for non-commercial use; it displays a "made with tldraw" watermark.

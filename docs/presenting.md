# Presenting a diagram step by step

**English** · [Français](presenting.fr.md)

How a diagram becomes a presentation: steps, camera, narration and notes; the presentation mode and its shortcuts; the classroom (projector, phone remote); the handout and read-only sharing.

## Overview

- **Steps**: show, dim, hide, restore, highlight or focus shapes, with entrance effects (fade, rise, draw); collapse or expand tree branches; show an object note.
- **Two ways to present** (Sequence tab, above “▶ Present”, for the whole document): **Reveal** (the default), each step makes shapes appear, hidden at the start; **Tour**, the whole diagram is visible from the start and each step frames the shapes it shows (adding shapes to a step says what it shows), the rest slightly dimmed (“Dim the rest”, on by default).
- **Click an object to go to its step**: while presenting, a click on a shape goes to the next step that shows it (or highlights it, focuses on it, shows its note), or the first one; nothing happens if it belongs to the current step. A double click still opens its note.
- **View** (`V`, or ⋯ menu › “View”): over the sequence, show the **whole diagram** (shapes still to come appear, the current step stands out; clicking one goes to its step) or **this step only**. Changing step brings back the sequence; the projector window follows.
- **Camera per step**: follow the new shapes, show the whole diagram, or stay put.
- **Narration panel**: a Markdown text for each step, shown next to the diagram (resizable, can be hidden), below it on a phone.
- **Presentation mode**: keyboard and presentation-remote navigation, overview and recenter, laser pointer (color, width and fade-out delay are configurable), hand-drawn masking layer, legend, and an "unlocked" mode to edit the diagram during the presentation.
- **Quick sequencing**: create shapes and add them to the current step, or to a new step before or after it, in one click.
- **Handout**: ☰ › "Handout (print / PDF)…" gives one section per step, the diagram at that step (dimmed shapes in grey) and its narration, to print or save as PDF for students.

## Object notes and narration

The development of an object (long quote, explanation) does not clutter the diagram: it is written in the side panel ("Object note") and shown during the presentation in its own tab of the side panel, next to the narration: on double-click on the object (a ¶ mark shows the objects that have one), or at a step with the "Show the note" action (the note then shows at once, the narration stays one tab away). <kbd>Tab</kbd> switches tabs. The "collapsible details" of earlier versions are converted into notes when a document is opened.

**Writing narration and notes**: Markdown (headings, lists, links, tables, quotes, images; a line break is a line break), with a toolbar, <kbd>Ctrl/⌘</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>K</kbd> (link), a preview and a large editor. A pasted or dropped image is uploaded (Vercel Blob) or, failing that, stored in the document as a tldraw asset (`asset:…` in the text, 1 MB max).

**Text size of the side panel**: each diagram has its default size. While presenting, <kbd>+</kbd> / <kbd>−</kbd>, <kbd>Ctrl</kbd> + wheel (or pinch) over the panel and the A− / A+ buttons adjust it for the session; the "n %" button keeps it as the diagram's default, <kbd>0</kbd> goes back to it.

## Presentation shortcuts

`→` / `Space` / `PageDown` next · `←` / `PageUp` previous · `Home` / `End` · `O` overview · `C` recenter · `K` laser · `M` masking layer · `N` narration · `+` / `−` / `0` (or Ctrl + wheel) side panel text size · `Tab` narration / notes · `L` legend · `V` view (sequence, whole diagram, this step only) · `F` fullscreen · `?` shortcuts help · `Esc` exit (the first `Esc` turns the laser off)

The ⋯ menu of the presentation bar holds the less frequent actions: recenter, view, shortcuts help, unlock, project on a second screen, phone remote. Unlocking brings back the tldraw interface to edit the diagram; only `PageUp` / `PageDown` then move between steps.

## In the classroom

**Dual screen.** While presenting, ⋯ › "Project on a second screen" opens an **audience window** for the projector. On Chrome and Edge it moves itself to the second screen (the browser asks for permission once); elsewhere, drag it to the projector. Click "Fullscreen" (or press F) there.

- The projector shows the diagram only; the narration appears on demand ("Narration on the screen" checkbox).
- It follows the presenter's screen: steps, overview and recenter, laser, hand-drawn masking layer, opened notes, legend, and edits made in unlocked mode.
- The presenter's screen becomes a presenter view: timer (click to reset), next step, narration and notes.
- A key pressed in the audience window (presentation remote, keyboard) acts as if pressed on the presenter's screen, except F.
- No server: both windows, in the same browser, talk through a `BroadcastChannel` and share the document through tldraw's local cache (`src/lib/presentation/screen.ts`, page `/d/<id>/screen`).

**Phone remote.** While presenting, ⋯ › "Phone remote" shows a QR code: once scanned, the phone becomes a remote (previous, next, overview, recenter) that also shows the step's narration, the next step and a timer, and keeps its screen on. The two devices connect directly (WebRTC): PeerJS's public service only puts them in touch, and nothing goes through the site's server. The computer's random identifier is in the address fragment (`/r#…`): it is what gives control.

The direct connection can fail on some networks (school Wi-Fi that isolates devices, 5G behind carrier-grade NAT, UDP filtering): the app says so, and otherwise shows the path it got (same local network, or through the Internet). The safest option in class: connect the computer to the phone's hotspot. An HTTPS fallback relay (through Upstash) may be added if failures are frequent.

**On a phone**, in portrait, the narration moves below the diagram; in landscape, it stays beside it, narrower.

## Read-only sharing

"Share" (header of the steps panel, or ☰ menu) gives a link that opens the presentation for anyone: step by step, with the narration, without being able to change the diagram (page `/p`).

- **Link with the diagram inside**, on any instance: the document is compressed into the link, after the `#`, which browsers never send to the server. Nothing is stored, so there is nothing to moderate. Embedded images are left out (they would make the link huge), and later changes need a new link.
- **Published link**, in cloud mode: a short link (`/p/<id>`) to a copy of the last saved version (`shares` table), images included. "Publish the latest version" updates the same link; "Unpublish" disables it. Publishing requires the session; reading is public.
- **Public sharing**, on a local-mode instance with an Upstash Redis store (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, from the Vercel Marketplace): any visitor can publish a short link. Safeguards:
  - only the diagram and its texts are published: clickable links, link cards and embedded images are removed; web images must be `https` and pass the address filter;
  - a deliberately short keyword filter (`src/lib/share/blocklist.ts`, extendable with `SHARE_BLOCKLIST`), so that lesson topics are not blocked;
  - 256 KB max; 3 publications per hour and 10 per day per IP address, 200 per day in total;
  - deletion 30 days after the last publication; `SHARING=off` stops publications at once (existing links stay readable);
  - the management key (update, unpublish) stays in the author's browser, never in the document.
- **Reports**: the reader of a published link has a "Report" button; the form sends an email to `REPORT_EMAIL` through Resend (`RESEND_API_KEY`), and the address never leaves the server. To remove a public share: delete the key `share:<id>` in the Upstash console.
- **QR code**: next to a published short link, the "QR code" button shows it full-window, to project it so that students open the presentation on their phones. Always black on white, even in dark mode, to stay readable through a projector. The link with the diagram inside is too long for a QR code.

The IP address comes from the `X-Forwarded-For` header: behind Vercel it cannot be forged; when self-hosting, put the app behind a proxy that sets it.

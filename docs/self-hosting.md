# Self-hosting

**English** · [Français](self-hosting.fr.md)

Running Unveilboard locally or on your own server: the two storage modes, installation, deployment on Vercel, optional services, saving and sync.

## Two storage modes

The mode depends on whether `DATABASE_URL` is set:

- **Local mode** (no `DATABASE_URL`): no database and no password. Diagrams are stored in each visitor's browser (IndexedDB). "Save as…" (steps panel or ☰ menu) creates a `.tldr` file, sequence included; "Open a .tldr file…" (home or ☰ menu), or a drag and drop on the home page, opens it as a new diagram. This is the mode for sharing the app with a simple URL.
- **Cloud mode** (with `DATABASE_URL`): diagrams are stored in Postgres (e.g. [Neon](https://neon.tech)), available on all your devices, and access is protected by a password. This is meant for a personal instance for now: there are no user accounts yet.

## Running locally

Local mode needs no configuration:

```bash
pnpm install
pnpm dev
```

If your `.env.local` sets `DATABASE_URL` (cloud mode), `pnpm dev:local` still starts the app in local mode, as on the public instance.

Cloud mode, with a local Postgres (e.g. Postgres.app):

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
     After that, each deployment applies new migrations before building (`scripts/migrate.mjs`), with `DATABASE_URL_UNPOOLED` if set (the Neon integration for Vercel sets it), otherwise `DATABASE_URL`. `SKIP_DB_MIGRATE=1` turns this off.
  3. On Vercel, set `DATABASE_URL` (the **pooled** URL, with `-pooler` in the host), `APP_PASSWORD`, `SESSION_SECRET` (`openssl rand -base64 48`) and `TLDRAW_LICENSE_KEY`.
  4. Optional: add a Vercel Blob store (`BLOB_READ_WRITE_TOKEN`) to store images outside the document.

`TLDRAW_LICENSE_KEY` is read at runtime, so changing it takes effect without a rebuild. Without a valid key covering your domain (including `www.` if you use it), tldraw hides the editor a few seconds after it loads.

Optional services and settings (details in `.env.example`):

| Variables | Purpose |
|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis: public sharing on a local-mode instance |
| `SHARING=off`, `SHARE_BLOCKLIST` | Stop publications; extra blocked terms |
| `RESEND_API_KEY`, `REPORT_EMAIL`, `REPORT_FROM` | Reports and contact form, sent by email |
| `LEGAL_PUBLISHER`, `LEGAL_LINKS`, `LEGAL_HOST` | Legal notice and privacy page (`/legal`); without `LEGAL_PUBLISHER`, no page |
| `OPENROUTER_API_KEY` (or `AI_BASE_URL`, `AI_API_KEY`), `AI_MODEL`, `AI_MAX_TOKENS`, `AI_JSON_MODE` | AI of the instance, server side (cloud mode; local mode only with `AI_PUBLIC=on` and Upstash, with per-IP limits; always, without limits, in development). See [Working with an AI](ai.md) |
| `SITE_URL` | Address used in link previews (default `https://unveilboard.com`) |

## Saving and sync

- Storage goes through a common interface, `DocumentStore` (`src/lib/storage/`): `cloud.ts` (`/api/documents` routes, Postgres) or `local.ts` (IndexedDB).
- Each document has a local cache (IndexedDB, through `persistenceKey`): instant opening, offline work.
- Changes are saved about one second after the last edit (`src/lib/sync/documentSync.ts`), as a tldraw snapshot (`jsonb` on the server).
- Optimistic locking: if the document was changed elsewhere in the meantime, the save is refused and a banner offers to load the other version or keep yours. Discarded local changes are copied to `localStorage` (`backup:<id>`).
- Several tabs on the same document: tldraw keeps them in sync, and only one of them (browser lock) saves for all. There is no conflict between tabs.
- When you come back to the tab, a newer version saved elsewhere is loaded automatically.

In cloud mode, access is protected by a single password (`APP_PASSWORD`) and a signed session cookie: enough for personal use, to be replaced by real accounts before opening cloud mode to other users.

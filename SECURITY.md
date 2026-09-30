# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately instead:

- through GitHub: **Security › Report a vulnerability** on this repository (private vulnerability reporting);
- or through the contact form on [unveilboard.com/legal](https://unveilboard.com/legal).

Describe the problem, how to reproduce it, and its possible impact. Unveilboard is a side project maintained on free time: expect a first answer within a week. Once a fix is released, you will be credited if you wish.

## Scope

Anything in this repository, and the public instance [unveilboard.com](https://unveilboard.com). Of particular interest:

- public sharing (`/api/public-shares`, `/p/<id>`): content filtering, rate limits, owner keys;
- cloud mode authentication (password, session cookie) and document access;
- the phone remote (`/r`) and the dual screen (who can control a presentation);
- reports and contact forms (`/api/report`, `/api/contact`);
- AI keys kept in the browser (see below).

Out of scope: the tldraw SDK itself (report to [tldraw](https://github.com/tldraw/tldraw/security)), and third-party services (Vercel, Upstash, Resend, PeerJS).

## Security model

What is in place, so that reports can focus on what matters.

- **Content Security Policy** (`src/proxy.ts`): only Next.js scripts, marked with a per-request nonce, and the scripts they load may run (`'strict-dynamic'`); no plugins, no `<base>`, no framing by other sites. Connections stay open (`connect-src *`): the “OpenAI-compatible server” AI provider is any address the user chooses, often `localhost`, and the phone remote goes through PeerJS.
- **Users' AI keys** (OpenRouter, or an OpenAI-compatible server) never reach Unveilboard's servers. “Sign in with OpenRouter” uses OAuth PKCE (S256), exchanged in the browser; the key is then kept in `sessionStorage` (or in `localStorage` if the user asks to remember it), sent only to the provider, and cleared when signing out of a cloud instance. The key field is kept out of password managers. The remaining risk is a script running on the site (XSS) reading the key: this is what the CSP is for, and users are told to create a dedicated key with a spending limit and an expiry date.
- **Instance AI** (`OPENROUTER_API_KEY`, `AI_API_KEY`): server side only, behind the cloud session, or behind per-IP limits on a public local-mode instance (`AI_PUBLIC=on`).
- **Cloud mode**: one shared password, compared in constant time; a signed session cookie (`httpOnly`, `SameSite=Lax`, `Secure` in production); every page and API route checked in `src/proxy.ts`, except the public ones listed there; redirections after sign-in limited to internal paths.
- **Public sharing**: owner keys stay in the author's browser; content filter and rate limits (see [Presenting and sharing](docs/presenting.md)).

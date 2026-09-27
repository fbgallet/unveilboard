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
- reports and contact forms (`/api/report`, `/api/contact`).

Out of scope: the tldraw SDK itself (report to [tldraw](https://github.com/tldraw/tldraw/security)), and third-party services (Vercel, Upstash, Resend, PeerJS).

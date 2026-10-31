# Ngomso Intelligence

Emerging-technology infrastructure, engineered for specific industries.
Website, lead capture, automated email and online payments — one Cloudflare Worker.

## Stack

- **Site**: hand-built HTML/CSS/JS with generative canvas visuals, compiled by a zero-dependency build (`scripts/build.mjs`) into `dist/`.
- **API**: Cloudflare Worker (`src/index.js`) serving the site via static assets plus:
  - `POST /api/contact` — stores the lead in D1, emails a confirmation and a notification
  - `POST /api/subscribe` — Labs field-notes list
  - `POST /api/checkout` — starts a Paystack transaction for an offer in `src/offers.js`
  - `GET  /api/checkout/verify` — confirms a payment on the thank-you page
  - `POST /api/paystack/webhook` — signature-verified, idempotent payment confirmation
  - `GET  /api/health` — shows which integrations are configured
  - `/admin` — password-protected leads, payments and email log
- **Data**: Cloudflare D1 (one database per environment), schema in `migrations/`.
- **Email**: Gmail API as ndungeintelligence@gmail.com. Dev/test redirect every email to the owner.
- **Payments**: Paystack (ZAR).

## Environments

`dev` branch → dev · `test` branch → test · `main` → prod. See **[docs/SETUP.md](docs/SETUP.md)** for keys and one-time setup.

## Local work

```bash
node scripts/build.mjs                                   # build the site into dist/
node --experimental-sqlite scripts/test-worker.mjs       # 15 API tests, mocked Gmail/Paystack
node --experimental-sqlite scripts/test-worker.mjs --serve   # preview on http://localhost:8787
```

Or with Wrangler: `npm i -D wrangler && cp .dev.vars.example .dev.vars && npm run dev`.

## Layout

```
site/            layout, pages, CSS, JS, brand assets
src/             Worker, offers (prices), Gmail, Paystack, email templates, admin
migrations/      D1 schema
scripts/         build + test harness
.github/         CI (pull requests) and Deploy (dev/test/prod)
```

## Brand

Logo files are in `site/assets/brand/`: SVG marks and 6K PNG lockups. Colours: ink `#0A0A0B`, paper `#F2F0EC`, lilac `#8B7BB8`, ember `#C8A27C`. Type: Inter.

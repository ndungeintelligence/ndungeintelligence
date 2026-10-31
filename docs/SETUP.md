# Ngomso — setup guide

Everything in the code is done. These are the one-time account steps only you can do, because they involve your logins and secret keys. Do them in this order; each takes 2–10 minutes.

| # | Step | Where | Unlocks |
|---|------|-------|---------|
| 1 | Let Claude push to the repo | GitHub | Code lands in `ndungeintelligence/ndungeintelligence` |
| 2 | Cloudflare API token + account ID | Cloudflare → GitHub | Deploys |
| 3 | Branches + environment rules | GitHub | dev → test → prod flow |
| 4 | Gmail API credentials | Google Cloud → GitHub | Automatic emails |
| 5 | Paystack keys + webhooks | Paystack → GitHub | Online payments |
| 6 | Admin password | GitHub | `/admin` dashboard |

---

## How the environments work

| Branch | GitHub environment | Cloudflare Worker | D1 database | Emails go to |
|--------|-------------------|-------------------|-------------|--------------|
| `dev`  | `dev`  | `ngomso-dev`  | `ndunge-intelligence-dev`  | **you only** (tagged `[DEV → client@…]`) |
| `test` | `test` | `ngomso-test` | `ndunge-intelligence-test` | **you only** (tagged `[TEST → …]`) |
| `main` | `prod` | `ngomso`      | `ndunge-intelligence-prod` | real clients |

Push to a branch → GitHub Actions builds the site, applies database migrations, deploys the Worker and syncs secrets for that environment. Pull requests run tests first. Promote work by merging `dev` → `test` → `main`.

The three D1 databases already exist in your Cloudflare account and are wired into `wrangler.jsonc`.

---

## 1. Let Claude push to the repo

The `ndungeintelligence` GitHub organisation doesn't have the Claude GitHub App yet, so pushes from Claude are refused.

1. Open <https://github.com/apps/claude/installations/select_target>
2. Choose the **ndungeintelligence** organisation → **Only select repositories** → `ndungeintelligence` → **Install**.

## 2. Cloudflare API token + account ID

1. Cloudflare dashboard → **My Profile → API Tokens → Create Token**.
2. Use the **Edit Cloudflare Workers** template, then **+ Add more** → *Account · D1 · Edit*.
3. Account resources: your account. Create and copy the token.
4. Your **Account ID** is on the right-hand side of *Workers & Pages → Overview*.
5. GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

## 3. Branches + environment rules

1. Create branches `dev` and `test` from `main` (Claude does this once it can push).
2. Repo **Settings → Environments**:
   - **dev** → Deployment branches: *Selected branches* → `dev`.
   - **test** → Deployment branches: `test`.
   - **prod** → Deployment branches: `main`; tick **Required reviewers** and add yourself, so nothing reaches clients without your approval.
3. Optional: **Settings → Branches → Add rule** for `main`: require a pull request and passing *CI*.

## 4. Gmail API (automatic emails from ndungeintelligence@gmail.com)

Sign in to Google as **ndungeintelligence@gmail.com** for all of this.

1. <https://console.cloud.google.com> → create a project called `ndunge-intelligence`.
2. **APIs & Services → Library** → search **Gmail API** → **Enable**.
3. **Google Auth Platform** (OAuth consent screen) → **Get started**:
   - App name *Ngomso*, support email `ndungeintelligence@gmail.com`, audience **External**.
   - Under **Audience**, click **Publish app** so the status is **In production**. (In *Testing* mode Google expires the token after 7 days and emails stop. An unverified app is fine for sending from your own account.)
4. **Clients → Create client** → type **Web application** → Authorised redirect URI: `https://developers.google.com/oauthplayground` → Create. Copy the **Client ID** and **Client secret**.
5. Open <https://developers.google.com/oauthplayground>:
   - Gear icon (top right) → tick **Use your own OAuth credentials** → paste the Client ID and secret.
   - In "Input your own scopes" enter `https://www.googleapis.com/auth/gmail.send` → **Authorize APIs** → choose ndungeintelligence@gmail.com → continue past the "unverified app" notice → Allow.
   - **Exchange authorization code for tokens** → copy the **Refresh token**.
6. Add three **repository** secrets (shared by all environments):
   - `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`

What gets sent automatically:
- Contact form → branded confirmation to the client + lead notification to you (reply-to set to the client).
- Paystack payment → receipt to the client + payment notification to you (exactly once).
- Labs/footer sign-up → welcome note.

Gmail allows roughly 500 sends a day from a free account — plenty for now. When you get a domain, switching the sender to `hello@yourdomain` is a small change.

## 5. Paystack

1. Paystack dashboard → **Settings → API Keys & Webhooks**.
2. Add **environment** secrets named `PAYSTACK_SECRET_KEY`:
   - `dev` and `test` → your **test** secret key (`sk_test_…`)
   - `prod` → your **live** secret key (`sk_live_…`) once Paystack has activated your business.
3. Webhook URLs (same page):
   - Test webhook → `https://ngomso-test.<your-subdomain>.workers.dev/api/paystack/webhook`
   - Live webhook → `https://ngomso.<your-subdomain>.workers.dev/api/paystack/webhook` (or your domain)
4. Test card details are in Paystack's docs ("Test payments").

Prices live in `src/offers.js` (amounts in cents). Edit them there — the Engage page and the API both read that file.

## 6. Admin dashboard

Add an **environment** secret `ADMIN_PASSWORD` to each of dev, test and prod (use different long passwords). Then open `/admin` on that environment and sign in as user `admin`. It lists leads, payments, subscribers and the email log, and exports leads as CSV.

---

## Checking a deployment

`/api/health` on any environment shows whether email and payments are configured:

```json
{ "ok": true, "environment": "dev", "email": "configured", "payments": "configured" }
```

A missing secret never breaks the site: leads still save to the database and appear in `/admin`; the email log shows what was skipped.

## Custom domain (when ready)

Add the domain to Cloudflare, then uncomment the `routes` line in `wrangler.jsonc` and set `SITE_URL` for the sitemap in the deploy workflow.

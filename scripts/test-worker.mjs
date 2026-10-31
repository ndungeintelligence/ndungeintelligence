// Local harness for the Worker: in-memory D1 (node:sqlite), static assets from dist/,
// and mocked Google + Paystack APIs. Usage:
//   node --experimental-sqlite scripts/test-worker.mjs           → run API tests
//   node --experimental-sqlite scripts/test-worker.mjs --serve   → also serve http://localhost:8787
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

// ── D1 shim ──
const sqlite = new DatabaseSync(":memory:");
for (const f of readdirSync(join(root, "migrations")).sort()) sqlite.exec(readFileSync(join(root, "migrations", f), "utf8"));
const DB = {
  prepare(sql) {
    let params = [];
    const stmt = { bind: (...p) => ((params = p.map((v) => (v === undefined ? null : v))), stmt) };
    stmt.run = async () => { const r = sqlite.prepare(sql).run(...params); return { meta: { changes: Number(r.changes) } }; };
    stmt.first = async () => sqlite.prepare(sql).get(...params) ?? null;
    stmt.all = async () => ({ results: sqlite.prepare(sql).all(...params) });
    return stmt;
  },
};

// ── assets shim (mirrors auto-trailing-slash + 404-page) ──
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".xml": "application/xml", ".txt": "text/plain" };
const ASSETS = {
  async fetch(req) {
    let p = decodeURIComponent(new URL(req.url).pathname);
    const candidates = p === "/" ? ["index.html"] : [p.slice(1), p.slice(1) + ".html", join(p.slice(1), "index.html")];
    for (const c of candidates) {
      const f = join(dist, c);
      if (f.startsWith(dist) && existsSync(f) && statSync(f).isFile()) return new Response(readFileSync(f), { headers: { "content-type": TYPES[extname(f)] || "application/octet-stream" } });
    }
    return new Response(readFileSync(join(dist, "404.html")), { status: 404, headers: { "content-type": TYPES[".html"] } });
  },
};

// ── mocked upstream APIs ──
const sent = [];
const SK = "sk_test_local";
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "ya29.mock", expires_in: 3600 });
  if (url.startsWith("https://gmail.googleapis.com/")) {
    const raw = Buffer.from(JSON.parse(init.body).raw, "base64url").toString("utf8");
    sent.push({ to: raw.match(/^To: (.*)$/m)?.[1], subject: raw.match(/^Subject: (.*)$/m)?.[1], raw });
    return Response.json({ id: "msg_" + sent.length });
  }
  if (url === "https://api.paystack.co/transaction/initialize") {
    const b = JSON.parse(init.body);
    return Response.json({ status: true, data: { authorization_url: `https://checkout.paystack.com/mock/${b.reference}`, reference: b.reference } });
  }
  if (url.startsWith("https://api.paystack.co/transaction/verify/")) {
    const ref = decodeURIComponent(url.split("/").pop());
    return Response.json({ status: true, data: { reference: ref, status: "success", channel: "card", paid_at: "2026-10-31T08:00:00Z" } });
  }
  return realFetch(input, init);
};

const { default: worker } = await import(join(root, "src", "index.js"));
const env = { DB, ASSETS, ENVIRONMENT: "local", EMAIL_MODE: "live", NOTIFY_EMAIL: "ndungeintelligence@gmail.com", FROM_NAME: "Ngomso Intelligence",
  GMAIL_CLIENT_ID: "id", GMAIL_CLIENT_SECRET: "secret", GMAIL_REFRESH_TOKEN: "refresh", PAYSTACK_SECRET_KEY: SK, ADMIN_PASSWORD: "local-admin" };

async function call(path, init = {}) {
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  const res = await worker.fetch(new Request("http://localhost:8787" + path, init), env, ctx);
  await Promise.all(pending);
  return res;
}
const jpost = (path, body, headers = {}) => call(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

// ── tests ──
let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log("  ✓", name); };
console.log("Worker tests");

await test("pages and 404", async () => {
  for (const p of ["/", "/infrastructure", "/work", "/labs", "/engage", "/contact"]) assert.equal((await call(p)).status, 200, p);
  assert.equal((await call("/nope")).status, 404);
});
await test("health", async () => { const b = await (await call("/api/health")).json(); assert.equal(b.email, "configured"); assert.equal(b.payments, "configured"); });
await test("contact validation", async () => { const r = await jpost("/api/contact", { name: "A", email: "bad" }); assert.equal(r.status, 422); const b = await r.json(); assert.ok(b.errors.name && b.errors.email && b.errors.message); });
await test("contact honeypot is silently dropped", async () => { const r = await jpost("/api/contact", { name: "Bot", email: "b@b.co", message: "spam spam spam", website: "x" }); assert.equal(r.status, 200); assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM leads").get().n, 0); });
await test("contact stores lead and sends 2 emails", async () => {
  sent.length = 0;
  const r = await jpost("/api/contact", { name: "Thandi Mokoena", email: "thandi@example.co.za", company: "Kasi Kicks", interest: "Agentic commerce", message: "We want AI agents to find our sneakers." }, { "cf-connecting-ip": "1.2.3.4" });
  assert.equal(r.status, 200);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM leads").get().n, 1);
  assert.equal(sent.length, 2);
  assert.ok(sent.some((m) => m.to === "thandi@example.co.za"));
  assert.ok(sent.some((m) => m.to === "ndungeintelligence@gmail.com" && /Reply-To: Thandi Mokoena <thandi@example.co.za>/.test(m.raw)));
});
await test("contact rate limit", async () => {
  for (let i = 0; i < 4; i++) await jpost("/api/contact", { name: "Repeat", email: "r@example.com", message: "hello hello hello" }, { "cf-connecting-ip": "1.2.3.4" });
  assert.equal((await jpost("/api/contact", { name: "Repeat", email: "r@example.com", message: "hello hello hello" }, { "cf-connecting-ip": "1.2.3.4" })).status, 429);
});
await test("owner-only email mode redirects to owner", async () => {
  sent.length = 0; env.EMAIL_MODE = "owner-only"; env.ENVIRONMENT = "dev";
  await jpost("/api/contact", { name: "Dev Test", email: "client@example.com", message: "testing the dev mode" });
  assert.ok(sent.every((m) => m.to === "ndungeintelligence@gmail.com"));
  assert.ok(sent.some((m) => m.subject.includes("=?UTF-8?B?") || m.subject.includes("[DEV")));
  env.EMAIL_MODE = "live"; env.ENVIRONMENT = "local";
});
await test("subscribe is idempotent", async () => {
  sent.length = 0;
  await jpost("/api/subscribe", { email: "fan@example.com" }); await jpost("/api/subscribe", { email: "fan@example.com" });
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM subscribers").get().n, 1); assert.equal(sent.length, 1);
});
let reference;
await test("checkout initializes Paystack", async () => {
  const r = await jpost("/api/checkout", { offer_id: "agent-readiness-audit", name: "Sipho Dube", email: "sipho@example.com" });
  const b = await r.json(); assert.equal(r.status, 200); assert.match(b.authorization_url, /checkout\.paystack\.com/); reference = b.reference;
  assert.equal(sqlite.prepare("SELECT amount_cents a FROM payments WHERE reference=?").get(reference).a, 1250000);
});
await test("checkout rejects unknown offer", async () => assert.equal((await jpost("/api/checkout", { offer_id: "free-stuff", name: "X Y", email: "x@y.co" })).status, 422));
await test("webhook rejects bad signature", async () => assert.equal((await jpost("/api/paystack/webhook", { event: "charge.success", data: { reference } }, { "x-paystack-signature": "nope" })).status, 401));
await test("webhook marks paid and sends receipt once", async () => {
  sent.length = 0;
  const body = JSON.stringify({ event: "charge.success", data: { reference, status: "success", channel: "card", paid_at: "2026-10-31T08:00:00Z" } });
  const sig = createHmac("sha512", SK).update(body).digest("hex");
  assert.equal((await jpost("/api/paystack/webhook", body, { "x-paystack-signature": sig })).status, 200);
  assert.equal((await jpost("/api/paystack/webhook", body, { "x-paystack-signature": sig })).status, 200);
  assert.equal(sqlite.prepare("SELECT status s FROM payments WHERE reference=?").get(reference).s, "success");
  assert.equal(sent.length, 2, "receipt + owner notification, exactly once");
});
await test("verify endpoint", async () => { const b = await (await call(`/api/checkout/verify?reference=${reference}`)).json(); assert.equal(b.status, "success"); assert.equal(b.amount, "R12,500"); });
await test("admin requires auth", async () => {
  assert.equal((await call("/admin")).status, 401);
  const ok = await call("/admin", { headers: { authorization: "Basic " + btoa("admin:local-admin") } });
  assert.equal(ok.status, 200); assert.match(await ok.text(), /Thandi Mokoena/);
  assert.equal((await call("/admin/leads.csv", { headers: { authorization: "Basic " + btoa("admin:local-admin") } })).status, 200);
});
const AUTH = { authorization: "Basic " + btoa("admin:local-admin") };
await test("pricing is uniform on the Engage page", async () => {
  const html = await (await call("/engage")).text();
  for (const p of ["R12,500", "R25,000", "R2,500", "R5,500", "R0.75%".slice(1), "Agentic Commerce OS"]) assert.ok(html.includes(p), p);
  assert.ok(!html.includes("R7,500") && !html.includes("R1,500"), "old prices gone");
});
let inviteToken;
await test("admin onboards a client and emails an invite", async () => {
  sent.length = 0;
  const form = new URLSearchParams({ name: "Lerato Khumalo", email: "lerato@shop.co.za", company: "Kasi Kicks", store_url: "https://kasikicks.co.za", plan: "growth", stage: "setup", invite: "1" });
  const r = await call("/admin/clients", { method: "POST", headers: { ...AUTH, "content-type": "application/x-www-form-urlencoded" }, body: form });
  assert.equal(r.status, 303);
  assert.equal(sqlite.prepare("SELECT plan FROM clients WHERE email=?").get("lerato@shop.co.za").plan, "growth");
  assert.equal(sent.length, 1);
  const body = Buffer.from(sent[0].raw.split("\r\n\r\n").slice(1).join("").match(/base64\r\n\r\n([\s\S]*?)\r\n--/)?.[1] || "", "base64").toString();
  inviteToken = (sent[0].raw.match(/token=([a-f0-9]{64})/) || Buffer.from(sent[0].raw.replace(/\r\n/g, "").split("base64").pop(), "base64").toString().match(/token=([a-f0-9]{64})/) || [])[1];
  if (!inviteToken) { const all = [...sent[0].raw.matchAll(/\r\n\r\n([A-Za-z0-9+\/=\r\n]+?)\r\n--/g)].map((m) => Buffer.from(m[1].replace(/\r\n/g, ""), "base64").toString()).join(" "); inviteToken = (all.match(/token=([a-f0-9]{64})/) || [])[1]; }
  assert.ok(inviteToken, "invite link contains a token");
});
await test("portal: unknown email gets the same answer and no email", async () => {
  sent.length = 0;
  const r = await jpost("/api/portal/login", { email: "stranger@example.com" });
  assert.equal(r.status, 200); assert.equal(sent.length, 0);
});
let cookie;
await test("portal: invite link signs the client in once", async () => {
  const r = await jpost("/api/portal/verify", { token: inviteToken });
  assert.equal(r.status, 200);
  cookie = r.headers.get("set-cookie").split(";")[0];
  assert.match(cookie, /^ni_session=[a-f0-9]{64}$/);
  assert.equal((await jpost("/api/portal/verify", { token: inviteToken })).status, 400, "token cannot be reused");
});
await test("portal: dashboard data for the signed-in client", async () => {
  const d = await (await call("/api/portal/me", { headers: { cookie } })).json();
  assert.equal(d.client.company, "Kasi Kicks"); assert.equal(d.plan.name, "Growth"); assert.equal(d.plan.monthly, "R5,500"); assert.equal(d.client.stage, "setup");
  assert.equal((await call("/api/portal/me")).status, 401);
});
await test("portal: login email for an onboarded client, then logout", async () => {
  sent.length = 0;
  await jpost("/api/portal/login", { email: "LERATO@shop.co.za" });
  assert.equal(sent.length, 1);
  await call("/api/portal/logout", { method: "POST", headers: { cookie } });
  assert.equal((await call("/api/portal/me", { headers: { cookie } })).status, 401);
});
await test("email still logs when Gmail secrets missing", async () => {
  const saved = env.GMAIL_REFRESH_TOKEN; delete env.GMAIL_REFRESH_TOKEN;
  await jpost("/api/contact", { name: "No Mail", email: "nm@example.com", message: "should still save" });
  assert.ok(sqlite.prepare("SELECT COUNT(*) n FROM email_log WHERE ok=0").get().n >= 2);
  env.GMAIL_REFRESH_TOKEN = saved;
});
console.log(`\n${n} tests passed`);

if (process.argv.includes("--serve")) {
  createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const init = { method: req.method, headers: req.headers };
    if (!["GET", "HEAD"].includes(req.method)) init.body = Buffer.concat(chunks);
    const r = await call(req.url, init);
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
  }).listen(8787, () => console.log("Serving http://localhost:8787"));
}

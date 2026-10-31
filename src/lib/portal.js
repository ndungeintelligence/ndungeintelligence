// Client portal for businesses onboarded onto the Agentic Commerce OS.
// Passwordless: a client enters their email, gets a one-time sign-in link (15 min),
// and receives an HttpOnly session cookie (30 days). Only onboarded clients can sign in.
import { sendMail } from "./gmail.js";
import { esc } from "./templates.js";
import { PRICE_BOOK, formatZAR } from "../offers.js";

const COOKIE = "ni_session";
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

export const STAGES = ["audit", "setup", "connected", "live"];
export const PLAN = Object.fromEntries(PRICE_BOOK.tiers.map((t) => [t.id, t]));

function readCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  const m = raw.split(/;\s*/).find((c) => c.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : "";
}

export async function currentClient(request, env) {
  const sid = readCookie(request, COOKIE);
  if (!sid) return null;
  const row = await env.DB.prepare(
    "SELECT c.* FROM portal_sessions s JOIN clients c ON c.email = s.email WHERE s.session_hash = ? AND s.expires_at > datetime('now')",
  ).bind(await sha256(sid)).first();
  return row || null;
}

function signInEmail(origin, client, link) {
  const first = esc(String(client.name).split(" ")[0]);
  return {
    subject: "Your Ngomso Intelligence sign-in link",
    html: `<!doctype html><html><body style="margin:0;background:#ECEAE6;font-family:Inter,Helvetica,Arial,sans-serif;color:#0A0A0B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:20px;overflow:hidden">
<tr><td style="background:#0A0A0B;padding:20px 28px;color:#F2F0EC;font-size:14px">Ngomso <span style="color:#8D8A93">Intelligence</span> · Agentic Commerce OS</td></tr>
<tr><td style="padding:32px 28px">
<h1 style="margin:0 0 14px;font-size:24px;font-weight:500;letter-spacing:-0.02em">Hi ${first}, here's your sign-in link</h1>
<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#3B3940">Use this button to open your client portal. It works once and expires in 15 minutes.</p>
<a href="${esc(link)}" style="display:inline-block;background:#0A0A0B;color:#F2F0EC;text-decoration:none;font-size:14px;padding:12px 22px;border-radius:999px">Open my portal &rarr;</a>
<p style="margin:22px 0 0;font-size:12px;color:#8D8A93">If you didn't ask to sign in, you can ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`,
    text: `Hi ${client.name}, open your Ngomso Intelligence client portal (link works once, expires in 15 minutes):\n${link}`,
  };
}

export async function requestLogin(request, env, ctx, origin, body) {
  const email = String(body.email || "").trim().toLowerCase().slice(0, 160);
  // Always the same response, so the form never reveals who is a client.
  const done = json({ ok: true, message: "If that email belongs to an onboarded client, a sign-in link is on its way." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ ok: false, errors: { email: "Please use a valid email address." } }, 422);
  const client = await env.DB.prepare("SELECT * FROM clients WHERE email = ?").bind(email).first();
  if (!client) return done;
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM portal_tokens WHERE email = ? AND created_at > datetime('now','-1 hour')").bind(email).first();
  if ((recent?.n || 0) >= 5) return done;
  const token = randomToken();
  await env.DB.prepare("INSERT INTO portal_tokens (token_hash, email, expires_at) VALUES (?, ?, datetime('now','+15 minutes'))").bind(await sha256(token), email).run();
  const link = `${origin}/portal?token=${token}`;
  ctx.waitUntil(sendMail(env, { to: email, kind: "portal_login", ...signInEmail(origin, client, link) }));
  return done;
}

export async function verifyLogin(env, token) {
  if (!token || token.length !== 64) return json({ ok: false, error: "This sign-in link is invalid. Request a new one." }, 400);
  const h = await sha256(token);
  const claim = await env.DB.prepare(
    "UPDATE portal_tokens SET used = 1 WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')",
  ).bind(h).run();
  if (!claim.meta?.changes) return json({ ok: false, error: "This sign-in link has expired or was already used. Request a new one." }, 400);
  const row = await env.DB.prepare("SELECT email FROM portal_tokens WHERE token_hash = ?").bind(h).first();
  const sid = randomToken();
  await env.DB.prepare("INSERT INTO portal_sessions (session_hash, email, expires_at) VALUES (?, ?, datetime('now','+30 days'))").bind(await sha256(sid), row.email).run();
  return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000` });
}

export async function me(request, env) {
  const c = await currentClient(request, env);
  if (!c) return json({ ok: false }, 401);
  const plan = PLAN[c.plan] || PLAN.launch;
  return json({
    ok: true,
    client: { name: c.name, company: c.company, email: c.email, store_url: c.store_url, stage: c.stage, onboarded: c.created_at },
    plan: { id: plan.id, name: plan.name, monthly: formatZAR(plan.monthly), fit: plan.fit },
    stages: STAGES,
    settlementFee: (PRICE_BOOK.settlementFee * 100).toFixed(2) + "%",
  });
}

export async function logout(request, env) {
  const sid = readCookie(request, COOKIE);
  if (sid) await env.DB.prepare("DELETE FROM portal_sessions WHERE session_hash = ?").bind(await sha256(sid)).run();
  return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
}

// Admin: onboard (or update) a client onto the Agentic Commerce OS.
export async function onboardClient(env, ctx, origin, form) {
  const v = (k, n = 200) => String(form.get(k) || "").trim().slice(0, n);
  const email = v("email", 160).toLowerCase();
  const name = v("name", 120);
  const plan = PLAN[v("plan")] ? v("plan") : "launch";
  const stage = STAGES.includes(v("stage")) ? v("stage") : "audit";
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "Name and a valid email are required.";
  await env.DB.prepare(
    `INSERT INTO clients (id, email, name, company, store_url, plan, stage) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET name = excluded.name, company = excluded.company, store_url = excluded.store_url,
       plan = excluded.plan, stage = excluded.stage, updated_at = datetime('now')`,
  ).bind(crypto.randomUUID(), email, name, v("company", 160), v("store_url", 300), plan, stage).run();
  if (form.get("invite") === "1") {
    const token = randomToken();
    await env.DB.prepare("INSERT INTO portal_tokens (token_hash, email, expires_at) VALUES (?, ?, datetime('now','+7 days'))").bind(await sha256(token), email).run();
    const link = `${origin}/portal?token=${token}`;
    const mail = signInEmail(origin, { name }, link);
    mail.subject = "Welcome to the Ngomso Intelligence Agentic Commerce OS";
    mail.html = mail.html.replace("It works once and expires in 15 minutes.", "Welcome aboard. This first link works once and stays valid for 7 days.");
    ctx.waitUntil(sendMail(env, { to: email, kind: "portal_invite", ...mail }));
  }
  return "";
}

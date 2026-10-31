// Ndunge Intelligence — Cloudflare Worker
// Serves the static site (./dist via the ASSETS binding) and the API below.
import { OFFERS, findOffer, formatZAR } from "./offers.js";
import { sendMail, gmailConfigured } from "./lib/gmail.js";
import { initializeTransaction, verifyTransaction, validSignature, paystackConfigured } from "./lib/paystack.js";
import * as T from "./lib/templates.js";
import { renderAdmin, leadsCsv } from "./lib/admin.js";

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
};

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...SECURITY_HEADERS, ...extra },
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const str = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function readBody(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return request.json().catch(() => ({}));
  if (type.includes("form")) return Object.fromEntries(await request.formData());
  return {};
}

async function rateLimited(env, ip, table, minutes = 10, max = 5) {
  if (!ip) return false;
  const col = table === "leads" ? "ip" : null;
  if (!col) return false;
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = ? AND created_at > datetime('now', ?)`,
  )
    .bind(ip, `-${minutes} minutes`)
    .first();
  return (row?.n || 0) >= max;
}

// ---------- handlers ----------

async function handleContact(request, env, ctx, origin) {
  const b = await readBody(request);
  if (str(b.website)) return json({ ok: true }); // honeypot: bots fill hidden field
  const lead = {
    id: crypto.randomUUID(),
    name: str(b.name, 120),
    email: str(b.email, 160).toLowerCase(),
    company: str(b.company, 160),
    phone: str(b.phone, 40),
    industry: str(b.industry, 80),
    interest: str(b.interest, 80),
    budget: str(b.budget, 60),
    message: str(b.message, 4000),
    source: str(b.source, 120) || "contact",
    ip: request.headers.get("cf-connecting-ip") || "",
  };
  const errors = {};
  if (lead.name.length < 2) errors.name = "Please tell us your name.";
  if (!EMAIL_RE.test(lead.email)) errors.email = "Please use a valid email address.";
  if (lead.message.length < 10) errors.message = "A sentence or two about the problem helps us prepare.";
  if (Object.keys(errors).length) return json({ ok: false, errors }, 422);
  if (await rateLimited(env, lead.ip, "leads")) return json({ ok: false, error: "Too many submissions. Please try again shortly." }, 429);

  await env.DB.prepare(
    `INSERT INTO leads (id, name, email, company, phone, industry, interest, budget, message, source, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(lead.id, lead.name, lead.email, lead.company, lead.phone, lead.industry, lead.interest, lead.budget, lead.message, lead.source, lead.ip)
    .run();

  const reply = T.leadAutoReply({ origin, lead });
  const note = T.leadNotification({ origin, lead });
  ctx.waitUntil(
    Promise.all([
      sendMail(env, { to: lead.email, replyTo: env.NOTIFY_EMAIL, kind: "lead_autoreply", ...reply }),
      sendMail(env, { to: env.NOTIFY_EMAIL, replyTo: `${lead.name} <${lead.email}>`, kind: "lead_notify", ...note }),
    ]),
  );
  return json({ ok: true, id: lead.id });
}

async function handleSubscribe(request, env, ctx, origin) {
  const b = await readBody(request);
  if (str(b.website)) return json({ ok: true });
  const email = str(b.email, 160).toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ ok: false, errors: { email: "Please use a valid email address." } }, 422);
  const res = await env.DB.prepare("INSERT OR IGNORE INTO subscribers (email, source) VALUES (?, ?)")
    .bind(email, str(b.source, 80) || "labs")
    .run();
  if (res.meta?.changes) {
    ctx.waitUntil(sendMail(env, { to: email, kind: "subscriber_welcome", ...T.subscriberWelcome({ origin }) }));
  }
  return json({ ok: true });
}

async function handleCheckout(request, env, origin) {
  if (!paystackConfigured(env)) return json({ ok: false, error: "Online payments are not switched on yet. Please use the contact form and we'll invoice you." }, 503);
  const b = await readBody(request);
  const offer = findOffer(str(b.offer_id, 80));
  const name = str(b.name, 120);
  const email = str(b.email, 160).toLowerCase();
  const company = str(b.company, 160);
  const errors = {};
  if (!offer) errors.offer_id = "Choose an engagement.";
  if (name.length < 2) errors.name = "Please tell us your name.";
  if (!EMAIL_RE.test(email)) errors.email = "Please use a valid email address.";
  if (Object.keys(errors).length) return json({ ok: false, errors }, 422);

  const reference = `NI-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  await env.DB.prepare(
    `INSERT INTO payments (reference, offer_id, offer_name, amount_cents, name, email, company) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(reference, offer.id, offer.name, offer.amount_cents, name, email, company)
    .run();

  try {
    const tx = await initializeTransaction(env, {
      email,
      amount_cents: offer.amount_cents,
      reference,
      callback_url: `${origin}/thank-you`,
      metadata: { offer_id: offer.id, name, company, custom_fields: [{ display_name: "Engagement", variable_name: "engagement", value: offer.name }] },
    });
    return json({ ok: true, authorization_url: tx.authorization_url, reference });
  } catch (err) {
    console.error("[checkout]", err.message);
    await env.DB.prepare("UPDATE payments SET status = 'init_failed', updated_at = datetime('now') WHERE reference = ?").bind(reference).run();
    return json({ ok: false, error: "We couldn't start the payment. Please try again or contact us." }, 502);
  }
}

// Idempotent: safe to call from both the webhook and the thank-you page.
async function finalizePayment(env, ctx, origin, tx) {
  const reference = tx.reference;
  const status = tx.status === "success" ? "success" : tx.status || "unknown";
  const paidAt = tx.paid_at || tx.paidAt || null;
  await env.DB.prepare(
    `UPDATE payments SET status = ?, channel = ?, paid_at = COALESCE(?, paid_at), updated_at = datetime('now') WHERE reference = ?`,
  )
    .bind(status, tx.channel || null, paidAt, reference)
    .run();
  if (status !== "success") return status;

  // Claim the receipt exactly once.
  const claim = await env.DB.prepare("UPDATE payments SET receipt_sent = 1 WHERE reference = ? AND receipt_sent = 0").bind(reference).run();
  if (claim.meta?.changes) {
    const payment = await env.DB.prepare("SELECT * FROM payments WHERE reference = ?").bind(reference).first();
    if (payment) {
      ctx.waitUntil(
        Promise.all([
          sendMail(env, { to: payment.email, replyTo: env.NOTIFY_EMAIL, kind: "payment_receipt", ...T.paymentReceipt({ origin, payment }) }),
          sendMail(env, { to: env.NOTIFY_EMAIL, replyTo: payment.email, kind: "payment_notify", ...T.paymentNotification({ origin, payment }) }),
        ]),
      );
    }
  }
  return status;
}

async function handleVerify(url, env, ctx, origin) {
  const reference = str(url.searchParams.get("reference"), 80);
  if (!reference) return json({ ok: false, error: "Missing reference" }, 400);
  const row = await env.DB.prepare("SELECT reference, offer_name, amount_cents, name, status FROM payments WHERE reference = ?").bind(reference).first();
  if (!row) return json({ ok: false, error: "Unknown reference" }, 404);
  let status = row.status;
  if (status !== "success" && paystackConfigured(env)) {
    try {
      status = await finalizePayment(env, ctx, origin, await verifyTransaction(env, reference));
    } catch (err) {
      console.error("[verify]", err.message);
    }
  }
  return json({ ok: true, reference, status, offer: row.offer_name, amount: formatZAR(row.amount_cents), name: row.name.split(" ")[0] });
}

async function handleWebhook(request, env, ctx, origin) {
  const raw = await request.text();
  if (!(await validSignature(env, raw, request.headers.get("x-paystack-signature")))) return json({ ok: false }, 401);
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ ok: false }, 400);
  }
  if (event.event === "charge.success" && event.data?.reference) {
    const exists = await env.DB.prepare("SELECT 1 FROM payments WHERE reference = ?").bind(event.data.reference).first();
    if (exists) await finalizePayment(env, ctx, origin, event.data);
  }
  return json({ ok: true });
}

function adminAuthorized(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const h = request.headers.get("authorization") || "";
  if (!h.startsWith("Basic ")) return false;
  try {
    const [user, pass] = atob(h.slice(6)).split(":");
    return user === "admin" && pass === env.ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

// ---------- router ----------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = url.origin;
    const { pathname } = url;
    const method = request.method;

    try {
      if (pathname === "/api/health") {
        return json({ ok: true, environment: env.ENVIRONMENT, email: gmailConfigured(env) ? "configured" : "missing", payments: paystackConfigured(env) ? "configured" : "missing" });
      }
      if (pathname === "/api/offers" && method === "GET") {
        return json({ ok: true, offers: OFFERS.map(({ id, name, tagline, amount_cents }) => ({ id, name, tagline, amount: formatZAR(amount_cents) })) });
      }
      if (pathname === "/api/contact" && method === "POST") return handleContact(request, env, ctx, origin);
      if (pathname === "/api/subscribe" && method === "POST") return handleSubscribe(request, env, ctx, origin);
      if (pathname === "/api/checkout" && method === "POST") return handleCheckout(request, env, origin);
      if (pathname === "/api/checkout/verify" && method === "GET") return handleVerify(url, env, ctx, origin);
      if (pathname === "/api/paystack/webhook" && method === "POST") return handleWebhook(request, env, ctx, origin);
      if (pathname.startsWith("/api/")) return json({ ok: false, error: "Not found" }, 404);

      if (pathname === "/admin" || pathname.startsWith("/admin/")) {
        if (!env.ADMIN_PASSWORD) return new Response("Admin is disabled until ADMIN_PASSWORD is set.", { status: 503 });
        if (!adminAuthorized(request, env)) {
          return new Response("Authentication required", { status: 401, headers: { "www-authenticate": 'Basic realm="Ndunge Intelligence Admin", charset="UTF-8"' } });
        }
        if (pathname === "/admin/leads.csv") {
          return new Response(await leadsCsv(env), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=leads.csv" } });
        }
        return new Response(await renderAdmin(env), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...SECURITY_HEADERS } });
      }

      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error("[worker]", err.stack || err.message);
      return json({ ok: false, error: "Something went wrong on our side." }, 500);
    }
  },
};

// Send mail as the Ndunge Intelligence Gmail account through the Gmail API.
// Needs three Worker secrets: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
// (see docs/SETUP.md). If they are missing, sending is skipped and logged — the site keeps working.

let cached = { token: null, exp: 0 };

export function gmailConfigured(env) {
  return Boolean(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN);
}

async function accessToken(env) {
  const now = Date.now();
  if (cached.token && cached.exp - 60_000 > now) return cached.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Google token refresh failed (${res.status}): ${data.error || ""} ${data.error_description || ""}`.trim());
  }
  cached = { token: data.access_token, exp: now + (data.expires_in || 3600) * 1000 };
  return cached.token;
}

const b64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64url = (str) => b64(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encodeHeader = (v) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);
const wrap76 = (s) => s.replace(/(.{76})/g, "$1\r\n");
const clean = (v) => String(v || "").replace(/[\r\n]+/g, " ").trim();

export function buildMime({ from, to, replyTo, subject, html, text }) {
  const boundary = "ni_" + crypto.randomUUID().replace(/-/g, "");
  const headers = [
    `From: ${clean(from)}`,
    `To: ${clean(to)}`,
    replyTo ? `Reply-To: ${clean(replyTo)}` : null,
    `Subject: ${encodeHeader(clean(subject))}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);
  return [
    ...headers,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64(text || "")),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64(html || "")),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/**
 * Send one email. In non-prod environments (EMAIL_MODE=owner-only) every message is
 * redirected to NOTIFY_EMAIL so test runs never reach real clients.
 */
export async function sendMail(env, { to, subject, html, text, replyTo, kind = "generic" }) {
  const owner = env.NOTIFY_EMAIL;
  const ownerOnly = env.EMAIL_MODE !== "live";
  const realTo = ownerOnly ? owner : to;
  const realSubject = ownerOnly && to !== owner ? `[${(env.ENVIRONMENT || "dev").toUpperCase()} → ${to}] ${subject}` : subject;
  const from = `${env.FROM_NAME || "Ndunge Intelligence"} <${owner}>`;

  let ok = 0;
  let detail = "";
  try {
    if (!gmailConfigured(env)) throw new Error("Gmail secrets not set — email skipped");
    const token = await accessToken(env);
    const raw = b64url(buildMime({ from, to: realTo, replyTo, subject: realSubject, html, text }));
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Gmail send failed (${res.status}): ${body?.error?.message || ""}`);
    ok = 1;
    detail = body.id || "";
  } catch (err) {
    detail = String(err.message || err).slice(0, 500);
    console.error("[mail]", kind, detail);
  }
  try {
    await env.DB.prepare("INSERT INTO email_log (kind, to_addr, subject, ok, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(kind, realTo || "", realSubject, ok, detail)
      .run();
  } catch (e) {
    console.error("[mail-log]", e.message);
  }
  return { ok: Boolean(ok), detail };
}

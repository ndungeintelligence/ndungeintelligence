// Minimal private dashboard at /admin (HTTP Basic auth: user "admin", password = ADMIN_PASSWORD secret).
import { esc } from "./templates.js";
import { formatZAR, PRICE_BOOK } from "../offers.js";

export async function renderAdmin(env, url) {
  const [clients, leads, payments, subs, mail, totals] = await Promise.all([
    env.DB.prepare("SELECT * FROM clients ORDER BY created_at DESC LIMIT 500").all(),
    env.DB.prepare("SELECT * FROM leads ORDER BY created_at DESC LIMIT 200").all(),
    env.DB.prepare("SELECT * FROM payments ORDER BY created_at DESC LIMIT 200").all(),
    env.DB.prepare("SELECT * FROM subscribers ORDER BY created_at DESC LIMIT 200").all(),
    env.DB.prepare("SELECT * FROM email_log ORDER BY id DESC LIMIT 50").all(),
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM leads) AS leads,
              (SELECT COUNT(*) FROM leads WHERE created_at > datetime('now','-7 days')) AS leads7,
              (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE status='success') AS revenue,
              (SELECT COUNT(*) FROM subscribers) AS subs`,
    ).first(),
  ]);
  const t = (rows, cols) =>
    `<div class="tw"><table><thead><tr>${cols.map(([h]) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${
      rows.results.length
        ? rows.results.map((r) => `<tr>${cols.map(([, f]) => `<td>${f(r)}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${cols.length}" class="empty">Nothing yet.</td></tr>`
    }</tbody></table></div>`;
  const pill = (s) => `<span class="pill ${esc(s)}">${esc(s)}</span>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Admin · Ngomso Intelligence</title>
<link rel="icon" href="/assets/brand/favicon.svg">
<style>
:root{--ink:#0A0A0B;--paper:#F2F0EC;--line:#E4E1DB;--mute:#8D8A93;--lilac:#8B7BB8;--ember:#C8A27C}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 Inter,system-ui,sans-serif;background:var(--paper);color:var(--ink)}
header{background:var(--ink);color:var(--paper);padding:18px 24px;display:flex;justify-content:space-between;align-items:center}
main{max-width:1200px;margin:0 auto;padding:24px 16px 80px}
h2{font-weight:500;letter-spacing:-.02em;margin:40px 0 12px}
.k{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.k div{background:#fff;border-radius:16px;padding:18px}.k b{display:block;font-size:28px;font-weight:500;letter-spacing:-.03em}
.k span{color:var(--mute);font-size:12px}
.tw{overflow:auto;background:#fff;border-radius:16px}table{border-collapse:collapse;width:100%;min-width:720px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}th{font-weight:500;color:var(--mute);font-size:12px}
td.msg{max-width:380px;white-space:pre-wrap}.empty{color:var(--mute);text-align:center;padding:28px}
.pill{font-size:11px;padding:2px 8px;border-radius:99px;background:var(--line)}.pill.success{background:#DDEFD9}.pill.initialized{background:#EFE7D8}
a{color:inherit}
.onboard{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;background:#fff;border-radius:16px;padding:16px;margin-bottom:12px;align-items:end}
.onboard label{display:grid;gap:4px;font-size:12px;color:var(--mute)}
.onboard input,.onboard select{font:inherit;padding:9px 10px;border:1px solid #CFCAC2;border-radius:10px;background:#fff;color:var(--ink)}
.onboard .chk{display:flex;align-items:center;gap:8px;color:var(--ink)}
.onboard button{font:inherit;background:var(--ink);color:var(--paper);border:0;border-radius:99px;padding:10px 18px;cursor:pointer}
.ok{color:#2F7A47}.bad{color:#B5473D}.pill.live,.pill.connected{background:#DDEFD9}
</style></head><body>
<header><div>Ngomso <span style="color:var(--mute)">Intelligence</span> · Admin · ${esc(env.ENVIRONMENT || "")}</div><a href="/admin/leads.csv">Export leads CSV</a></header>
<main>
<div class="k"><div><span>Total leads</span><b>${totals.leads}</b></div><div><span>Leads, last 7 days</span><b>${totals.leads7}</b></div>
<div><span>Paid revenue</span><b>${formatZAR(totals.revenue)}</b></div><div><span>Labs subscribers</span><b>${totals.subs}</b></div></div>
<h2 id="clients">Agentic Commerce OS clients</h2>
${url && url.searchParams.get("onboarded") ? '<p class="ok">Client saved.</p>' : ""}${url && url.searchParams.get("error") ? `<p class="bad">${esc(url.searchParams.get("error"))}</p>` : ""}
<form class="onboard" method="post" action="/admin/clients">
  <label>Name<input name="name" required></label>
  <label>Email<input name="email" type="email" required></label>
  <label>Company<input name="company"></label>
  <label>Store URL<input name="store_url" placeholder="https://"></label>
  <label>Plan<select name="plan">${PRICE_BOOK.tiers.map((t) => `<option value="${t.id}">${t.name} — ${formatZAR(t.monthly)}/month</option>`).join("")}</select></label>
  <label>Stage<select name="stage"><option value="audit">Audit</option><option value="setup">Setup</option><option value="connected">Connected</option><option value="live">Live</option></select></label>
  <label class="chk"><input type="checkbox" name="invite" value="1" checked> Email a portal invitation</label>
  <button type="submit">Save client</button>
</form>
${t(clients, [
    ["Onboarded", (r) => esc(r.created_at)],
    ["Client", (r) => `${esc(r.name)}<br><a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`],
    ["Company / store", (r) => `${esc(r.company)}${r.store_url ? `<br><a href="${esc(r.store_url)}" target="_blank" rel="noopener">${esc(r.store_url)}</a>` : ""}`],
    ["Plan", (r) => esc(r.plan)],
    ["Stage", (r) => pill(r.stage)],
  ])}
<h2>Leads</h2>${t(leads, [
    ["When", (r) => esc(r.created_at)],
    ["Who", (r) => `${esc(r.name)}<br><a href="mailto:${esc(r.email)}">${esc(r.email)}</a>${r.phone ? "<br>" + esc(r.phone) : ""}`],
    ["Company", (r) => esc(r.company)],
    ["Interest", (r) => `${esc(r.interest)}<br><span style="color:var(--mute)">${esc(r.industry)} · ${esc(r.budget)}</span>`],
    ["Message", (r) => `<div class="msg">${esc(r.message)}</div>`],
  ])}
<h2>Payments</h2>${t(payments, [
    ["When", (r) => esc(r.created_at)],
    ["Reference", (r) => esc(r.reference)],
    ["Engagement", (r) => esc(r.offer_name)],
    ["Amount", (r) => formatZAR(r.amount_cents)],
    ["Client", (r) => `${esc(r.name)}<br>${esc(r.email)}`],
    ["Status", (r) => pill(r.status)],
  ])}
<h2>Labs subscribers</h2>${t(subs, [["When", (r) => esc(r.created_at)], ["Email", (r) => esc(r.email)], ["Source", (r) => esc(r.source)]])}
<h2>Email log</h2>${t(mail, [
    ["When", (r) => esc(r.created_at)],
    ["Kind", (r) => esc(r.kind)],
    ["To", (r) => esc(r.to_addr)],
    ["Result", (r) => (r.ok ? pill("success") : `<span class="pill">failed</span> <span style="color:var(--mute)">${esc(r.detail)}</span>`)],
  ])}
</main></body></html>`;
}

export async function leadsCsv(env) {
  const { results } = await env.DB.prepare("SELECT created_at,name,email,phone,company,industry,interest,budget,message,source FROM leads ORDER BY created_at DESC").all();
  const cols = ["created_at", "name", "email", "phone", "company", "industry", "interest", "budget", "message", "source"];
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...results.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}

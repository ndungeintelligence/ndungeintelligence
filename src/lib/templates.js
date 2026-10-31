// Branded transactional email templates (table layout + inline styles for email clients).
import { formatZAR } from "../offers.js";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function shell({ origin, preheader, heading, body, cta }) {
  const logo = `${origin}/assets/brand/icon-512.png`;
  const button = cta
    ? `<tr><td style="padding:8px 0 4px"><a href="${esc(cta.href)}" style="display:inline-block;background:#0A0A0B;color:#F2F0EC;text-decoration:none;font-size:14px;padding:12px 22px;border-radius:999px">${esc(cta.label)} &rarr;</a></td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#ECEAE6;font-family:Inter,Helvetica,Arial,sans-serif;color:#0A0A0B">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ECEAE6;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:20px;overflow:hidden">
<tr><td style="background:#0A0A0B;padding:22px 32px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td><img src="${logo}" width="28" height="28" alt="" style="display:block;border-radius:6px"></td>
    <td style="padding-left:10px;color:#F2F0EC;font-size:14px;letter-spacing:-0.01em">Ngomso <span style="color:#8D8A93">Intelligence</span></td>
  </tr></table>
</td></tr>
<tr><td style="padding:36px 32px 8px">
  <h1 style="margin:0 0 18px;font-size:26px;line-height:1.2;font-weight:500;letter-spacing:-0.02em">${heading}</h1>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="font-size:15px;line-height:1.65;color:#3B3940">${body}</td></tr>
  ${button}
  </table>
</td></tr>
<tr><td style="padding:28px 32px 32px;font-size:12px;line-height:1.6;color:#8D8A93;border-top:1px solid #EEECE8">
  Ngomso Intelligence · Emerging-technology infrastructure, engineered for specific industries.<br>
  Johannesburg, South Africa · <a href="${origin}" style="color:#8D8A93">${esc(origin.replace(/^https?:\/\//, ""))}</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

const row = (k, v) =>
  v ? `<tr><td style="padding:6px 0;color:#8D8A93;width:120px;vertical-align:top">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>` : "";

export function leadAutoReply({ origin, lead }) {
  const first = esc(String(lead.name).split(" ")[0]);
  return {
    subject: "We've received your brief — Ngomso Intelligence",
    html: shell({
      origin,
      preheader: "Thanks for reaching out. Here's what happens next.",
      heading: `Thanks, ${first}. Your brief is with us.`,
      body: `<p style="margin:0 0 14px">We read every enquiry personally. Within one business day you'll hear from a senior engineer with either a few sharp questions or a time to talk.</p>
<p style="margin:0 0 14px"><strong>What happens next</strong><br>1. We review your context and map it to the infrastructure patterns that fit.<br>2. A 30-minute call to confirm the problem, constraints and budget.<br>3. A short written proposal — scope, timeline and a fixed price.</p>
<p style="margin:0 0 18px">If it's urgent, simply reply to this email.</p>`,
      cta: { href: `${origin}/infrastructure`, label: "Explore the infrastructure library" },
    }),
    text: `Thanks, ${lead.name}. Your brief is with us.\n\nWe'll be in touch within one business day.\n\n1. We review your context\n2. A 30-minute call\n3. A short written proposal with a fixed price\n\nReply to this email if it's urgent.\n\nNgomso Intelligence — ${origin}`,
  };
}

export function leadNotification({ origin, lead }) {
  return {
    subject: `New lead: ${lead.name}${lead.company ? " · " + lead.company : ""} (${lead.interest || "general"})`,
    html: shell({
      origin,
      preheader: `${lead.name} <${lead.email}>`,
      heading: "New enquiry",
      body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
${row("Name", lead.name)}${row("Email", lead.email)}${row("Phone", lead.phone)}${row("Company", lead.company)}${row("Industry", lead.industry)}${row("Interest", lead.interest)}${row("Budget", lead.budget)}${row("Source", lead.source)}
</table>
<p style="margin:18px 0 0;white-space:pre-wrap">${esc(lead.message)}</p>`,
      cta: { href: `${origin}/admin`, label: "Open admin" },
    }),
    text: `New enquiry\n\n${lead.name} <${lead.email}>\n${lead.company || ""}\n${lead.industry || ""} / ${lead.interest || ""} / ${lead.budget || ""}\n\n${lead.message || ""}`,
  };
}

export function paymentReceipt({ origin, payment }) {
  const amount = formatZAR(payment.amount_cents);
  return {
    subject: `Payment received — ${payment.offer_name}`,
    html: shell({
      origin,
      preheader: `${amount} received. Reference ${payment.reference}.`,
      heading: "Payment received. Let's get to work.",
      body: `<p style="margin:0 0 16px">Thank you, ${esc(String(payment.name).split(" ")[0])}. We've received your payment and will contact you within one business day to schedule kick-off.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 18px">
${row("Engagement", payment.offer_name)}${row("Amount", amount)}${row("Reference", payment.reference)}${row("Paid", payment.paid_at)}
</table>
<p style="margin:0 0 8px">Keep this email as your receipt. A tax invoice follows separately if you need one — just reply with your company details.</p>`,
    }),
    text: `Payment received — ${payment.offer_name}\nAmount: ${amount}\nReference: ${payment.reference}\n\nWe'll contact you within one business day.`,
  };
}

export function paymentNotification({ origin, payment }) {
  return {
    subject: `Paid: ${formatZAR(payment.amount_cents)} · ${payment.offer_name} · ${payment.name}`,
    html: shell({
      origin,
      preheader: payment.reference,
      heading: "New payment",
      body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
${row("Engagement", payment.offer_name)}${row("Amount", formatZAR(payment.amount_cents))}${row("Client", payment.name)}${row("Email", payment.email)}${row("Company", payment.company)}${row("Channel", payment.channel)}${row("Reference", payment.reference)}
</table>`,
      cta: { href: `${origin}/admin`, label: "Open admin" },
    }),
    text: `New payment: ${payment.offer_name} ${formatZAR(payment.amount_cents)} from ${payment.name} <${payment.email}> ref ${payment.reference}`,
  };
}

export function subscriberWelcome({ origin }) {
  return {
    subject: "You're on the Ngomso Intelligence Labs list",
    html: shell({
      origin,
      preheader: "Field notes on emerging infrastructure, from Johannesburg.",
      heading: "Welcome to Ngomso Intelligence Labs.",
      body: `<p style="margin:0 0 14px">You'll get short, practical field notes when we ship something: new infrastructure blueprints, open tools, and what we're learning about agentic commerce and payments in Africa.</p><p style="margin:0">No spam, and you can reply "unsubscribe" at any time.</p>`,
      cta: { href: `${origin}/labs`, label: "See what we're building" },
    }),
    text: `Welcome to Ngomso Intelligence Labs. You'll get short field notes when we ship something. Reply "unsubscribe" any time.\n${origin}/labs`,
  };
}

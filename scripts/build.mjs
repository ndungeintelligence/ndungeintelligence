// Zero-dependency static site build: site/pages/*.html + site/layout.html → dist/
// Each page starts with <!--meta {"title": "...", "description": "...", "label": "...", "header": "dark|light"} -->
import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OFFERS, PRICE_BOOK as P, formatZAR, formatUSD } from "../src/offers.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(root, "site");
const DIST = join(root, "dist");
const SITE_URL = process.env.SITE_URL || "https://ndungeintelligence.com";

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
cpSync(join(SITE, "assets"), join(DIST, "assets"), { recursive: true });
for (const f of ["_headers", "robots.txt"]) cpSync(join(SITE, f), join(DIST, f));

const layout = readFileSync(join(SITE, "layout.html"), "utf8");
const partial = (name) => readFileSync(join(SITE, "partials", name), "utf8");
const mark = partial("mark.svg").trim();
const version = Date.now().toString(36);

const offersHtml = OFFERS.map(
  (o) => `<article class="offer${o.featured ? " offer--featured" : ""}" data-reveal>
  ${o.featured ? '<span class="chip chip--ember">Most requested</span>' : '<span class="chip">Engagement</span>'}
  <h3>${o.name}</h3>
  <p class="offer__tag">${o.tagline}</p>
  <p class="offer__price">${formatZAR(o.amount_cents)}<small> once-off</small></p>
  <ul>${o.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>
  <button class="btn ${o.featured ? "btn--ember" : "btn--ink"}" data-checkout="${o.id}" data-name="${o.name}" data-price="${formatZAR(o.amount_cents)}">Book &amp; pay <span aria-hidden="true">→</span></button>
</article>`,
).join("\n");

const tierCards = P.tiers.map((t, i) => `<article class="tier${i === 1 ? " tier--featured" : ""}" data-reveal>
  <span class="chip">${t.name}</span>
  <p class="tier__price">${formatZAR(t.monthly)}<small>/month</small></p>
  <p class="tier__usd">≈ ${formatUSD(t.monthly)} per month</p>
  <p class="tier__fit">${t.fit}</p>
</article>`).join("\n");
const pricingHtml = `<div class="tiers">${tierCards}</div>
<table class="pricebook">
  <tr><th>Agentic Commerce OS</th><th class="n">Price</th><th>What it covers</th></tr>
  <tr><td>Agent-Readiness Audit</td><td class="n">${formatZAR(P.audit)}</td><td>Scored report and fix list. Credited against Setup.</td></tr>
  <tr><td>Agent-Readiness Setup</td><td class="n">${formatZAR(P.setup)} once-off</td><td>We clean your catalogue and switch on AI shopping channels.</td></tr>
  <tr><td>Connector subscription</td><td class="n">${formatZAR(P.tiers[0].monthly)}–${formatZAR(P.tiers[2].monthly)}/month</td><td>Keeps your store readable and buyable by AI agents. Tiers above.</td></tr>
  <tr><td>Settlement</td><td class="n">${(P.settlementFee * 100).toFixed(2)}%</td><td>Of sales made through AI agents and settled by us in rand.</td></tr>
</table>`;
const PRICES = { "{{price.audit}}": formatZAR(P.audit), "{{price.setup}}": formatZAR(P.setup), "{{price.session}}": formatZAR(P.strategySession),
  "{{price.launch}}": formatZAR(P.tiers[0].monthly), "{{price.scale}}": formatZAR(P.tiers[2].monthly), "{{price.blended}}": formatZAR(P.blendedMonthly),
  "{{price.settle}}": (P.settlementFee * 100).toFixed(2) + "%", "{{price.sprint}}": formatZAR(P.sprint) };
const fillPrices = (s) => Object.entries(PRICES).reduce((acc, [k, v]) => acc.replaceAll(k, v), s);

const pages = readdirSync(join(SITE, "pages")).filter((f) => f.endsWith(".html"));
const urls = [];
for (const file of pages) {
  const src = readFileSync(join(SITE, "pages", file), "utf8");
  const m = src.match(/^<!--meta\s+(\{[\s\S]*?\})\s*-->/);
  const meta = m ? JSON.parse(m[1]) : {};
  const body = fillPrices(src.slice(m ? m[0].length : 0).replaceAll("{{offers}}", offersHtml).replaceAll("{{pricing}}", pricingHtml).replaceAll("{{mark}}", mark));
  const slug = file.replace(/\.html$/, "");
  const path = slug === "index" ? "/" : `/${slug}`;
  const html = layout
    .replaceAll("{{title}}", meta.title || "Ngomso Intelligence")
    .replaceAll("{{description}}", meta.description || "Emerging-technology infrastructure, engineered for specific industries.")
    .replaceAll("{{label}}", meta.label || "Infrastructure Intelligence")
    .replaceAll("{{header}}", meta.header || "dark")
    .replaceAll("{{robots}}", meta.noindex ? "noindex" : "index,follow")
    .replaceAll("{{canonical}}", SITE_URL + path)
    .replaceAll("{{page}}", slug)
    .replaceAll("{{v}}", version)
    .replaceAll("{{mark}}", mark)
    .replaceAll("{{year}}", String(new Date().getFullYear()))
    .replace("{{content}}", body);
  writeFileSync(join(DIST, file), html);
  if (!meta.noindex) urls.push(SITE_URL + path);
}

writeFileSync(
  join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`,
);

const size = (d) => readdirSync(d).reduce((n, f) => n + (statSync(join(d, f)).isDirectory() ? size(join(d, f)) : statSync(join(d, f)).size), 0);
console.log(`Built ${pages.length} pages → dist/ (${(size(DIST) / 1024).toFixed(0)} KB)`);

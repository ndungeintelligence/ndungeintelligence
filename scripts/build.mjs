// Zero-dependency static site build: site/pages/*.html + site/layout.html → dist/
// Each page starts with <!--meta {"title": "...", "description": "...", "label": "...", "header": "dark|light"} -->
import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OFFERS, formatZAR } from "../src/offers.js";

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

const pages = readdirSync(join(SITE, "pages")).filter((f) => f.endsWith(".html"));
const urls = [];
for (const file of pages) {
  const src = readFileSync(join(SITE, "pages", file), "utf8");
  const m = src.match(/^<!--meta\s+(\{[\s\S]*?\})\s*-->/);
  const meta = m ? JSON.parse(m[1]) : {};
  const body = src.slice(m ? m[0].length : 0).replaceAll("{{offers}}", offersHtml).replaceAll("{{mark}}", mark);
  const slug = file.replace(/\.html$/, "");
  const path = slug === "index" ? "/" : `/${slug}`;
  const html = layout
    .replaceAll("{{title}}", meta.title || "Ngomso")
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

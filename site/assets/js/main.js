/* Ngomso — interactions & generative visuals (no dependencies) */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* ── header state ───────────────────────────────────── */
  const header = $(".site-header");
  const onScroll = () => header && header.classList.toggle("is-solid", scrollY > 40);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  const here = location.pathname.replace(/\/$/, "") || "/";
  $$(".site-header__nav a").forEach((a) => { if (a.getAttribute("href") === here) a.setAttribute("aria-current", "page"); });

  /* ── menu ───────────────────────────────────────────── */
  const menu = $("#menu"), burger = $(".burger");
  const openMenu = () => { menu.hidden = false; requestAnimationFrame(() => menu.classList.add("is-open")); document.body.classList.add("no-scroll"); burger.setAttribute("aria-expanded", "true"); $(".menu__close").focus(); Viz.scan(menu); };
  const closeMenu = () => { menu.classList.remove("is-open"); document.body.classList.remove("no-scroll"); burger.setAttribute("aria-expanded", "false"); setTimeout(() => (menu.hidden = true), 350); };
  burger && burger.addEventListener("click", openMenu);
  menu && $(".menu__close").addEventListener("click", closeMenu);
  menu && menu.addEventListener("click", (e) => { if (e.target === menu) closeMenu(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && menu && !menu.hidden) closeMenu(); });

  /* ── reveal ─────────────────────────────────────────── */
  $$(".split-words").forEach((el) => {
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(part));
            else { const s = document.createElement("span"); s.className = "w"; s.textContent = part; frag.appendChild(s); }
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== "BR") walk(n);
      });
    };
    walk(el);
    $$(".w", el).forEach((w, i) => (w.style.transitionDelay = `${i * 55}ms`));
  });
  const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  $$("[data-reveal], .split-words").forEach((el, i) => { if (el.hasAttribute("data-reveal")) el.style.transitionDelay = `${(i % 4) * 70}ms`; io.observe(el); });

  /* ── filters (cards + faq) ──────────────────────────── */
  $$("[data-filter-group]").forEach((group) => {
    const target = $(group.dataset.filterGroup);
    $$("[data-filter]", group).forEach((btn) => btn.addEventListener("click", () => {
      $$("[data-filter]", group).forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      const f = btn.dataset.filter;
      $$("[data-tags]", target).forEach((item) => item.classList.toggle("is-hidden", f !== "all" && !item.dataset.tags.split(" ").includes(f)));
      Viz.scan(target);
    }));
  });

  /* ── rails ──────────────────────────────────────────── */
  $$("[data-rail]").forEach((wrap) => {
    const rail = $(".rail", wrap), bar = $(".rail-progress i", wrap);
    const update = () => { const max = rail.scrollWidth - rail.clientWidth; const vis = rail.clientWidth / rail.scrollWidth; if (bar) { bar.style.width = `${vis * 100}%`; bar.style.transform = `translateX(${max ? (rail.scrollLeft / max) * ((1 - vis) / vis) * 100 : 0}%)`; } };
    rail.addEventListener("scroll", update, { passive: true }); addEventListener("resize", update); update();
    $$("[data-rail-dir]", wrap).forEach((b) => b.addEventListener("click", () => rail.scrollBy({ left: Number(b.dataset.railDir) * rail.clientWidth * 0.8, behavior: "smooth" })));
  });

  /* ── forms ──────────────────────────────────────────── */
  const setStatus = (form, msg, kind) => { const s = $(".form-status", form); if (s) { s.textContent = msg; s.className = `form-status ${kind || ""}`; } };
  const clearErrors = (form) => $$(".field-error", form).forEach((e) => e.remove());
  const showErrors = (form, errors = {}) => Object.entries(errors).forEach(([k, v]) => {
    const input = form.elements[k]; if (!input || !input.closest) return;
    const p = document.createElement("span"); p.className = "field-error"; p.textContent = v;
    (input.closest("label") || input.parentElement).appendChild(p);
  });
  async function post(url, form) {
    const data = Object.fromEntries(new FormData(form));
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    const body = await res.json().catch(() => ({ ok: false, error: "Unexpected response." }));
    return { res, body };
  }
  const busy = (form, on, label) => { const b = $("button[type=submit]", form); if (!b) return; if (on) { b.dataset.label = b.innerHTML; b.innerHTML = label; b.disabled = true; } else { b.innerHTML = b.dataset.label || b.innerHTML; b.disabled = false; } };

  $$('form[data-form="contact"]').forEach((form) => {
    const params = new URLSearchParams(location.search);
    const pre = params.get("interest");
    if (pre) { const r = $$('input[name="interest"]', form).find((i) => i.value.toLowerCase() === pre.toLowerCase()); if (r) r.checked = true; }
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); clearErrors(form); setStatus(form, ""); busy(form, true, "Sending…");
      try {
        const { body } = await post("/api/contact", form);
        if (body.ok) {
          form.innerHTML = `<div class="sent"><p class="eyebrow">Brief received</p><h3 class="h3">Thank you — it's with us.</h3><p class="lede" style="margin-top:12px">A confirmation is on its way to your inbox. A senior engineer will respond within one business day.</p></div>`;
        } else { showErrors(form, body.errors); setStatus(form, body.error || "Please check the highlighted fields.", "err"); }
      } catch { setStatus(form, "Network error — please try again, or email ndungeintelligence@gmail.com.", "err"); }
      busy(form, false);
    });
  });

  $$('form[data-form="subscribe"]').forEach((form) => form.addEventListener("submit", async (e) => {
    e.preventDefault(); clearErrors(form); busy(form, true, "…");
    try { const { body } = await post("/api/subscribe", form); if (body.ok) { setStatus(form, "You're on the list. Welcome.", "ok"); form.reset(); } else setStatus(form, body.errors?.email || body.error || "Please try again.", "err"); }
    catch { setStatus(form, "Network error — please try again.", "err"); }
    busy(form, false);
  }));

  const dialog = $("#checkout");
  $$("[data-checkout]").forEach((btn) => btn.addEventListener("click", () => {
    if (!dialog) return;
    const form = $('form[data-form="checkout"]', dialog);
    form.elements.offer_id.value = btn.dataset.checkout;
    $(".checkout__title", dialog).textContent = btn.dataset.name;
    $(".checkout__price", dialog).textContent = `${btn.dataset.price} · once-off, ZAR`;
    setStatus(form, ""); clearErrors(form);
    dialog.showModal();
    setTimeout(() => form.elements.name.focus(), 50);
  }));
  $$('form[data-form="checkout"]').forEach((form) => form.addEventListener("submit", async (e) => {
    e.preventDefault(); clearErrors(form); setStatus(form, ""); busy(form, true, "Opening secure checkout…");
    try {
      const { body } = await post("/api/checkout", form);
      if (body.ok && body.authorization_url) { location.href = body.authorization_url; return; }
      showErrors(form, body.errors); setStatus(form, body.error || "Please check the fields above.", "err");
    } catch { setStatus(form, "Network error — please try again.", "err"); }
    busy(form, false);
  }));

  /* thank-you page: verify payment */
  const receipt = $("[data-receipt]");
  if (receipt) {
    const ref = new URLSearchParams(location.search).get("reference") || new URLSearchParams(location.search).get("trxref");
    const title = $("[data-receipt-title]"), lede = $("[data-receipt-lede]");
    if (!ref) { title.textContent = "Thank you."; lede.textContent = "If you've just paid, check your inbox for a receipt."; }
    else {
      fetch(`/api/checkout/verify?reference=${encodeURIComponent(ref)}`).then((r) => r.json()).then((d) => {
        if (!d.ok) throw new Error(d.error);
        receipt.innerHTML = `<div><span>Engagement</span><b>${d.offer}</b></div><div><span>Amount</span><b>${d.amount}</b></div><div><span>Reference</span><b class="mono">${d.reference}</b></div><div><span>Status</span><b>${d.status === "success" ? "Paid" : d.status}</b></div>`;
        receipt.hidden = false;
        if (d.status === "success") { title.textContent = `Thank you, ${d.name}. We're on it.`; lede.textContent = "Your receipt is in your inbox. We'll reach out within one business day to schedule kick-off."; }
        else { title.textContent = "Payment not completed yet."; lede.textContent = "If you were charged, it can take a minute to confirm — refresh shortly, or reply to any of our emails."; }
      }).catch(() => { title.textContent = "We couldn't confirm that payment."; lede.textContent = "If you were charged, email ndungeintelligence@gmail.com with your reference and we'll sort it out."; });
    }
  }

  $$("[data-year]").forEach((e) => (e.textContent = new Date().getFullYear()));

  /* ══════════════════════════════════════════════════════
     Generative visuals
     ══════════════════════════════════════════════════════ */
  const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // Simplified Africa outline (lon, lat) + Madagascar
  const AFRICA = [[-5.9,35.8],[-1.5,35.2],[3,36.8],[10,37.3],[11.1,35.2],[10.2,33.8],[11.5,33.1],[15,32.3],[19,30.3],[20.1,32.1],[23,32.6],[25,31.7],[29,30.9],[32.3,31.3],[34.2,31.2],[34.9,29.5],[33.6,27.8],[35.5,23.9],[37.2,21],[38.5,18],[39.7,15.5],[41.6,13.5],[43.3,12.6],[43.2,11.5],[45,10.6],[51.2,11.8],[51,10.4],[49.5,7],[47.5,4.5],[45.5,2],[42,-1],[40.2,-3.5],[39.3,-6.8],[39.6,-9],[40.5,-10.5],[40.7,-15],[38,-17.3],[36.8,-17.9],[35.3,-22],[35.5,-24],[32.9,-26],[32.4,-28.8],[31,-29.9],[30,-31.3],[27.9,-33],[25.6,-34],[22.5,-34],[20,-34.8],[18.4,-34.2],[18.2,-32.8],[17.8,-31],[16.5,-28.6],[15.2,-26.7],[14.5,-22.9],[13.2,-20],[11.8,-17.3],[11.8,-15.8],[12.3,-13],[13.6,-11],[13.3,-8.8],[12.3,-6],[11.9,-4],[9.4,0.4],[9.7,3.9],[8.6,4.5],[6.3,4.3],[4.8,6.1],[3.4,6.4],[1.2,6.1],[-2,4.8],[-4,5.2],[-7.5,4.4],[-9.3,5.6],[-11,6.8],[-13.2,8.5],[-15,10.8],[-16.8,13.5],[-17.4,14.7],[-16.5,16.5],[-16.2,19.5],[-17,21],[-15.8,23.7],[-14.5,26],[-13,27.7],[-11.5,28.2],[-9.8,29.5],[-9.6,32.5],[-8.5,33.3],[-6.8,34]];
  const MADAGASCAR = [[49.3,-12],[50.4,-15.5],[49.7,-17],[47.1,-24.9],[45.2,-25.5],[43.6,-23.5],[44.2,-20],[44.4,-16.2],[47.4,-14]];
  const CITIES = { jhb: [28.04, -26.2], lagos: [3.38, 6.52], nairobi: [36.82, -1.29], cairo: [31.24, 30.04], accra: [-0.19, 5.6], kigali: [30.06, -1.95], capetown: [18.42, -33.92] };
  const inPoly = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const inSA = (lon, lat) => lat < -22 && lon > 16 && lon < 33.5 && !(lat > -24 && lon < 20);

  function africaDots(step) {
    const pts = [];
    for (let lat = 37.5; lat > -35.5; lat -= step) for (let lon = -18; lon < 52; lon += step) {
      if (inPoly(lon, lat, AFRICA) || inPoly(lon, lat, MADAGASCAR)) pts.push({ lon, lat, sa: inSA(lon, lat) });
    }
    return pts;
  }

  const VIZ = {};

  /* hero — scattered field condenses into a dotted Africa, Johannesburg node pulses, signal arcs travel north */
  VIZ.africa = (c, ctx, w, h, opts) => {
    const r = rng(7);
    const wide = w > 860;
    const mapH = wide ? Math.min(h * 0.74, w * 0.56) : Math.min(h * 0.4, w * 0.92);
    const mapW = mapH * (70 / 73);
    const ox = wide ? w - mapW - w * 0.06 : (w - mapW) / 2;
    const oy = wide ? (h - mapH) / 2 - h * 0.05 : 72;
    const proj = (lon, lat) => [ox + ((lon + 18) / 70) * mapW, oy + ((37.5 - lat) / 73) * mapH];
    const step = mapH > 620 ? 0.95 : mapH > 420 ? 1.2 : 1.55;
    const pts = africaDots(step).map((p) => {
      const [hx, hy] = proj(p.lon, p.lat);
      return { hx, hy, x: r() * w, y: r() * h, sa: p.sa, d: r(), ph: r() * 6.28 };
    });
    const ambient = Array.from({ length: wide ? 90 : 50 }, () => ({ x: r() * w, y: r() * h, vx: (r() - .5) * .15, vy: (r() - .5) * .15, s: r() * 1.4 + .4 }));
    const jhb = proj(...CITIES.jhb);
    const routes = ["lagos", "nairobi", "cairo", "accra", "kigali"].map((k, i) => ({ to: proj(...CITIES[k]), off: i * 0.21 }));
    const mouse = { x: -999, y: -999 };
    c.addEventListener("pointermove", (e) => { const b = c.getBoundingClientRect(); mouse.x = e.clientX - b.left; mouse.y = e.clientY - b.top; });
    c.addEventListener("pointerleave", () => (mouse.x = mouse.y = -999));
    const dotR = Math.max(1, mapH / 520);
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const start = performance.now();

    return (now) => {
      const t = reduce ? 10 : (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);
      // ambient drift
      ctx.fillStyle = "rgba(242,240,236,.18)";
      for (const a of ambient) { a.x = (a.x + a.vx + w) % w; a.y = (a.y + a.vy + h) % h; ctx.beginPath(); ctx.arc(a.x, a.y, a.s, 0, 6.283); ctx.fill(); }
      // map dots
      for (const p of pts) {
        const k = ease(Math.min(1, Math.max(0, (t - 0.2 - p.d * 1.4) / 1.6)));
        let x = p.x + (p.hx - p.x) * k, y = p.y + (p.hy - p.y) * k;
        x += Math.sin(t * .8 + p.ph) * .6; y += Math.cos(t * .7 + p.ph) * .6;
        const dx = x - mouse.x, dy = y - mouse.y, dd = dx * dx + dy * dy;
        if (dd < 8100) { const f = (1 - Math.sqrt(dd) / 90) * 14; const m = Math.sqrt(dd) || 1; x += (dx / m) * f; y += (dy / m) * f; }
        const tw = .55 + .45 * Math.sin(t * 1.3 + p.ph);
        ctx.fillStyle = p.sa ? `rgba(200,162,124,${.55 + .4 * tw})` : `rgba(242,240,236,${(.18 + .32 * tw) * (0.4 + .6 * k)})`;
        ctx.beginPath(); ctx.arc(x, y, p.sa ? dotR * 1.15 : dotR, 0, 6.283); ctx.fill();
      }
      const settle = Math.min(1, Math.max(0, (t - 2.6) / 1));
      if (settle > 0) {
        // signal arcs from Johannesburg
        for (const rt of routes) {
          const [x2, y2] = rt.to, cx = (jhb[0] + x2) / 2 - (y2 - jhb[1]) * .25, cy = (jhb[1] + y2) / 2 + (x2 - jhb[0]) * .12;
          ctx.strokeStyle = `rgba(164,151,200,${.22 * settle})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(jhb[0], jhb[1]); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke();
          const u = ((t * .18 + rt.off) % 1);
          const bx = (1 - u) * (1 - u) * jhb[0] + 2 * (1 - u) * u * cx + u * u * x2, by = (1 - u) * (1 - u) * jhb[1] + 2 * (1 - u) * u * cy + u * u * y2;
          ctx.fillStyle = `rgba(242,240,236,${.9 * settle * Math.sin(u * Math.PI)})`; ctx.beginPath(); ctx.arc(bx, by, 2, 0, 6.283); ctx.fill();
          ctx.fillStyle = `rgba(164,151,200,${.8 * settle})`; ctx.beginPath(); ctx.arc(x2, y2, 2.4, 0, 6.283); ctx.fill();
        }
        // Johannesburg node
        const pr = (t * .6) % 1;
        ctx.strokeStyle = `rgba(200,162,124,${(1 - pr) * .7 * settle})`; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(jhb[0], jhb[1], 4 + pr * 26, 0, 6.283); ctx.stroke();
        ctx.fillStyle = `rgba(200,162,124,${settle})`; ctx.beginPath(); ctx.arc(jhb[0], jhb[1], 4.5, 0, 6.283); ctx.fill();
        if (wide && opts.labels !== "off") {
          ctx.font = `500 11px "JetBrains Mono", monospace`; ctx.fillStyle = `rgba(242,240,236,${.7 * settle})`;
          ctx.fillText("JHB · 26.20°S 28.04°E", jhb[0] + 14, jhb[1] + 4);
        }
      }
    };
  };

  /* static dotted Africa (tile) */
  VIZ.map = (c, ctx, w, h) => {
    const mapH = h * .9, mapW = mapH * (70 / 73), ox = w - mapW - w * .04, oy = h * .05;
    const pts = africaDots(mapH > 300 ? 1.25 : 1.7);
    const dr = Math.max(1, mapH / 300);
    return (now) => {
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        const x = ox + ((p.lon + 18) / 70) * mapW, y = oy + ((37.5 - p.lat) / 73) * mapH;
        const fade = Math.min(1, (x - ox) / (mapW * .55) + .25);
        ctx.fillStyle = p.sa ? `rgba(168,126,85,${.9})` : `rgba(10,10,11,${.32 * fade})`;
        ctx.beginPath(); ctx.arc(x, y, dr, 0, 6.283); ctx.fill();
      }
      const j = [ox + ((28.04 + 18) / 70) * mapW, oy + ((37.5 + 26.2) / 73) * mapH], pr = (t * .5) % 1;
      ctx.strokeStyle = `rgba(168,126,85,${1 - pr})`; ctx.beginPath(); ctx.arc(j[0], j[1], 3 + pr * 18, 0, 6.283); ctx.stroke();
    };
  };

  /* rotating fibonacci sphere */
  VIZ.sphere = (c, ctx, w, h, o) => {
    const N = Number(o.n) || 700, pts = [], col = o.color || "242,240,236";
    for (let i = 0; i < N; i++) { const y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - y * y), th = i * 2.39996; pts.push([Math.cos(th) * rad, y, Math.sin(th) * rad]); }
    const R = Math.min(w, h) * (Number(o.scale) || .36), cx = w * (Number(o.x) || .5), cy = h * (Number(o.y) || .5);
    return (now) => {
      const a = now / 9000, b = .35;
      ctx.clearRect(0, 0, w, h);
      for (const [x, y, z] of pts) {
        const x1 = x * Math.cos(a) - z * Math.sin(a), z1 = x * Math.sin(a) + z * Math.cos(a);
        const y2 = y * Math.cos(b) - z1 * Math.sin(b), z2 = y * Math.sin(b) + z1 * Math.cos(b);
        const d = (z2 + 1.4) / 2.4;
        ctx.fillStyle = `rgba(${col},${.12 + .7 * d * d})`;
        ctx.beginPath(); ctx.arc(cx + x1 * R, cy + y2 * R, .6 + 1.3 * d, 0, 6.283); ctx.fill();
      }
    };
  };

  /* concentric dotted orbit */
  VIZ.orbit = (c, ctx, w, h, o) => {
    const col = o.color || "255,255,255", rings = [.22, .31, .4], R = Math.min(w, h);
    const r = rng(3), sat = Array.from({ length: 3 }, (_, i) => ({ ring: rings[i], a: r() * 6.28, s: (r() * .2 + .08) * (i % 2 ? -1 : 1) }));
    return (now) => {
      const t = now / 1000; ctx.clearRect(0, 0, w, h);
      rings.forEach((rr, i) => {
        const n = Math.round(28 + i * 10);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * 6.283 + t * (i % 2 ? -.04 : .05), wob = Math.sin(k * 3.1 + t) * 2;
          const x = w / 2 + Math.cos(a) * (R * rr + wob), y = h / 2 + Math.sin(a) * (R * rr + wob);
          ctx.fillStyle = `rgba(${col},${.35 + .45 * ((k + i) % 3 === 0)})`; ctx.beginPath(); ctx.arc(x, y, i === 1 ? 2.1 : 1.5, 0, 6.283); ctx.fill();
        }
      });
      sat.forEach((s) => {
        const a = s.a + t * s.s, x = w / 2 + Math.cos(a) * R * s.ring, y = h / 2 + Math.sin(a) * R * s.ring;
        ctx.strokeStyle = `rgba(${col},.7)`; ctx.fillStyle = `rgba(${col},.18)`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, 13, 0, 6.283); ctx.fill(); ctx.stroke();
        ctx.fillStyle = `rgba(${col},.95)`; ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.283); ctx.fill();
      });
    };
  };

  /* light rays from a vanishing point */
  VIZ.rays = (c, ctx, w, h, o) => {
    const r = rng(11), col = o.color || "255,255,255", vx = w * (Number(o.x) || .78), vy = h * (Number(o.y) || .3);
    const rays = Array.from({ length: 140 }, () => ({ a: r() * 6.283, d: r(), l: r() * .12 + .04, s: r() * .08 + .03 }));
    return (now) => {
      const t = now / 1000; ctx.clearRect(0, 0, w, h); ctx.lineCap = "round";
      const g = ctx.createRadialGradient(vx, vy, 0, vx, vy, Math.max(w, h) * .6); g.addColorStop(0, `rgba(${col},.55)`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const M = Math.hypot(w, h);
      for (const ray of rays) {
        const p = (ray.d + t * ray.s) % 1, r0 = p * M * .9, r1 = r0 + ray.l * M;
        ctx.strokeStyle = `rgba(${col},${.55 * Math.sin(p * Math.PI)})`; ctx.lineWidth = 1 + p * 2;
        ctx.beginPath(); ctx.moveTo(vx + Math.cos(ray.a) * r0, vy + Math.sin(ray.a) * r0); ctx.lineTo(vx + Math.cos(ray.a) * r1, vy + Math.sin(ray.a) * r1); ctx.stroke();
      }
    };
  };

  /* ribbed flowing surface */
  VIZ.ribs = (c, ctx, w, h, o) => {
    const col = o.color || "255,255,255", n = Number(o.n) || 46;
    return (now) => {
      const t = now / 1000; ctx.clearRect(0, 0, w, h); ctx.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        const k = i / n; ctx.strokeStyle = `rgba(${col},${.08 + .28 * Math.sin(k * Math.PI)})`;
        ctx.beginPath();
        for (let x = -20; x <= w + 20; x += 12) {
          const y = h * (.15 + k * .95) + Math.sin(x / w * 3.2 + t * .35 + k * 2.4) * h * .12 * (1 - k * .4) - (x / w) * h * .35 * (1 - k);
          x === -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      const r = rng(5); ctx.fillStyle = `rgba(${col},.55)`;
      for (let i = 0; i < 18; i++) { const x = r() * w, y = (r() * h + t * (6 + r() * 10)) % h; ctx.beginPath(); ctx.arc(x, y, r() * 3 + 1, 0, 6.283); ctx.fill(); }
    };
  };

  /* dotted terrain wave */
  VIZ.wave = (c, ctx, w, h, o) => {
    const col = o.color || "10,10,11", cols = Math.round(w / 14), rows = 22;
    return (now) => {
      const t = now / 1000; ctx.clearRect(0, 0, w, h);
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const z = j / rows, x = (i / cols) * w, base = h * .35 + z * h * .7;
        const y = base - (Math.sin(i * .22 + t * .9 + j * .35) + Math.cos(i * .09 - t * .5)) * 14 * (z + .3);
        ctx.fillStyle = `rgba(${col},${.08 + z * .5})`; ctx.beginPath(); ctx.arc(x, y, .6 + z * 1.4, 0, 6.283); ctx.fill();
      }
    };
  };

  /* agent network: nodes connected, packets flowing */
  VIZ.network = (c, ctx, w, h, o) => {
    const r = rng(Number(o.seed) || 21), col = o.color || "242,240,236", acc = o.accent || "200,162,124";
    const nodes = Array.from({ length: 26 }, () => ({ x: r() * w, y: r() * h, vx: (r() - .5) * .18, vy: (r() - .5) * .18, hub: r() > .82 }));
    return (now) => {
      const t = now / 1000; ctx.clearRect(0, 0, w, h);
      for (const n of nodes) { n.x += n.vx; n.y += n.vy; if (n.x < 0 || n.x > w) n.vx *= -1; if (n.y < 0 || n.y > h) n.vy *= -1; }
      const lim = Math.min(w, h) * .38;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < lim) {
          ctx.strokeStyle = `rgba(${col},${(1 - d / lim) * .3})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          if ((a.hub || b.hub) && (i + j) % 3 === 0) { const u = (t * .3 + i * .13) % 1; ctx.fillStyle = `rgba(${acc},.95)`; ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, 1.8, 0, 6.283); ctx.fill(); }
        }
      }
      for (const n of nodes) { ctx.fillStyle = n.hub ? `rgba(${acc},1)` : `rgba(${col},.8)`; ctx.beginPath(); ctx.arc(n.x, n.y, n.hub ? 4 : 2, 0, 6.283); ctx.fill(); }
    };
  };

  /* data streams falling (payments / ledgers) */
  VIZ.streams = (c, ctx, w, h, o) => {
    const r = rng(9), col = o.color || "242,240,236", acc = o.accent || "200,162,124";
    const lanes = Array.from({ length: Math.round(w / 18) }, (_, i) => ({ x: i * 18 + 9, s: r() * 40 + 20, o: r() * h, n: Math.floor(r() * 6) + 3 }));
    return (now) => {
      const t = now / 1000; ctx.clearRect(0, 0, w, h);
      for (const l of lanes) for (let k = 0; k < l.n; k++) {
        const y = (l.o + t * l.s + k * 14) % (h + 60) - 30, hot = k === l.n - 1;
        ctx.fillStyle = hot ? `rgba(${acc},.95)` : `rgba(${col},${.08 + k / l.n * .4})`;
        ctx.fillRect(l.x - 1, y, 2, hot ? 6 : 3);
      }
    };
  };

  /* outcomes chart */
  VIZ.chart = (c, ctx, w, h, o) => {
    const col = o.color || "10,10,11";
    const pts = [[.1, .78], [.28, .7], [.44, .74], [.58, .52], [.72, .46], [.86, .24]];
    return (now) => {
      const t = Math.min(1, (now % 9000) / 2600); ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = `rgba(${col},.12)`; ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(w * .08, h * i * .18); ctx.lineTo(w * .92, h * i * .18); ctx.stroke(); }
      ctx.strokeStyle = `rgba(${col},.85)`; ctx.lineWidth = 1.5; ctx.beginPath();
      const upto = 1 + t * (pts.length - 1);
      for (let i = 0; i < Math.floor(upto); i++) { const [x, y] = pts[i]; i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h); }
      const f = upto % 1, i0 = Math.floor(upto) - 1;
      if (i0 < pts.length - 1) { const [x0, y0] = pts[i0], [x1, y1] = pts[i0 + 1]; ctx.lineTo((x0 + (x1 - x0) * f) * w, (y0 + (y1 - y0) * f) * h); }
      ctx.stroke();
      pts.slice(0, Math.floor(upto)).forEach(([x, y], i) => { ctx.fillStyle = i === pts.length - 1 ? "#A87E55" : `rgba(${col},1)`; ctx.beginPath(); ctx.arc(x * w, y * h, i === pts.length - 1 ? 5 : 3, 0, 6.283); ctx.fill(); });
    };
  };

  /* drifting constellation (generic hero ground) */
  VIZ.field = (c, ctx, w, h, o) => {
    const r = rng(Number(o.seed) || 4), col = o.color || "242,240,236";
    const dots = Array.from({ length: Math.round((w * h) / 5200) }, () => ({ x: r() * w, y: r() * h, s: r() * 1.8 + .3, v: r() * .25 + .05, p: r() * 6.28 }));
    const cluster = Array.from({ length: 70 }, () => { const a = r() * 6.28, d = Math.sqrt(r()); return { a, d, s: r() * 2.6 + .8 }; });
    return (now) => {
      const t = now / 1000; ctx.clearRect(0, 0, w, h);
      for (const d of dots) { const y = (d.y - t * d.v * 8 + h) % h; ctx.fillStyle = `rgba(${col},${.08 + .2 * (1 + Math.sin(t + d.p)) / 2})`; ctx.beginPath(); ctx.arc(d.x, y, d.s * .6, 0, 6.283); ctx.fill(); }
      const cx = w * (Number(o.x) || .5), cy = h * (Number(o.y) || 1.02), R = Math.min(w * .32, 360);
      for (const p of cluster) { const a = p.a + t * .03; ctx.fillStyle = `rgba(${col},${.25 + .5 * (1 - p.d)})`; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * p.d * 1.3, cy + Math.sin(a) * R * p.d * .7 - R * .3, p.s, 0, 6.283); ctx.fill(); }
    };
  };

  /* runtime: size, observe, animate only what's visible */
  const Viz = {
    items: new Map(),
    init(c) {
      if (this.items.has(c)) { this.size(c); return; }
      const ctx = c.getContext("2d"); if (!ctx) return;
      const item = { c, ctx, draw: null, visible: false, w: 0, h: 0 };
      this.items.set(c, item); this.size(c);
      this.ro.observe(c); this.vo.observe(c);
    },
    size(c) {
      const item = this.items.get(c); if (!item) return;
      const b = c.getBoundingClientRect(); if (!b.width || !b.height) return;
      if (Math.abs(b.width - item.w) < 2 && Math.abs(b.height - item.h) < 2 && item.draw) return;
      item.w = b.width; item.h = b.height;
      c.width = Math.round(b.width * DPR); c.height = Math.round(b.height * DPR);
      item.ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const fn = VIZ[c.dataset.viz]; if (!fn) return;
      item.draw = fn(c, item.ctx, b.width, b.height, { ...c.dataset });
      item.draw(reduce ? 12000 : performance.now());
    },
    scan(root = document) { $$("canvas[data-viz]", root).forEach((c) => this.init(c)); },
    loop(now) {
      if (!reduce) Viz.items.forEach((it) => it.visible && it.draw && it.draw(now));
      requestAnimationFrame(Viz.loop);
    },
  };
  Viz.ro = new ResizeObserver((es) => es.forEach((e) => Viz.size(e.target)));
  Viz.vo = new IntersectionObserver((es) => es.forEach((e) => { const it = Viz.items.get(e.target); if (it) { it.visible = e.isIntersecting; if (e.isIntersecting) Viz.size(e.target); } }), { rootMargin: "120px" });
  Viz.scan();
  requestAnimationFrame(Viz.loop);
  document.fonts && document.fonts.ready.then(() => Viz.items.forEach((_, c) => Viz.size(c)));
})();

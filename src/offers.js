// ─────────────────────────────────────────────────────────────────────────
// NGOMSO INTELLIGENCE PRICE BOOK — the single source of truth.
// The website, the checkout API, the investor pack and the funding documents
// all use these numbers. Change a price here and nowhere else.
// Amounts in ZAR cents. USD shown at the planning rate below.
// ─────────────────────────────────────────────────────────────────────────
export const FX_ZAR_PER_USD = 17.5;

export const PRICE_BOOK = {
  product: "Agentic Commerce OS",
  strategySession: 250000, //   R2,500  ≈ $143
  audit: 1250000, //            R12,500 ≈ $714
  setup: 2500000, //            R25,000 ≈ $1,429 once-off per store
  tiers: [
    { id: "launch", name: "Launch", monthly: 250000, fit: "One store, up to 500 products" }, //   R2,500/mo ≈ $143
    { id: "growth", name: "Growth", monthly: 550000, fit: "Up to 5,000 products, priority support" }, // R5,500/mo ≈ $314
    { id: "scale", name: "Scale", monthly: 1250000, fit: "Unlimited products, multiple stores, SLA" }, // R12,500/mo ≈ $714
  ],
  blendedMonthly: 525000, //    R5,250/mo ≈ $300 — planning average across tiers
  settlementFee: 0.0075, //     0.75% of agent-originated sales settled through us
  sprint: 4500000, //           R45,000 ≈ $2,571 — two-week custom Infrastructure Sprint
  sprintDeposit: 2250000, //    R22,500 — 50% deposit paid online
};

// Paid engagements sold online through Paystack (Engage page + /api/checkout).
export const OFFERS = [
  {
    id: "strategy-session",
    name: "Strategy Session",
    tagline: "60 minutes with a senior data & AI engineer",
    amount_cents: PRICE_BOOK.strategySession,
    bullets: [
      "Pressure-test an idea, architecture or vendor choice",
      "Written summary and next steps within 24 hours",
      "Credited against any project booked within 30 days",
    ],
  },
  {
    id: "agent-readiness-audit",
    name: "Agent-Readiness Audit",
    tagline: "Make your store visible to AI shopping agents",
    amount_cents: PRICE_BOOK.audit,
    featured: true,
    bullets: [
      "Product-data and structured-data audit of your store",
      "Scored gap report against current agent commerce protocols",
      "Prioritised fix list with effort and cost, credited against Setup",
    ],
  },
  {
    id: "infrastructure-sprint",
    name: "Infrastructure Sprint — 50% deposit",
    tagline: "Two weeks from problem to costed blueprint (R45,000 total)",
    amount_cents: PRICE_BOOK.sprintDeposit,
    bullets: [
      "Discovery workshops with your team",
      "Target architecture, build plan and fixed quote",
      "Working proof-of-concept on one critical path",
    ],
  },
];

export const findOffer = (id) => OFFERS.find((o) => o.id === id);

export const formatZAR = (cents) =>
  "R" + Math.round(cents / 100).toLocaleString("en-US");

export const formatUSD = (cents) => "$" + Math.round(cents / 100 / FX_ZAR_PER_USD).toLocaleString("en-US");

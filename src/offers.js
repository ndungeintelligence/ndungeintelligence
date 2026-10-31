// Paid engagements sold online through Paystack.
// Prices are in cents (ZAR). Edit here — the Engage page and the API both read this file.
export const OFFERS = [
  {
    id: "advisory-hour",
    name: "Advisory Session",
    tagline: "60 minutes with a senior data & AI engineer",
    amount_cents: 150000, // R1,500
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
    amount_cents: 750000, // R7,500
    featured: true,
    bullets: [
      "Product-data and structured-data audit of your store",
      "Gap report against current agent commerce protocols",
      "Prioritised fix list with effort and cost estimates",
    ],
  },
  {
    id: "infrastructure-sprint",
    name: "Infrastructure Sprint — Deposit",
    tagline: "Two weeks from problem to costed blueprint",
    amount_cents: 1500000, // R15,000
    bullets: [
      "Discovery workshops with your team",
      "Target architecture, build plan and fixed quote",
      "Working proof-of-concept on one critical path",
    ],
  },
];

export const findOffer = (id) => OFFERS.find((o) => o.id === id);

export const formatZAR = (cents) =>
  "R" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/ /g, " ");

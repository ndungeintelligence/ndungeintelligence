// Paystack: initialize, verify and webhook signature check.
// Secret: PAYSTACK_SECRET_KEY (sk_test_… in dev/test, sk_live_… in prod).

const API = "https://api.paystack.co";

export function paystackConfigured(env) {
  return Boolean(env.PAYSTACK_SECRET_KEY);
}

async function call(env, path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === false) {
    throw new Error(`Paystack ${path} failed (${res.status}): ${data.message || "unknown error"}`);
  }
  return data.data;
}

export function initializeTransaction(env, { email, amount_cents, reference, callback_url, metadata }) {
  return call(env, "/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({ email, amount: amount_cents, currency: "ZAR", reference, callback_url, metadata }),
  });
}

export function verifyTransaction(env, reference) {
  return call(env, `/transaction/verify/${encodeURIComponent(reference)}`);
}

export async function validSignature(env, rawBody, signature) {
  if (!signature || !env.PAYSTACK_SECRET_KEY) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.PAYSTACK_SECRET_KEY),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

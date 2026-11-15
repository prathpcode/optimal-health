/**
 * Whop webhooks follow the Standard Webhooks spec: HMAC-SHA256 over `${id}.${timestamp}.${rawBody}`, keyed with the
 * secret, sent as `webhook-signature: v1,<base64>` (several space-separated signatures during secret rotation).
 * Pure and Web Crypto only, so it runs in the Convex runtime and in tests.
 */

const TOLERANCE_S = 5 * 60;

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** The signing key. Whop secrets start `ws_`; Standard Webhooks secrets `whsec_` carry base64 key bytes. */
function secretKey(secret: string): Uint8Array<ArrayBuffer> {
  if (secret.startsWith("whsec_")) return base64ToBytes(secret.slice(6));
  return new TextEncoder().encode(secret);
}

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sign(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", secretKey(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  return bytesToBase64(new Uint8Array(mac));
}

export type WebhookHeaders = { id: string | null; timestamp: string | null; signature: string | null };

/** True only for a correctly signed, fresh delivery. Verify against the raw body, before parsing it. */
export async function verifyWebhook(
  secret: string,
  headers: WebhookHeaders,
  body: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > TOLERANCE_S) return false;
  const expected = await sign(secret, id, timestamp, body);
  return signature
    .split(" ")
    .map((s) => s.split(","))
    .some(([version, sig]) => version === "v1" && !!sig && equal(sig, expected));
}

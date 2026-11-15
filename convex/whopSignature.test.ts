import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhook } from "./whopSignature";

const SECRET = "ws_test_secret";
const ID = "msg_2abc";
const NOW = 1_794_000_000_000;
const TS = String(NOW / 1000);
const BODY = '{"type":"payment.succeeded","data":{"id":"pay_1"}}';
// Signed independently with Node's crypto, so the test does not trust the code under test.
const SIG = createHmac("sha256", SECRET).update(`${ID}.${TS}.${BODY}`).digest("base64");

describe("verifyWebhook", () => {
  it("accepts a correctly signed, fresh delivery", async () => {
    expect(await verifyWebhook(SECRET, { id: ID, timestamp: TS, signature: `v1,${SIG}` }, BODY, NOW)).toBe(true);
  });
  it("accepts any one of several signatures (secret rotation)", async () => {
    expect(await verifyWebhook(SECRET, { id: ID, timestamp: TS, signature: `v1,bm9wZQ== v1,${SIG}` }, BODY, NOW)).toBe(true);
  });
  it("rejects a changed body, a wrong secret, or a wrong id", async () => {
    const h = { id: ID, timestamp: TS, signature: `v1,${SIG}` };
    expect(await verifyWebhook(SECRET, h, BODY.replace("pay_1", "pay_2"), NOW)).toBe(false);
    expect(await verifyWebhook("ws_other", h, BODY, NOW)).toBe(false);
    expect(await verifyWebhook(SECRET, { ...h, id: "msg_other" }, BODY, NOW)).toBe(false);
  });
  it("rejects a delivery more than five minutes old or ahead", async () => {
    const h = { id: ID, timestamp: TS, signature: `v1,${SIG}` };
    expect(await verifyWebhook(SECRET, h, BODY, NOW + 6 * 60_000)).toBe(false);
    expect(await verifyWebhook(SECRET, h, BODY, NOW - 6 * 60_000)).toBe(false);
  });
  it("rejects missing headers and other signature versions", async () => {
    expect(await verifyWebhook(SECRET, { id: ID, timestamp: TS, signature: null }, BODY, NOW)).toBe(false);
    expect(await verifyWebhook(SECRET, { id: ID, timestamp: TS, signature: `v2,${SIG}` }, BODY, NOW)).toBe(false);
    expect(await verifyWebhook("", { id: ID, timestamp: TS, signature: `v1,${SIG}` }, BODY, NOW)).toBe(false);
  });
});

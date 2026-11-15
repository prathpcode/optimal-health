import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { verifyWebhook } from "./whopSignature";

const http = httpRouter();

/**
 * Where Whop sends people after the free "Fit communities" join (Whop only accepts https return addresses).
 * It hands them straight back to the app, which then sees their access and opens their rooms.
 */
http.route({
  path: "/whop/joined",
  method: "GET",
  handler: httpAction(async () => new Response(null, { status: 302, headers: { Location: "fitscanner://joined" } })),
});

/**
 * Where Whop sends people after paying a race entry. Back to the app; the entry itself is confirmed by the webhook
 * below, never by this redirect.
 */
http.route({
  path: "/whop/paid",
  method: "GET",
  handler: httpAction(async () => new Response(null, { status: 302, headers: { Location: "secondlook://paid" } })),
});

/**
 * Whop's webhook (payment.succeeded). The signature is checked against the raw body; the payment is then read back
 * from Whop's API by id, so nothing in the delivery itself is trusted beyond "look at this payment".
 */
http.route({
  path: "/whop/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const raw = await req.text();
    const ok = await verifyWebhook(
      process.env.WHOP_WEBHOOK_SECRET ?? "",
      { id: req.headers.get("webhook-id"), timestamp: req.headers.get("webhook-timestamp"), signature: req.headers.get("webhook-signature") },
      raw,
    );
    if (!ok) return new Response("bad signature", { status: 401 });
    let event: unknown;
    try {
      event = JSON.parse(raw);
    } catch {
      return new Response("bad body", { status: 400 });
    }
    const e = event as { type?: unknown; data?: { id?: unknown } } | null;
    if (!e || typeof e.type !== "string") return new Response("bad body", { status: 400 });
    const paymentId = e.data && typeof e.data.id === "string" ? e.data.id : null;
    if (e.type === "payment.succeeded" && paymentId?.startsWith("pay_")) {
      await ctx.scheduler.runAfter(0, internal.pay.confirmPayment, { paymentId, attempt: 0 });
    }
    return new Response(null, { status: 200 });
  }),
});

export default http;

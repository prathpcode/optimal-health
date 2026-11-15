import { v } from "convex/values";
import { centsFromAmount, settlePot } from "../engine/challenge";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { requireMember } from "./members";
import { DAY, entriesOf, feeBps, moneyLive, scorePlayers } from "./together";

/**
 * Money races: every player pays the same entry through Whop checkout and the winner takes the pool.
 *
 * - Paying: `checkout` makes a one-time Whop checkout for the entry and returns its link. The entry stays "pending"
 *   until Whop's webhook (convex/http.ts) says the payment succeeded; we then read the payment back from Whop's API
 *   and only that makes the entry "paid". The redirect back to the app proves nothing and is not used.
 * - The pool is what actually reached us for each entry (after Whop's fee), in integer cents.
 * - Settling: scheduled when the race is created (together.createChallenge), for an hour after it ends. engine/challenge.ts (settlePot) decides
 *   who gets what; this file only moves the money: a Whop transfer to each winner, or a refund of each entry
 *   payment when there was no race. Every payout has a unique key and is sent with that key as Whop's idempotency
 *   key, so a retry can never pay twice.
 *
 * Whop receives the entry price, our challenge and member ids, and the winner's Whop user id. Nothing from a profile.
 *
 * Deployment settings (`npx convex env set ...`): MONEY_CHALLENGES=on, WHOP_API_KEY, WHOP_ACCOUNT_ID (biz_...),
 * WHOP_WEBHOOK_SECRET, and optionally WHOP_PRODUCT_ID, CHALLENGE_FEE_BPS, WHOP_API_BASE (the sandbox).
 */

/** Waits between tries when Whop cannot be reached or refuses, in minutes. After the last one the payout stays "failed". */
const RETRY_MINUTES = [1, 10, 60, 6 * 60, 24 * 60];

type Money = { amount?: unknown; currency?: unknown } | null | undefined;

export async function whop<T>(path: string, init?: { method?: string; body?: unknown; idempotencyKey?: string }): Promise<T> {
  const key = process.env.WHOP_API_KEY;
  if (!key) throw new Error("WHOP_API_KEY is not set on the deployment");
  const base = process.env.WHOP_API_BASE ?? "https://api.whop.com/api/v1";
  const res = await fetch(`${base}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) throw new Error(`Whop ${res.status}: ${body.error?.message ?? "request failed"}`);
  return body as T;
}

export function accountId(): string {
  const id = process.env.WHOP_ACCOUNT_ID;
  if (!id) throw new Error("WHOP_ACCOUNT_ID is not set on the deployment");
  return id;
}

// ── Paying an entry ───────────────────────────────────────────────────────────────────────────────────────────────

/** Start paying the entry of a money race. Returns the Whop checkout link to open. */
export const checkout = action({
  args: { session: v.string(), id: v.id("challenges") },
  handler: async (ctx, { session, id }): Promise<{ url: string }> => {
    if (!moneyLive()) throw new Error("Money races are not switched on yet");
    const entry: { memberId: Id<"members">; entryCents: number; days: number } = await ctx.runMutation(internal.pay.beginEntry, { session, id });
    const productId = process.env.WHOP_PRODUCT_ID;
    const made = await whop<{ purchase_url?: string }>("/checkout_configurations", {
      method: "POST",
      body: {
        account_id: accountId(),
        mode: "payment",
        redirect_url: `${process.env.CONVEX_SITE_URL}/whop/paid`,
        metadata: { kind: "race_entry", challengeId: id, memberId: entry.memberId },
        variant: {
          ...(productId ? { product_id: productId } : {}),
          title: `${entry.days}-day race entry`,
          billing_type: "one_time",
          // Whop takes prices in dollars; ours are whole-dollar cents, so this is exact.
          initial_price: entry.entryCents / 100,
          currency: "usd",
          release_method: "buy_now",
          visibility: "hidden",
          unlimited_stock: true,
        },
      },
    });
    if (!made.purchase_url) throw new Error("Whop did not return a checkout link");
    return { url: made.purchase_url };
  },
});

/** Check the race can still be entered and hold a pending entry for this member. */
export const beginEntry = internalMutation({
  args: { session: v.string(), id: v.id("challenges") },
  handler: async (ctx, { session, id }) => {
    const me = await requireMember(ctx, session);
    const ch = await ctx.db.get("challenges", id);
    if (!ch) throw new Error("Challenge not found");
    if (ch.entryCents <= 0) throw new Error("This race is free to join");
    if (ch.settledAt || Date.now() >= ch.startsAt) throw new Error("Entries closed when this race started");
    if (ch.playerCount >= 50) throw new Error("This race is full");
    const has = await ctx.db.query("entries").withIndex("by_challengeId_and_memberId", (q) => q.eq("challengeId", id).eq("memberId", me._id)).unique();
    if (has?.status === "paid") throw new Error("You have already paid for this race");
    if (!has) await ctx.db.insert("entries", { challengeId: id, memberId: me._id, joinedAt: Date.now(), status: "pending" });
    return { memberId: me._id, entryCents: ch.entryCents, days: ch.days };
  },
});

/** After the webhook: read the payment from Whop and, if it is a paid race entry or rule pack, record it. */
export const confirmPayment = internalAction({
  args: { paymentId: v.string(), attempt: v.number() },
  handler: async (ctx, { paymentId, attempt }) => {
    let p: { status?: string; currency?: string; total?: Money; amount_after_fees?: Money; variant_id?: string | null; metadata?: Record<string, unknown> | null };
    try {
      p = await whop(`/payments/${encodeURIComponent(paymentId)}`);
    } catch (e) {
      const wait = RETRY_MINUTES[attempt];
      if (wait === undefined) throw e;
      await ctx.scheduler.runAfter(wait * 60_000, internal.pay.confirmPayment, { paymentId, attempt: attempt + 1 });
      return null;
    }
    const meta = p.metadata ?? {};
    // A rule pack bought on Manage (convex/packs.ts) arrives through the same webhook.
    if (meta.kind === "rule_pack" && typeof meta.purchaseId === "string") {
      if (p.status === "paid") await ctx.runMutation(internal.packs.recordPayment, { paymentId, purchaseId: meta.purchaseId, variantId: p.variant_id ?? undefined });
      return null;
    }
    if (meta.kind !== "race_entry" || typeof meta.challengeId !== "string" || typeof meta.memberId !== "string") return null;
    if (p.status !== "paid") return null;
    const grossCents = p.currency === "usd" ? centsFromAmount(p.total?.amount) : null;
    if (grossCents === null) {
      console.error(`Race entry payment ${paymentId} has no readable USD total; it needs a manual look`);
      return null;
    }
    // What reached us after Whop's fee. Never more than was paid; if Whop does not say, the full amount.
    const netCents = Math.min(grossCents, centsFromAmount(p.amount_after_fees?.amount) ?? grossCents);
    await ctx.runMutation(internal.pay.recordPayment, { paymentId, challengeId: meta.challengeId, memberId: meta.memberId, grossCents, netCents });
    return null;
  },
});

/**
 * A confirmed payment puts its member in the race. Safe to run twice for the same payment. A payment that can no
 * longer buy a place (race started, full, already paid, or short of the entry) is refunded instead.
 */
export const recordPayment = internalMutation({
  args: { paymentId: v.string(), challengeId: v.string(), memberId: v.string(), grossCents: v.number(), netCents: v.number() },
  handler: async (ctx, args) => {
    const challengeId = ctx.db.normalizeId("challenges", args.challengeId);
    const memberId = ctx.db.normalizeId("members", args.memberId);
    const ch = challengeId ? await ctx.db.get("challenges", challengeId) : null;
    const member = memberId ? await ctx.db.get("members", memberId) : null;
    if (!challengeId || !memberId || !ch || !member) {
      console.error(`Race entry payment ${args.paymentId} names a challenge or member that does not exist; it needs a manual refund`);
      return null;
    }
    if (await ctx.db.query("payouts").withIndex("by_key", (q) => q.eq("key", `refund:${args.paymentId}`)).unique()) return null;
    const entry = await ctx.db.query("entries").withIndex("by_challengeId_and_memberId", (q) => q.eq("challengeId", challengeId).eq("memberId", memberId)).unique();
    if (entry?.status === "paid" && entry.paymentId === args.paymentId) return null;

    const open = !ch.settledAt && Date.now() < ch.startsAt && ch.playerCount < 50;
    if (!open || entry?.status === "paid" || args.grossCents < ch.entryCents) {
      await queueRefund(ctx, { challengeId, memberId, paymentId: args.paymentId, cents: args.grossCents });
      return null;
    }
    const paid = { status: "paid" as const, paymentId: args.paymentId, grossCents: args.grossCents, netCents: args.netCents };
    if (entry) await ctx.db.patch("entries", entry._id, paid);
    else await ctx.db.insert("entries", { challengeId, memberId, joinedAt: Date.now(), ...paid });
    await ctx.db.patch("challenges", challengeId, { playerCount: ch.playerCount + 1 });
    return null;
  },
});

// ── Paying out ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Owe a player their entry payment back, once per payment, and start sending it. */
export async function queueRefund(ctx: MutationCtx, r: { challengeId: Id<"challenges">; memberId: Id<"members">; paymentId: string; cents: number }) {
  const key = `refund:${r.paymentId}`;
  if (await ctx.db.query("payouts").withIndex("by_key", (q) => q.eq("key", key)).unique()) return;
  const payoutId = await ctx.db.insert("payouts", { key, ...r, kind: "refund", status: "pending", attempts: 0, at: Date.now() });
  await ctx.scheduler.runAfter(0, internal.pay.send, { payoutId });
}

export const refundEntry = internalMutation({
  args: { challengeId: v.id("challenges"), memberId: v.id("members"), paymentId: v.string(), cents: v.number() },
  handler: async (ctx, args) => {
    await queueRefund(ctx, args);
    return null;
  },
});

/** End of a money race: decide the pool (engine/challenge.ts) and queue every prize or refund. Runs once. */
export const settle = internalMutation({
  args: { id: v.id("challenges") },
  handler: async (ctx, { id }) => {
    const ch = await ctx.db.get("challenges", id);
    if (!ch || ch.entryCents <= 0 || ch.settledAt) return null;
    const now = Date.now();
    // Scheduled for after the end; if the clock says otherwise (a rescheduled run), wait for the real end.
    if (now < ch.startsAt + ch.days * DAY) return null;

    const paid = (await entriesOf(ctx, ch)).filter((e) => e.status === "paid");
    const net = new Map(paid.map((e) => [e.memberId as string, e.netCents ?? 0]));
    const players = await scorePlayers(ctx, ch, paid);
    const result = settlePot({
      entries: players.map((p) => ({ id: p.memberId, netCents: net.get(p.memberId) ?? 0, points: p.points, meals: p.meals, joinedAt: p.joinedAt })),
      feeBps: feeBps(),
    });
    await ctx.db.patch("challenges", id, {
      settledAt: now,
      settlement: { refundAll: result.refundAll, potCents: result.potCents, feeCents: result.feeCents, prizeCents: result.prizeCents },
    });

    if (result.refundAll) {
      // No race: each entry payment goes back in full, the same way a refund before the start does.
      for (const e of paid) {
        if (e.paymentId) await queueRefund(ctx, { challengeId: id, memberId: e.memberId, paymentId: e.paymentId, cents: e.grossCents ?? ch.entryCents });
      }
      return null;
    }
    for (const p of players) {
      const cents = result.payouts[p.memberId] ?? 0;
      if (cents <= 0) continue;
      const key = `prize:${id}:${p.memberId}`;
      if (await ctx.db.query("payouts").withIndex("by_key", (q) => q.eq("key", key)).unique()) continue;
      const payoutId = await ctx.db.insert("payouts", { key, challengeId: id, memberId: p.memberId, kind: "prize", cents, status: "pending", attempts: 0, at: now });
      await ctx.scheduler.runAfter(0, internal.pay.send, { payoutId });
    }
    return null;
  },
});

export const payoutToSend = internalQuery({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, { payoutId }): Promise<{ payout: Doc<"payouts">; whopUserId: string | null } | null> => {
    const payout = await ctx.db.get("payouts", payoutId);
    if (!payout) return null;
    const member = await ctx.db.get("members", payout.memberId);
    return { payout, whopUserId: member?.whopUserId ?? null };
  },
});

/** Send one payout through Whop: a transfer for a prize, a payment refund for a refund. Retries on failure. */
export const send = internalAction({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, { payoutId }) => {
    const found: { payout: Doc<"payouts">; whopUserId: string | null } | null = await ctx.runQuery(internal.pay.payoutToSend, { payoutId });
    if (!found || found.payout.status === "sent") return null;
    const { payout, whopUserId } = found;
    try {
      let whopId: string | undefined;
      if (payout.kind === "refund") {
        if (!payout.paymentId) throw new Error("Refund has no payment");
        // No amount: Whop refunds everything still refundable on the payment.
        whopId = (await whop<{ id?: string }>(`/payments/${encodeURIComponent(payout.paymentId)}/refund`, { method: "POST", body: {}, idempotencyKey: payout.key })).id;
      } else {
        if (!whopUserId) throw new Error("Winner has no Whop account on record");
        const t = await whop<{ id?: string; status?: string; failure_reason?: string | null }>("/transfers", {
          method: "POST",
          idempotencyKey: payout.key,
          body: {
            type: "balance",
            origin_id: accountId(),
            destination_id: whopUserId,
            // Whop takes dollars; cents / 100 has at most two decimals.
            amount: payout.cents / 100,
            currency: "usd",
            idempotence_key: payout.key,
            notes: "Race prize",
          },
        });
        if (t.status === "failed") throw new Error(`Whop transfer failed: ${t.failure_reason ?? "no reason given"}`);
        whopId = t.id;
      }
      await ctx.runMutation(internal.pay.markPayout, { payoutId, ok: true, whopId });
    } catch (e) {
      const error = (e instanceof Error ? e.message : "Unknown error").slice(0, 300);
      await ctx.runMutation(internal.pay.markPayout, { payoutId, ok: false, error });
      const wait = RETRY_MINUTES[payout.attempts];
      if (wait !== undefined) await ctx.scheduler.runAfter(wait * 60_000, internal.pay.send, { payoutId });
      else console.error(`Payout ${payout.key} gave up after ${payout.attempts + 1} tries: ${error}`);
    }
    return null;
  },
});

export const markPayout = internalMutation({
  args: { payoutId: v.id("payouts"), ok: v.boolean(), whopId: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, { payoutId, ok, whopId, error }) => {
    const p = await ctx.db.get("payouts", payoutId);
    if (!p || p.status === "sent") return null;
    await ctx.db.patch("payouts", payoutId, ok ? { status: "sent", whopId, error: undefined } : { status: "failed", error, attempts: p.attempts + 1 });
    return null;
  },
});

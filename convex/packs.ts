import { v } from "convex/values";
import { packInfo, packList, type PackInfo } from "../engine/packs";
import type { Profile } from "../engine/types";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { accountId, whop } from "./pay";
import { recompileRules } from "./profile";

/**
 * Rule packs: ready-made rule sets (data/packs.json, engine/packs.ts) bought once through Whop checkout on Manage.
 *
 * - On sale: `publish` (run once by hand, `npx convex run packs:publish`) makes a Whop product and a one-time
 *   variant for each pack and remembers their ids in `packListings`. A pack without a listing is not shown.
 * - Buying: `checkout` holds a "pending" purchase for the device and returns a Whop checkout link for the pack's
 *   variant. The purchase becomes "paid" only when the payment has been read back from Whop's API as paid, for
 *   that variant, carrying our purchase id: either after Whop's webhook (convex/http.ts → pay.confirmPayment) or
 *   when the app asks (`refresh`) as the checkout closes. The redirect back to the app proves nothing.
 * - A paid pack's rules are compiled into the device's rules beside the profile's (profile.recompileRules), so
 *   they survive profile edits and can be switched off like any other rule.
 *
 * A purchase belongs to the device, like the profile; no sign-in is needed. Whop receives the pack (it is the
 * product being bought) and our purchase id. Never the device id, and nothing from the profile.
 *
 * Deployment settings: WHOP_API_KEY (also needs access_pass:create and plan:create for `publish`), WHOP_ACCOUNT_ID,
 * WHOP_WEBHOOK_SECRET; see convex/pay.ts.
 */

const EMPTY: Profile = { medications: [], conditions: [], allergies: [], diets: [] };

export type PackView = PackInfo & { state: "none" | "pending" | "owned" };

/** The packs on sale and whether this device has each one. Empty until `publish` has run. */
export const list = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }): Promise<PackView[]> => {
    const listings = await ctx.db.query("packListings").take(50);
    const onSale = new Set(listings.filter((l) => l.variantId).map((l) => l.packId));
    const mine = await ctx.db.query("packPurchases").withIndex("by_deviceId_and_packId", (q) => q.eq("deviceId", deviceId)).take(50);
    const state = new Map(mine.map((p) => [p.packId, p.status === "paid" ? ("owned" as const) : ("pending" as const)]));
    return packList()
      .filter((p) => onSale.has(p.id))
      .map((p) => ({ ...p, state: state.get(p.id) ?? "none" }));
  },
});

// ── Buying ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Start buying a pack. Returns the Whop checkout link to open. */
export const checkout = action({
  args: { deviceId: v.string(), packId: v.string() },
  handler: async (ctx, { deviceId, packId }): Promise<{ url: string }> => {
    const begun: { purchaseId: Id<"packPurchases">; variantId: string } = await ctx.runMutation(internal.packs.begin, { deviceId, packId });
    const made = await whop<{ purchase_url?: string | null }>("/checkout_configurations", {
      method: "POST",
      body: {
        account_id: accountId(),
        variant_id: begun.variantId,
        mode: "payment",
        redirect_url: `${process.env.CONVEX_SITE_URL}/whop/paid`,
        metadata: { kind: "rule_pack", purchaseId: begun.purchaseId },
      },
    });
    if (!made.purchase_url) throw new Error("Whop did not return a checkout link");
    return { url: made.purchase_url };
  },
});

/** Check the pack can be bought and hold a pending purchase for this device. */
export const begin = internalMutation({
  args: { deviceId: v.string(), packId: v.string() },
  handler: async (ctx, { deviceId, packId }): Promise<{ purchaseId: Id<"packPurchases">; variantId: string }> => {
    if (!deviceId.trim()) throw new Error("This phone has no id yet; try again in a moment");
    const listing = await ctx.db.query("packListings").withIndex("by_packId", (q) => q.eq("packId", packId)).unique();
    if (!packInfo(packId) || !listing?.variantId) throw new Error("This pack is not on sale");
    const has = await ctx.db.query("packPurchases").withIndex("by_deviceId_and_packId", (q) => q.eq("deviceId", deviceId).eq("packId", packId)).unique();
    if (has?.status === "paid") throw new Error("You already have this pack");
    // A pending purchase is reused, with its first start time, so a payment made on an earlier try is still found.
    const purchaseId = has?._id ?? (await ctx.db.insert("packPurchases", { deviceId, packId, status: "pending", at: Date.now() }));
    return { purchaseId, variantId: listing.variantId };
  },
});

export const purchaseOf = internalQuery({
  args: { deviceId: v.string(), packId: v.string() },
  handler: async (ctx, { deviceId, packId }): Promise<{ purchaseId: Id<"packPurchases">; paid: boolean; at: number; variantId: string | null } | null> => {
    const has = await ctx.db.query("packPurchases").withIndex("by_deviceId_and_packId", (q) => q.eq("deviceId", deviceId).eq("packId", packId)).unique();
    if (!has) return null;
    const listing = await ctx.db.query("packListings").withIndex("by_packId", (q) => q.eq("packId", packId)).unique();
    return { purchaseId: has._id, paid: has.status === "paid", at: has.at, variantId: listing?.variantId ?? null };
  },
});

type ListedPayment = { id?: string; status?: string; variant_id?: string | null; metadata?: Record<string, unknown> | null };

/**
 * Ask Whop directly whether this device's pending purchase has been paid, and record it if so. The app calls this
 * when the checkout closes, so a late or lost webhook does not leave someone who paid without their rules.
 * Returns whether the pack is now owned.
 */
export const refresh = action({
  args: { deviceId: v.string(), packId: v.string() },
  handler: async (ctx, { deviceId, packId }): Promise<{ owned: boolean }> => {
    const mine: { purchaseId: Id<"packPurchases">; paid: boolean; at: number; variantId: string | null } | null = await ctx.runQuery(internal.packs.purchaseOf, { deviceId, packId });
    if (!mine) return { owned: false };
    if (mine.paid) return { owned: true };
    if (!mine.variantId) return { owned: false };
    // Paid payments for this pack since a little before the purchase began, newest first.
    const q = new URLSearchParams({ account_id: accountId(), variant_id: mine.variantId, status: "paid", created_after: new Date(mine.at - 5 * 60_000).toISOString(), first: "50" });
    const found = await whop<{ data?: ListedPayment[] }>(`/payments?${q.toString()}`);
    for (const p of found.data ?? []) {
      if (!p.id || p.status !== "paid" || p.variant_id !== mine.variantId) continue;
      if (p.metadata?.kind !== "rule_pack" || p.metadata.purchaseId !== mine.purchaseId) continue;
      await ctx.runMutation(internal.packs.recordPayment, { paymentId: p.id, purchaseId: mine.purchaseId, variantId: p.variant_id });
      return { owned: true };
    }
    return { owned: false };
  },
});

/**
 * A payment Whop reports as paid unlocks its pack and adds the pack's rules. Safe to run twice for the same
 * payment. A second payment for a pack that is already owned is refunded.
 */
export const recordPayment = internalMutation({
  args: { paymentId: v.string(), purchaseId: v.string(), variantId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const purchaseId = ctx.db.normalizeId("packPurchases", args.purchaseId);
    const purchase = purchaseId ? await ctx.db.get("packPurchases", purchaseId) : null;
    if (!purchaseId || !purchase) {
      console.error(`Rule pack payment ${args.paymentId} names a purchase that does not exist; it needs a manual look`);
      return null;
    }
    const listing = await ctx.db.query("packListings").withIndex("by_packId", (q) => q.eq("packId", purchase.packId)).unique();
    if (!listing?.variantId || args.variantId !== listing.variantId) {
      console.error(`Rule pack payment ${args.paymentId} is not for the ${purchase.packId} pack's variant; it needs a manual look`);
      return null;
    }
    if (purchase.status === "paid") {
      if (purchase.paymentId !== args.paymentId) await ctx.scheduler.runAfter(0, internal.packs.refundExtra, { paymentId: args.paymentId });
      return null;
    }
    await ctx.db.patch("packPurchases", purchaseId, { status: "paid", paymentId: args.paymentId });
    const row = await ctx.db.query("profiles").withIndex("by_deviceId", (q) => q.eq("deviceId", purchase.deviceId)).unique();
    await recompileRules(ctx, purchase.deviceId, row?.profile ?? EMPTY);
    return null;
  },
});

/** Someone paid twice for a pack they already had: give the second payment back. */
export const refundExtra = internalAction({
  args: { paymentId: v.string() },
  handler: async (_ctx, { paymentId }) => {
    try {
      await whop(`/payments/${encodeURIComponent(paymentId)}/refund`, { method: "POST", body: {}, idempotencyKey: `pack-refund:${paymentId}` });
    } catch (e) {
      console.error(`Rule pack payment ${paymentId} was a second payment and could not be refunded automatically: ${e instanceof Error ? e.message : e}`);
    }
    return null;
  },
});

// ── Putting packs on sale ─────────────────────────────────────────────────────────────────────────────────────────

export const listings = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("packListings").take(50),
});

export const saveListing = internalMutation({
  args: { packId: v.string(), productId: v.string(), variantId: v.optional(v.string()), priceCents: v.number() },
  handler: async (ctx, args) => {
    const has = await ctx.db.query("packListings").withIndex("by_packId", (q) => q.eq("packId", args.packId)).unique();
    if (has) await ctx.db.patch("packListings", has._id, args);
    else await ctx.db.insert("packListings", args);
    return null;
  },
});

/**
 * Make each pack a Whop product with one one-time variant at the pack's price. Run by hand:
 *   npx convex run packs:publish
 * Safe to run again: a pack that already has a variant is left alone, and one that only got as far as its product
 * carries on from there. Products and variants are hidden on Whop, so they are bought only through the app's link.
 */
export const publish = internalAction({
  args: {},
  handler: async (ctx): Promise<{ packId: string; productId: string; variantId: string; made: boolean }[]> => {
    const have: { packId: string; productId: string; variantId?: string }[] = await ctx.runQuery(internal.packs.listings, {});
    const out: { packId: string; productId: string; variantId: string; made: boolean }[] = [];
    for (const pack of packList()) {
      const listing = have.find((l) => l.packId === pack.id);
      if (listing?.variantId) {
        out.push({ packId: pack.id, productId: listing.productId, variantId: listing.variantId, made: false });
        continue;
      }
      let productId = listing?.productId;
      if (!productId) {
        const product = await whop<{ id?: string }>("/products", {
          method: "POST",
          idempotencyKey: `pack-product:${pack.id}`,
          body: {
            account_id: accountId(),
            title: `${pack.label} rule pack`,
            headline: pack.blurb.slice(0, 80),
            description: `${pack.blurb} Adds ${pack.rules.length} food rules to your scans in Second Look. Built from: ${pack.source.title}.`,
            visibility: "hidden",
          },
        });
        if (!product.id) throw new Error(`Whop did not return a product id for ${pack.id}`);
        productId = product.id;
        await ctx.runMutation(internal.packs.saveListing, { packId: pack.id, productId, priceCents: pack.priceCents });
      }
      const variant = await whop<{ id?: string }>("/variants", {
        method: "POST",
        idempotencyKey: `pack-variant:${pack.id}:${pack.priceCents}`,
        body: {
          account_id: accountId(),
          product_id: productId,
          title: `${pack.label} rules`.slice(0, 30),
          billing_type: "one_time",
          // Whop takes prices in dollars; cents / 100 has at most two decimals.
          initial_price: pack.priceCents / 100,
          currency: "usd",
          release_method: "buy_now",
          visibility: "hidden",
          unlimited_stock: true,
        },
      });
      if (!variant.id) throw new Error(`Whop did not return a variant id for ${pack.id}`);
      await ctx.runMutation(internal.packs.saveListing, { packId: pack.id, productId, variantId: variant.id, priceCents: pack.priceCents });
      out.push({ packId: pack.id, productId, variantId: variant.id, made: true });
    }
    return out;
  },
});

/**
 * Which webhooks the Whop account has, to check one points at this deployment for payment.succeeded:
 *   npx convex run packs:webhooks
 * Without one, a purchase is still confirmed when the checkout closes (`refresh`), just not if the app is closed first.
 */
export const webhooks = internalAction({
  args: {},
  handler: async (): Promise<{ expected: string; found: { url?: string; enabled?: boolean; events?: string[] }[] }> => {
    const got = await whop<{ data?: { url?: string; enabled?: boolean; events?: string[] }[] }>(`/webhooks?${new URLSearchParams({ account_id: accountId() }).toString()}`);
    return { expected: `${process.env.CONVEX_SITE_URL}/whop/webhook`, found: (got.data ?? []).map((w) => ({ url: w.url, enabled: w.enabled, events: w.events })) };
  },
});

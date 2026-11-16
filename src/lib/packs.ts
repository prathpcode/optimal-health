import { useQuery } from 'convex/react';
import * as WebBrowser from 'expo-web-browser';

import { api } from '@convex/_generated/api';
import type { PackInfo } from '@engine/packs';
import { convex, HAS_BACKEND, useDeviceId } from './backend';

/**
 * Rule packs: ready-made rule sets bought once through Whop checkout (convex/packs.ts). A pack belongs to this
 * phone, like the profile, so buying one needs no sign-in. Its rules arrive in the ordinary rule list
 * (useProfile) the moment the backend has confirmed the payment with Whop.
 */
/** `rules` is empty until the pack is owned; `ruleCount` says how many it adds. */
export type Pack = PackInfo & { state: 'none' | 'pending' | 'owned'; ruleCount: number };

/** Where Whop's checkout hands back to the app (convex/http.ts, /whop/paid). */
const PAID_RETURN = 'secondlook://paid';

const NONE: Pack[] = [];

/** The packs on sale, live. Empty without a backend, while loading, and when nothing is on sale. */
export function usePacks(): Pack[] {
  const deviceId = useDeviceId();
  const packs = useQuery(api.packs.list, HAS_BACKEND && deviceId ? { deviceId } : 'skip');
  return packs ?? NONE;
}

/** Ask the backend to check with Whop whether this pack has been paid for. Never throws; false when unsure. */
export async function checkPack(deviceId: string, packId: string): Promise<boolean> {
  if (!convex) return false;
  try {
    return (await convex.action(api.packs.refresh, { deviceId, packId })).owned;
  } catch {
    return false;
  }
}

/**
 * Buy a pack in Whop's checkout, in an in-app browser. Throws if the checkout cannot be opened. Resolves when the
 * browser closes, paid or not, with whether Whop already shows the payment; if not yet, the pack still turns to
 * owned by itself once the backend hears from Whop.
 */
export async function buyPack(deviceId: string, packId: string): Promise<boolean> {
  if (!convex) throw new Error('No backend');
  const { url } = await convex.action(api.packs.checkout, { deviceId, packId });
  await WebBrowser.openAuthSessionAsync(url, PAID_RETURN);
  return checkPack(deviceId, packId);
}

export const packPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

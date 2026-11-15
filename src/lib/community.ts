import { useMutation, useQuery } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { CHALLENGE_NAME, challengeDays, dayKey, rankPlayers, scoreMeals, type MealScore } from '@engine/challenge';
import { COMMUNITY_GROUPS, communitiesFor, matchCommunities, type CommunityGroup } from '@engine/communityMatch';
import type { Fit } from '@engine/types';
import { convex, useDeviceId } from './backend';
import { useProfile } from './profile';
import { currentAccount, currentSession, TOGETHER_LIVE, useWhopAccount } from './whop';
import { commentOn, postToRoom, type SharedDish } from './whopForum';

/**
 * Together: community rooms, chat, meals and challenges between friends.
 *
 * Nothing here is invented. Which rooms you belong to comes from your profile (engine/communityMatch); challenge
 * scores come from the dishes you logged as ordered and the verdicts your scans gave them (engine/challenge).
 * With TOGETHER_LIVE off (the backend's Together functions not deployed yet) everything stays on this phone: rooms
 * have only you in them and challenges have only you, until it goes live and friends can join.
 */
export const PREVIEW = !TOGETHER_LIVE;

/** Where Whop's checkout hands back to the app (convex/http.ts, /whop/paid). */
const PAID_RETURN = 'secondlook://paid';

const DAY = 86_400_000;
const tz = () => -new Date().getTimezoneOffset();

/** The current time, refreshed every minute. */
function useMinute(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 60_000) * 60_000), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// ── Local store (used until Together is live) ────────────────────────────────────────────────────────────────────

export type { Reaction, SharedDish } from './whopForum';


type LocalMeal = { scanId: string; itemId: string; dishName: string; fit: Fit; at: number };
type LocalChallenge = { id: string; days: number; startsAt: number; tzOffsetMinutes: number; joinedAt: number };

type Store = {
  optOuts: string[];
  manual: string[];
  meals: LocalMeal[];
  challenges: LocalChallenge[];
};

const STORE_KEY = 'fit.together';
let store: Store = { optOuts: [], manual: [], meals: [], challenges: [] };
const listeners = new Set<() => void>();
let loaded = false;

function update(fn: (s: Store) => Store) {
  store = fn(store);
  listeners.forEach((l) => l());
  const { optOuts, manual, meals, challenges } = store;
  SecureStore.setItemAsync(STORE_KEY, JSON.stringify({ optOuts, manual, meals: meals.slice(-120), challenges: challenges.slice(-20) })).catch(() => {});
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!loaded) {
    loaded = true;
    SecureStore.getItemAsync(STORE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<Store>;
        store = { ...store, ...saved };
        listeners.forEach((x) => x());
      })
      .catch(() => {});
  }
  return () => listeners.delete(l);
}

const useStore = () => useSyncExternalStore(subscribe, () => store);

// ── Views ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type RoomView = CommunityGroup & {
  /** People in the room. 0 in preview (only you, and only on this phone). */
  members: number;
  /** Real people in the room with the app open in the last two minutes (live only; 0 in preview, so hide it). */
  online: number;
  /** What in your profile matches this room ("Hypertension"). Empty when nothing does. */
  reasons: string[];
  joined: boolean;
  source?: 'auto' | 'manual';
};

export type ChallengeStatus = 'upcoming' | 'live' | 'ended';

export type Standing = MealScore & { id: string; name: string; avatarUrl?: string; me: boolean; rank: number; joinedAt: number };

export type ChallengeView = {
  id: string;
  title: string;
  days: number;
  startsAt: number;
  endsAt: number;
  tzOffsetMinutes: number;
  status: ChallengeStatus;
  /** Challenge day number today, 1-based, clamped to the challenge. */
  dayNumber: number;
  joined: boolean;
  /** What each player pays to enter, in cents. 0 is a free race. */
  entryCents: number;
  /** Money races: what has reached the pool (after Whop's fee), and what the winner takes from it. */
  potCents: number;
  prizeCents: number;
  /** You started paying your entry and it has not been confirmed (or you never finished). */
  pending: boolean;
  /** Money owed to you from this race: a prize, or your entry coming back. */
  payout?: { kind: 'prize' | 'refund'; cents: number; status: 'pending' | 'sent' | 'failed' };
  /** Set once the pool has been settled. `refundAll`: there was no race, so everyone got their entry back. */
  settlement?: { refundAll: boolean; potCents: number; feeCents: number; prizeCents: number };
  /** Everyone, best first. */
  standings: Standing[];
  me?: Standing;
};

type PlayerIn = MealScore & { id: string; name: string; avatarUrl?: string; me: boolean; joinedAt: number };

type Stakes = Pick<ChallengeView, 'entryCents' | 'potCents' | 'prizeCents' | 'pending' | 'payout' | 'settlement'>;
const FREE: Stakes = { entryCents: 0, potCents: 0, prizeCents: 0, pending: false };

function buildChallenge(c: { id: string; days: number; startsAt: number; tzOffsetMinutes: number }, players: PlayerIn[], now: number, stakes: Stakes = FREE): ChallengeView {
  const endsAt = c.startsAt + c.days * DAY;
  const ranks = rankPlayers(players.map((p) => ({ id: p.id, points: p.points, meals: p.meals, joinedAt: p.joinedAt })));
  const standings = players.map((p) => ({ ...p, rank: ranks[p.id] })).sort((a, b) => a.rank - b.rank || Number(b.me) - Number(a.me));
  const me = standings.find((p) => p.me);
  return {
    id: c.id,
    title: CHALLENGE_NAME,
    days: c.days,
    startsAt: c.startsAt,
    endsAt,
    tzOffsetMinutes: c.tzOffsetMinutes,
    status: now < c.startsAt ? 'upcoming' : now >= endsAt ? 'ended' : 'live',
    dayNumber: Math.max(0, Math.min(c.days, Math.floor((now - c.startsAt) / DAY) + 1)),
    joined: Boolean(me),
    ...stakes,
    standings,
    me,
  };
}

function roomViews(profile: Parameters<typeof matchCommunities>[0], joined: Map<string, 'auto' | 'manual'>, counts: Map<string, number>, online: Map<string, number> = new Map()) {
  const matches = new Map(matchCommunities(profile).map((m) => [m.slug, m.reasons]));
  const all: RoomView[] = COMMUNITY_GROUPS.map((g) => {
    const source = joined.get(g.slug);
    return { ...g, members: counts.get(g.slug) ?? 0, online: online.get(g.slug) ?? 0, reasons: matches.get(g.slug) ?? [], joined: Boolean(source), source };
  });
  return {
    all,
    /** Your rooms: condition rooms first (best match first), then rooms you joined by hand. */
    mine: all.filter((r) => r.joined).sort((a, b) => Number(b.source === 'auto') - Number(a.source === 'auto') || b.reasons.length - a.reasons.length),
    /** Condition rooms your profile matches, whether or not you are in them. */
    matched: all.filter((r) => r.auto && r.reasons.length > 0),
    more: all.filter((r) => !r.joined),
  };
}

// ── Preview hooks ────────────────────────────────────────────────────────────────────────────────────────────────

function useTogetherLocal() {
  const { profile } = useProfile();
  const s = useStore();
  const { account } = useWhopAccount();
  const now = useMinute();
  return useMemo(() => {
    const joined = new Map<string, 'auto' | 'manual'>();
    for (const m of communitiesFor(profile)) if (!s.optOuts.includes(m.slug)) joined.set(m.slug, 'auto');
    for (const slug of s.manual) if (!joined.has(slug)) joined.set(slug, 'manual');
    const rooms = roomViews(profile, joined, new Map());
    const challenges = s.challenges
      .map((c) => {
        const score = scoreMeals(s.meals.map((m) => ({ at: m.at, fit: m.fit, dish: m.dishName })), c);
        return buildChallenge(c, [{ id: 'me', name: account?.name ?? 'You', avatarUrl: account?.avatarUrl, me: true, joinedAt: c.joinedAt, ...score }], now);
      })
      .filter((c) => c.endsAt + 3 * DAY > now)
      .sort((a, b) => a.startsAt - b.startsAt);
    return { ...rooms, challenges, loading: false };
  }, [profile, s.optOuts, s.manual, s.challenges, s.meals, account?.name, account?.avatarUrl, now]);
}

function useRoomLocal(slug: string) {
  const together = useTogetherLocal();
  return useMemo(() => ({ room: together.all.find((r) => r.slug === slug) }), [together.all, slug]);
}

function useChallengeLocal(id: string) {
  return useTogetherLocal().challenges.find((c) => c.id === id);
}

// ── Live hooks ───────────────────────────────────────────────────────────────────────────────────────────────────

function useHomeLive() {
  const { account } = useWhopAccount();
  const now = useMinute();
  const session = account?.session;
  const data = useQuery(api.together.home, session ? { session, now } : 'skip');
  return { data, now, session };
}

type LivePlayer = MealScore & { memberId: string; name: string; avatarUrl: string | null; joinedAt: number };
type LiveChallenge = {
  id: string;
  days: number;
  startsAt: number;
  tzOffsetMinutes: number;
  entryCents: number;
  potCents: number;
  prizeCents: number;
  pending: boolean;
  payout: ChallengeView['payout'] | null;
  settlement: ChallengeView['settlement'] | null;
  players: LivePlayer[];
};

function liveChallenge(c: LiveChallenge, meId: string | undefined, now: number): ChallengeView {
  const stakes: Stakes = { entryCents: c.entryCents, potCents: c.potCents, prizeCents: c.prizeCents, pending: c.pending, payout: c.payout ?? undefined, settlement: c.settlement ?? undefined };
  return buildChallenge(c, livePlayers(c.players, meId), now, stakes);
}

function livePlayers(players: LivePlayer[], meId: string | undefined): PlayerIn[] {
  return players.map((p) => ({ ...p, id: p.memberId, avatarUrl: p.avatarUrl ?? undefined, me: p.memberId === meId }));
}

function useTogetherLive() {
  const { profile } = useProfile();
  const { data, now } = useHomeLive();
  return useMemo(() => {
    const joined = new Map<string, 'auto' | 'manual'>();
    const counts = new Map<string, number>();
    const online = new Map<string, number>();
    for (const r of data?.rooms ?? []) {
      counts.set(r.slug, r.members);
      online.set(r.slug, r.online);
      if (r.source) joined.set(r.slug, r.source);
    }
    const rooms = roomViews(profile, joined, counts, online);
    const meId = data?.me.id;
    const challenges = (data?.challenges ?? []).map((c) => liveChallenge(c, meId, now)).sort((a, b) => a.startsAt - b.startsAt);
    return { ...rooms, challenges, loading: data === undefined };
  }, [profile, data, now]);
}

function useRoomLive(slug: string) {
  const together = useTogetherLive();
  return useMemo(() => ({ room: together.all.find((r) => r.slug === slug) }), [together.all, slug]);
}

function useChallengeLive(id: string) {
  const { data: home, session, now } = useHomeLive();
  const data = useQuery(api.together.challenge, session ? { session, id: id as Id<'challenges'> } : 'skip');
  const meId = home?.me.id;
  return useMemo(() => (data ? liveChallenge(data, meId, now) : undefined), [data, meId, now]);
}

// ── What screens use ─────────────────────────────────────────────────────────────────────────────────────────────

export type TogetherState = ReturnType<typeof useTogetherLocal>;

export const useTogether: () => TogetherState = TOGETHER_LIVE ? useTogetherLive : useTogetherLocal;
/** A room's details. Its posts come from Whop: see useRoomFeed in ./whopForum. */
export const useRoom: (slug: string) => { room: RoomView | undefined } = TOGETHER_LIVE ? useRoomLive : useRoomLocal;
export const useChallenge: (id: string) => ChallengeView | undefined = TOGETHER_LIVE ? useChallengeLive : useChallengeLocal;

function useMoneyLiveLive(): boolean {
  return useHomeLive().data?.moneyLive ?? false;
}

/** Whether money races can be started: the backend has Whop checkout and payouts switched on. Never in preview. */
export const useMoneyLive: () => boolean = TOGETHER_LIVE ? useMoneyLiveLive : () => false;

/** The rooms you can share to (rooms you're in), best match first. */
export function useMyRooms(): RoomView[] {
  return useTogether().mine;
}

/** Your best-matching condition room, for leading with it (Home, sign-in). Undefined if no condition matches. */
export function useTopRoom(): RoomView | undefined {
  const t = useTogether();
  return t.mine.find((r) => r.source === 'auto') ?? t.matched[0];
}

function call<T>(fn: (session: string) => Promise<T>): Promise<T> {
  const session = currentSession();
  if (!session || !convex) return Promise.reject(new Error('Sign in with Whop first'));
  return fn(session);
}

export function joinRoom(slug: string): Promise<unknown> {
  if (TOGETHER_LIVE) return call((session) => convex!.mutation(api.together.joinRoom, { session, room: slug }));
  update((s) => ({ ...s, manual: [...new Set([...s.manual, slug])], optOuts: s.optOuts.filter((x) => x !== slug) }));
  return Promise.resolve();
}

/** Leaving a room you were placed in records an opt-out, so placement never re-adds it. */
export function leaveRoom(slug: string): Promise<unknown> {
  if (TOGETHER_LIVE) return call((session) => convex!.mutation(api.together.leaveRoom, { session, room: slug }));
  update((s) => ({ ...s, manual: s.manual.filter((x) => x !== slug), optOuts: [...new Set([...s.optOuts, slug])] }));
  return Promise.resolve();
}

function me() {
  const a = currentAccount();
  if (!a) throw new Error('Sign in with Whop first');
  return { id: a.userId, name: a.name, avatarUrl: a.avatarUrl };
}

/** Post to a room's Whop forum as yourself: an optional title, text and/or a photo. */
export async function createPost(room: string, post: { title?: string; text?: string; photoUri?: string }): Promise<void> {
  await postToRoom(room, post, me());
}

/** Reply to a post in a room's Whop forum. */
export async function reply(room: string, postId: string, text: string): Promise<void> {
  await commentOn(room, postId, text, me());
}

/** Share a dish from a scan to a room's Whop forum: the dish, the place, how it went, an optional note and photo. Never a verdict or rule. */
export async function shareDish(room: string, dish: SharedDish, note: string, photoUri?: string): Promise<void> {
  await postToRoom(room, { dish, text: note, photoUri }, me());
}

/**
 * Start a challenge. It begins at `startsAt` (the start of a day). `entryCents` above 0 makes it a money race:
 * nobody is in, you included, until they have paid (payEntry). Returns its id, for the invite link.
 */
export async function createChallenge(days: number, startsAt: number, entryCents = 0): Promise<string> {
  if (TOGETHER_LIVE) return await call((session) => convex!.mutation(api.together.createChallenge, { session, days, startsAt, tzOffsetMinutes: tz(), entryCents }));
  if (entryCents > 0) throw new Error('Money races open when Together goes live.');
  const id = `c_${Date.now()}`;
  update((s) => ({ ...s, challenges: [...s.challenges, { id, days, startsAt, tzOffsetMinutes: tz(), joinedAt: Date.now() }] }));
  return id;
}

/**
 * Pay your entry to a money race in Whop's checkout, in an in-app browser. Resolves when the browser closes, paid or
 * not: the race screen shows you as in once Whop has confirmed the payment to the backend, which can take a moment.
 */
export async function payEntry(id: string): Promise<void> {
  if (!TOGETHER_LIVE) throw new Error('Money races open when Together goes live.');
  const { url } = await call((session) => convex!.action(api.pay.checkout, { session, id: id as Id<'challenges'> }));
  await WebBrowser.openAuthSessionAsync(url, PAID_RETURN);
}

export function joinChallenge(id: string): Promise<unknown> {
  if (TOGETHER_LIVE) return call((session) => convex!.mutation(api.together.joinChallenge, { session, id: id as Id<'challenges'> }));
  return Promise.reject(new Error('Invites work once Together is live.'));
}

export function leaveChallenge(id: string): Promise<unknown> {
  if (TOGETHER_LIVE) return call((session) => convex!.mutation(api.together.leaveChallenge, { session, id: id as Id<'challenges'> }));
  update((s) => ({ ...s, challenges: s.challenges.filter((c) => c.id !== id) }));
  return Promise.resolve();
}

/** Tell the backend the app is open, every 45 s while signed in and live. Mount once, in the root layout. */
export function usePresenceHeartbeat() {
  const { account } = useWhopAccount();
  const session = account?.session;
  useEffect(() => {
    if (!TOGETHER_LIVE || !session || !convex) return;
    const beat = () => void convex!.mutation(api.together.heartbeat, { session }).catch(() => {});
    beat();
    const t = setInterval(beat, 45_000);
    return () => clearInterval(t);
  }, [session]);
}

// ── Meals: "I ordered this" ──────────────────────────────────────────────────────────────────────────────────────

/** What was logged from a scan, if anything (undefined while loading). */
export function useMealForScan(scanId: string): { itemId: string; dishName: string } | null | undefined {
  const deviceId = useDeviceId();
  const s = useStore();
  const live = useQuery(api.together.mealForScan, TOGETHER_LIVE && deviceId && scanId !== 'sample' ? { deviceId, scanId: scanId as Id<'scans'> } : 'skip');
  if (TOGETHER_LIVE) return live;
  const m = s.meals.find((x) => x.scanId === scanId);
  return m ? { itemId: m.itemId, dishName: m.dishName } : null;
}

/** Log what was ordered from a scan (one per scan; logging again changes it). Resolves to the dish's fit. */
export function useLogMeal(): (scanId: string, itemId: string, dishName: string, fit: Fit) => Promise<Fit> {
  const deviceId = useDeviceId();
  const log = useMutation(api.together.logMeal);
  return useCallback(
    async (scanId: string, itemId: string, dishName: string, fit: Fit) => {
      if (TOGETHER_LIVE && deviceId) return (await log({ deviceId, scanId: scanId as Id<'scans'>, itemId })).fit;
      update((s) => {
        const prev = s.meals.find((m) => m.scanId === scanId);
        return { ...s, meals: [...s.meals.filter((m) => m.scanId !== scanId), { scanId, itemId, dishName, fit, at: prev?.at ?? Date.now() }] };
      });
      return fit;
    },
    [deviceId, log],
  );
}

/** Live challenges you are in, for "this counts toward …" after logging a meal. */
export function useActiveChallenges(): ChallengeView[] {
  return useTogether().challenges.filter((c) => c.status === 'live' && c.joined);
}

// ── Formatting ───────────────────────────────────────────────────────────────────────────────────────────────────

export function money(cents: number): string {
  if (cents === 0) return 'Free';
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export function todayKey(ch: Pick<ChallengeView, 'tzOffsetMinutes'>): string {
  return dayKey(Date.now(), ch.tzOffsetMinutes);
}

export function daysOf(ch: Pick<ChallengeView, 'startsAt' | 'days' | 'tzOffsetMinutes'>): string[] {
  return challengeDays(ch.startsAt, ch.days, ch.tzOffsetMinutes);
}

export function countdown(ch: { status: ChallengeStatus; startsAt: number; endsAt: number }): string {
  const target = ch.status === 'upcoming' ? ch.startsAt : ch.endsAt;
  const ms = Math.max(0, target - Date.now());
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / 3600_000);
  const span = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h` : `${Math.max(1, Math.floor(ms / 60_000))}m`;
  if (ch.status === 'upcoming') return `Starts in ${span}`;
  if (ch.status === 'live') return `${span} left`;
  return 'Ended';
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

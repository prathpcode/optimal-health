import { useQuery } from 'convex/react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

import {
  challengeDays,
  challengeTemplate,
  dayKey,
  defaultShares,
  maxPoints,
  minToPlace,
  scoreEntry,
  settle,
  type ChallengeTemplate,
} from '@engine/challenge';
import { COMMUNITY_GROUPS, communitiesFor, matchCommunities, type CommunityGroup } from '@engine/communityMatch';
import { useProfile } from './profile';
import { useRecentScans } from './scan';
import { convex } from './backend';
import { currentSession, TOGETHER_LIVE, useWhopAccount } from './whop';

/**
 * Communities and group challenges.
 *
 * Which rooms you belong to is real: it comes from your profile through engine/communityMatch. Until the Whop backend
 * is deployed, the other people in each room, their messages and their challenge scores are a local preview (PREVIEW
 * is true and the screens say so), and nothing you post leaves the phone. Your own challenge points are real: they
 * are counted from your scans and your check-ins with engine/challenge.
 */
export const PREVIEW = !TOGETHER_LIVE;

/** Paid entry needs Whop checkout and payouts, which are not switched on yet. */
export const MONEY_LIVE = false;

const DAY = 86_400_000;
const tz = () => -new Date().getTimezoneOffset();

// ── Preview data ─────────────────────────────────────────────────────────────────────────────────────────────────

const ROOM_MEMBERS: Record<string, number> = {
  'heart-health': 1284,
  'kidney-health': 412,
  diabetes: 2031,
  'gluten-free': 1876,
  'dairy-free': 958,
  'liver-health': 233,
  'gut-health': 697,
  gout: 318,
  'plant-based': 3120,
  'nut-allergy': 1442,
  'seafood-allergy': 506,
};

type Seed = [name: string, minutesAgo: number, text: string];

const SEED_MESSAGES: Record<string, Seed[]> = {
  'heart-health': [
    ['Maya R.', 190, 'Tried the scan before ordering at a Thai place. Half the curries were Not a fit for salt, which explained a lot.'],
    ['Dev P.', 150, 'Asking for sauce on the side has been the easiest win for me.'],
    ['Lena K.', 95, 'Anyone found a breakfast place that isn’t all bacon and hash browns?'],
    ['Sam O.', 60, 'Diners with an omelette station. Ask for no added salt and they usually get it.'],
    ['Maya R.', 22, 'Starting a 7-day scan streak this week if anyone wants in.'],
  ],
  'kidney-health': [
    ['Priya S.', 240, 'Potassium is the one that always surprises me. Potatoes and tomatoes everywhere.'],
    ['Jon B.', 120, 'Grilled chicken and rice has been my safe order at most places.'],
    ['Ana L.', 40, 'Scanned a menu at a Mexican spot and only two dishes came back Okay, with notes. Went with one of those.'],
  ],
  diabetes: [
    ['Chris T.', 300, 'Burrito bowls without the tortilla are my default now.'],
    ['Nia W.', 180, 'The sugar notes on drinks have been eye-opening. Some “unsweetened” teas are not.'],
    ['Omar H.', 75, 'Anyone else do the cook-at-home challenge last month? It actually stuck.'],
    ['Chris T.', 30, 'Yes, did 22 of 30 days. Want to run it again?'],
  ],
  'gluten-free': [
    ['Ellie M.', 260, 'Always ask about shared fryers. Fries are the classic trap.'],
    ['Ravi D.', 140, 'Soy sauce is wheat-based unless it says tamari. Got me twice.'],
    ['Ellie M.', 50, 'Found a pizza place with a separate gluten-free oven. Worth the drive.'],
  ],
  'dairy-free': [
    ['Kai N.', 200, 'Butter on grilled vegetables gets me every time. I ask now.'],
    ['Zoe A.', 70, 'Oat milk is everywhere now, but check the pastries.'],
  ],
  'liver-health': [
    ['Tom G.', 210, 'Mocktail menus have gotten so much better.'],
    ['Ivy C.', 80, 'Watching salt has been harder than skipping alcohol for me.'],
  ],
  'gut-health': [
    ['Leo F.', 230, 'Spicy and fried is a bad combo for me. Steamed dishes all the way.'],
    ['Mia J.', 90, 'Tomato sauces set off my reflux. Cream-free white sauces are fine.'],
  ],
  gout: [
    ['Ben V.', 160, 'Organ meats and anchovies are the obvious ones. Sugary drinks were the surprise.'],
    ['Ray K.', 45, 'Cherries are my go-to dessert now.'],
  ],
  'plant-based': [
    ['Ana P.', 220, 'Fish sauce hides in so many “vegetable” dishes.'],
    ['Max L.', 100, 'Gelatin in gummy candy and some yogurts. Scanned it in the store and it flagged.'],
  ],
  'nut-allergy': [
    ['Jess H.', 180, 'Pesto. Always ask what nuts are in it.'],
    ['Noah E.', 65, 'Asian desserts and sauces are where I’m most careful.'],
  ],
  'seafood-allergy': [
    ['Kim T.', 150, 'Caesar dressing has anchovy. Learned that the hard way.'],
    ['Paulo R.', 55, 'Worcestershire too.'],
  ],
};

type Player = { id: string; name: string; joinedAt: number; me?: boolean; rate?: number };

export type Challenge = {
  id: string;
  room: string;
  template: string;
  days: number;
  entryCents: number;
  startsAt: number;
  tzOffsetMinutes: number;
  createdBy: string;
  players: Player[];
};

const today0 = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function seedChallenges(): Challenge[] {
  const t = today0();
  const players = (names: [string, number][], start: number) =>
    names.map(([name, rate], i) => ({ id: `p_${name}`, name, rate, joinedAt: start - (names.length - i) * 3600_000 }));
  return [
    {
      id: 'c_heart_streak',
      room: 'heart-health',
      template: 'scan_before_order',
      days: 7,
      entryCents: 1000,
      startsAt: t - 2 * DAY,
      tzOffsetMinutes: tz(),
      createdBy: 'Maya R.',
      players: players([['Maya R.', 1], ['Dev P.', 0.9], ['Lena K.', 0.6], ['Sam O.', 0.8]], t - 2 * DAY),
    },
    {
      id: 'c_diabetes_home',
      room: 'diabetes',
      template: 'cook_at_home',
      days: 14,
      entryCents: 500,
      startsAt: t + DAY,
      tzOffsetMinutes: tz(),
      createdBy: 'Chris T.',
      players: players([['Chris T.', 0.85], ['Omar H.', 0.7], ['Nia W.', 0.75]], t),
    },
    {
      id: 'c_gf_scan',
      room: 'gluten-free',
      template: 'scan_every_meal_out',
      days: 7,
      entryCents: 0,
      startsAt: t - DAY,
      tzOffsetMinutes: tz(),
      createdBy: 'Ellie M.',
      players: players([['Ellie M.', 0.8], ['Ravi D.', 0.55]], t - DAY),
    },
  ];
}

// ── Store ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** How a shared dish went. */
export type Reaction = 'loved' | 'okay' | 'nope';

/** A dish someone shared from a scan: the dish, where, and how it went. Never their verdict or their rules. */
export type SharedDish = { name: string; place?: string; reaction: Reaction };

export type Message = { id: string; room: string; author: string; avatarUrl?: string; text: string; at: number; mine?: boolean; dish?: SharedDish };

type Store = {
  /** null until the person has answered the placement question. */
  autoPlace: boolean | null;
  optOuts: string[];
  manual: string[];
  sent: Message[];
  challenges: Challenge[];
  checkins: Record<string, Record<string, 'yes' | 'no'>>;
};

let store: Store = { autoPlace: null, optOuts: [], manual: [], sent: [], challenges: seedChallenges(), checkins: {} };
const listeners = new Set<() => void>();
const update = (fn: (s: Store) => Store) => {
  store = fn(store);
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const useStore = () => useSyncExternalStore(subscribe, () => store);

// ── Views ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type RoomView = CommunityGroup & {
  members: number;
  /** What in your profile matches this room ("Hypertension"). Empty when nothing does. */
  reasons: string[];
  joined: boolean;
  source?: 'auto' | 'manual';
};

export type ChallengeStatus = 'upcoming' | 'live' | 'ended';

export type Standing = { id: string; name: string; avatarUrl?: string; score: number; rank: number; me: boolean };

export type ChallengeView = Challenge & {
  t: ChallengeTemplate;
  title: string;
  status: ChallengeStatus;
  endsAt: number;
  /** Challenge day number today, 1-based, clamped to the challenge. */
  dayNumber: number;
  max: number;
  needed: number;
  joined: boolean;
  potCents: number;
  standings: Standing[];
  me?: { score: number; perDay: Record<string, number>; rank: number };
  /** What each place would win if it ended now. */
  prizes: number[];
  roomTitle: string;
};

function roomById(slug: string) {
  return COMMUNITY_GROUPS.find((g) => g.slug === slug);
}

function useRooms() {
  const { profile } = useProfile();
  const s = useStore();
  return useMemo(() => {
    const matches = new Map(matchCommunities(profile).map((m) => [m.slug, m.reasons]));
    const auto = new Set(s.autoPlace ? communitiesFor(profile).map((m) => m.slug).filter((x) => !s.optOuts.includes(x)) : []);
    const view = (g: CommunityGroup): RoomView => {
      const source = auto.has(g.slug) ? 'auto' : s.manual.includes(g.slug) ? 'manual' : undefined;
      return {
        ...g,
        members: (ROOM_MEMBERS[g.slug] ?? 0) + (source ? 1 : 0),
        reasons: matches.get(g.slug) ?? [],
        joined: Boolean(source),
        source,
      };
    };
    const all = COMMUNITY_GROUPS.map(view);
    return {
      all,
      mine: all.filter((r) => r.joined),
      /** Condition rooms your profile puts you in, shown when asking about automatic placement. */
      matched: all.filter((r) => r.auto && r.reasons.length > 0),
      more: all.filter((r) => !r.joined && !(r.auto && r.reasons.length > 0 && s.autoPlace)),
      autoPlace: s.autoPlace,
    };
  }, [profile, s.autoPlace, s.optOuts, s.manual]);
}

type ScoredPlayer = { id: string; name: string; avatarUrl?: string; joinedAt: number; score: number; me: boolean; perDay?: Record<string, number> };

/** One challenge as the screens draw it. Ranks and what each place would win are computed here, in code. */
function buildView(ch: Challenge, scored: ScoredPlayer[], now: number): ChallengeView {
  const t = challengeTemplate(ch.template)!;
  const endsAt = ch.startsAt + ch.days * DAY;
  const status: ChallengeStatus = now < ch.startsAt ? 'upcoming' : now >= endsAt ? 'ended' : 'live';
  const elapsed = Math.max(0, Math.min(ch.days, Math.floor((now - ch.startsAt) / DAY) + 1));
  const shares = defaultShares(scored.length);
  const result = settle({
    entries: scored.map((e) => ({ id: e.id, netCents: ch.entryCents, score: e.score, joinedAt: e.joinedAt })),
    shares,
    feeBps: 0,
    minToPlace: 0,
  });
  const standings = scored
    .map((e) => ({ id: e.id, name: e.name, avatarUrl: e.avatarUrl, score: e.score, me: e.me, rank: result.ranks[e.id] }))
    .sort((a, b) => a.rank - b.rank || Number(b.me) - Number(a.me));
  const mine = scored.find((p) => p.me);
  const potCents = ch.entryCents * scored.length;
  return {
    ...ch,
    t,
    title: t.title,
    status,
    endsAt,
    dayNumber: elapsed,
    max: maxPoints(t, ch.days),
    needed: minToPlace(t, ch.days),
    joined: Boolean(mine),
    potCents,
    standings,
    me: mine ? { score: mine.score, perDay: mine.perDay ?? {}, rank: result.ranks[mine.id] } : undefined,
    prizes: shares.map((sh) => Math.floor((potCents * sh) / 100)),
    roomTitle: roomById(ch.room)?.title ?? '',
  };
}

function useChallengeViews(): ChallengeView[] {
  const s = useStore();
  const scans = useRecentScans();
  const { account } = useWhopAccount();
  return useMemo(() => {
    const now = Date.now();
    const scanTimes = (scans ?? []).filter((x) => x.status === 'done').map((x) => x.createdAt);
    return s.challenges.map((ch) => {
      const t = challengeTemplate(ch.template)!;
      const elapsed = Math.max(0, Math.min(ch.days, Math.floor((now - ch.startsAt) / DAY) + 1));
      const window = { startsAt: ch.startsAt, days: ch.days, tzOffsetMinutes: ch.tzOffsetMinutes };
      const checkins = Object.entries(s.checkins[ch.id] ?? {}).map(([day, value]) => ({ day, value }));
      const scored = ch.players.map((p) => {
        const mine = p.me ? scoreEntry(t, window, scanTimes, checkins) : undefined;
        return {
          id: p.id,
          name: p.me ? (account?.name ?? 'You') : p.name,
          avatarUrl: p.me ? account?.avatarUrl : undefined,
          me: Boolean(p.me),
          joinedAt: p.joinedAt,
          perDay: mine?.perDay,
          score: mine ? mine.total : Math.round((p.rate ?? 0) * elapsed * t.perDayMax * (t.count === 'scans' ? 0.7 : 1)),
        };
      });
      return buildView(ch, scored, now);
    });
  }, [s.challenges, s.checkins, scans, account?.name, account?.avatarUrl]);
}

// ── Hooks for screens ────────────────────────────────────────────────────────────────────────────────────────────

function useTogetherPreview() {
  const rooms = useRooms();
  const challenges = useChallengeViews();
  const mineSlugs = new Set(rooms.mine.map((r) => r.slug));
  return {
    ...rooms,
    challenges: challenges
      .filter((c) => c.status !== 'ended' && (mineSlugs.has(c.room) || c.joined))
      .sort((a, b) => Number(b.joined) - Number(a.joined) || a.startsAt - b.startsAt),
  };
}

function useRoomPreview(slug: string) {
  const rooms = useRooms();
  const s = useStore();
  const challenges = useChallengeViews();
  const room = rooms.all.find((r) => r.slug === slug);
  const messages = useMemo(() => {
    const now = Date.now();
    const seeded: Message[] = (SEED_MESSAGES[slug] ?? []).map(([author, ago, text], i) => ({
      id: `seed_${slug}_${i}`,
      room: slug,
      author,
      text,
      at: now - ago * 60_000,
    }));
    return [...seeded, ...s.sent.filter((m) => m.room === slug)].sort((a, b) => a.at - b.at);
    // Seeded times are relative to when the room was opened; recomputing on every send would make them drift.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, s.sent]);
  return { room, messages, challenges: challenges.filter((c) => c.room === slug && c.status !== 'ended') };
}

function useChallengePreview(id: string) {
  return useChallengeViews().find((c) => c.id === id);
}

// ── Actions ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Answer the placement question. `skip` lists matched rooms the person switched off. */
function setAutoPlacePreview(on: boolean, skip: string[] = []) {
  update((s) => ({ ...s, autoPlace: on, optOuts: [...new Set([...s.optOuts, ...skip])] }));
}

function joinRoomPreview(slug: string) {
  update((s) => ({ ...s, manual: [...new Set([...s.manual, slug])], optOuts: s.optOuts.filter((x) => x !== slug) }));
}

/** Leaving a room you were placed in records an opt-out, so placement never re-adds it. */
function leaveRoomPreview(slug: string) {
  update((s) => ({ ...s, manual: s.manual.filter((x) => x !== slug), optOuts: [...new Set([...s.optOuts, slug])] }));
}

function sendMessagePreview(room: string, text: string, author: string) {
  const body = text.trim();
  if (!body) return;
  update((s) => ({ ...s, sent: [...s.sent, { id: `m_${Date.now()}`, room, author, text: body, at: Date.now(), mine: true }] }));
}

/** Post a dish from a scan to a room, with how it went and an optional note. */
function shareDishPreview(room: string, dish: SharedDish, note: string, author: string) {
  update((s) => ({
    ...s,
    sent: [...s.sent, { id: `m_${Date.now()}`, room, author, text: note.trim(), at: Date.now(), mine: true, dish }],
  }));
}

/** The rooms you can share to right now (rooms you're in). */
export function useMyRooms(): RoomView[] {
  return useTogether().mine;
}

function createChallengePreview(input: { room: string; template: string; days: number; entryCents: number; startsAt: number; me: string }): string {
  const id = `c_${Date.now()}`;
  const ch: Challenge = {
    id,
    room: input.room,
    template: input.template,
    days: input.days,
    entryCents: input.entryCents,
    startsAt: input.startsAt,
    tzOffsetMinutes: tz(),
    createdBy: input.me,
    players: [{ id: 'me', name: input.me, joinedAt: Date.now(), me: true }],
  };
  update((s) => ({ ...s, challenges: [ch, ...s.challenges] }));
  return id;
}

function joinChallengePreview(id: string, me: string) {
  update((s) => ({
    ...s,
    challenges: s.challenges.map((c) =>
      c.id === id && !c.players.some((p) => p.me) ? { ...c, players: [...c.players, { id: 'me', name: me, joinedAt: Date.now(), me: true }] } : c,
    ),
  }));
}

function leaveChallengePreview(id: string) {
  update((s) => ({ ...s, challenges: s.challenges.map((c) => (c.id === id ? { ...c, players: c.players.filter((p) => !p.me) } : c)) }));
}

function checkInPreview(id: string, day: string, value: 'yes' | 'no') {
  update((s) => ({ ...s, checkins: { ...s.checkins, [id]: { ...s.checkins[id], [day]: value } } }));
}


// ── Live (shared backend) ────────────────────────────────────────────────────────────────────────────────────────

/** The current time, refreshed every minute (queries take the time as an argument). */
function useMinute(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 60_000) * 60_000), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

type LivePlayer = { memberId: string; name: string; avatarUrl: string | null; joinedAt: number; score: number; perDay?: Record<string, number> };
type LiveChallenge = { id: string; room: string; template: string; days: number; entryCents: number; startsAt: number; tzOffsetMinutes: number; players: LivePlayer[] };

function liveView(ch: LiveChallenge, meId: string | undefined, now: number): ChallengeView {
  const players = ch.players.map((p) => ({ id: p.memberId, name: p.name, joinedAt: p.joinedAt, me: p.memberId === meId }));
  const base: Challenge = { id: ch.id, room: ch.room, template: ch.template, days: ch.days, entryCents: ch.entryCents, startsAt: ch.startsAt, tzOffsetMinutes: ch.tzOffsetMinutes, createdBy: '', players };
  return buildView(
    base,
    ch.players.map((p) => ({ id: p.memberId, name: p.name, avatarUrl: p.avatarUrl ?? undefined, joinedAt: p.joinedAt, score: p.score, me: p.memberId === meId, perDay: p.perDay })),
    now,
  );
}

function useHomeLive() {
  const { account } = useWhopAccount();
  const now = useMinute();
  const session = account?.session;
  const data = useQuery(api.together.home, session ? { session, now } : 'skip');
  return { data, now, session };
}

function useTogetherLive() {
  const { data, now } = useHomeLive();
  return useMemo(() => {
    const byId = new Map((data?.rooms ?? []).map((r) => [r.slug, r]));
    const all: RoomView[] = COMMUNITY_GROUPS.map((g) => {
      const r = byId.get(g.slug);
      const source = r?.source ?? undefined;
      return { ...g, members: r?.members ?? 0, reasons: r?.reasons ?? [], joined: Boolean(source), source };
    });
    const autoPlace = data?.me.autoPlace ?? null;
    const challenges = (data?.challenges ?? [])
      .map((ch) => liveView(ch, data?.me.id, now))
      .filter((c) => c.status !== 'ended')
      .sort((a, b) => Number(b.joined) - Number(a.joined) || a.startsAt - b.startsAt);
    return {
      all,
      mine: all.filter((r) => r.joined),
      matched: all.filter((r) => r.auto && r.reasons.length > 0),
      more: all.filter((r) => !r.joined && !(r.auto && r.reasons.length > 0 && autoPlace)),
      autoPlace,
      challenges,
      loading: data === undefined,
    };
  }, [data, now]);
}

function useRoomLive(slug: string) {
  const together = useTogetherLive();
  const { data: home, now, session } = useHomeLive();
  const data = useQuery(api.together.room, session ? { session, room: slug, now } : 'skip');
  return useMemo(() => {
    const room = together.all.find((r) => r.slug === slug);
    const messages: Message[] = (data?.messages ?? []).map((m) => ({
      id: m.id,
      room: slug,
      author: m.author,
      avatarUrl: m.avatarUrl ?? undefined,
      text: m.text,
      at: m.at,
      mine: m.mine,
      dish: m.dish ?? undefined,
    }));
    const challenges = (data?.challenges ?? []).map((ch) => liveView(ch, home?.me.id, now)).filter((c) => c.status !== 'ended');
    return { room, messages, challenges };
  }, [together.all, data, home?.me.id, now, slug]);
}

function useChallengeLive(id: string) {
  const { data: home, session } = useHomeLive();
  const now = useMinute();
  const data = useQuery(api.together.challenge, session ? { session, id: id as Id<'challenges'> } : 'skip');
  return useMemo(() => (data ? liveView(data, home?.me.id, now) : undefined), [data, home?.me.id, now]);
}

function call<T>(fn: (session: string) => Promise<T>): Promise<T> {
  const session = currentSession();
  if (!session || !convex) return Promise.reject(new Error('Sign in with Whop first'));
  return fn(session);
}

// ── What screens use ─────────────────────────────────────────────────────────────────────────────────────────────

export const useTogether: () => ReturnType<typeof useTogetherPreview> & { loading?: boolean } = TOGETHER_LIVE ? useTogetherLive : useTogetherPreview;
export const useRoom: (slug: string) => { room: RoomView | undefined; messages: Message[]; challenges: ChallengeView[] } = TOGETHER_LIVE ? useRoomLive : useRoomPreview;
export const useChallenge: (id: string) => ChallengeView | undefined = TOGETHER_LIVE ? useChallengeLive : useChallengePreview;

/** Answer the placement question. `skip` lists matched rooms the person switched off. */
export function setAutoPlace(on: boolean, skip: string[] = []): Promise<unknown> {
  if (TOGETHER_LIVE) return call((session) => convex!.mutation(api.together.setAutoPlace, { session, on, skip }));
  setAutoPlacePreview(on, skip);
  return Promise.resolve();
}

export function joinRoom(slug: string): Promise<unknown> {
  if (TOGETHER_LIVE) return call((session) => convex!.mutation(api.together.joinRoom, { session, room: slug }));
  joinRoomPreview(slug);
  return Promise.resolve();
}

/** Leaving a room you were placed in records an opt-out, so placement never re-adds it. */
export function leaveRoom(slug: string): Promise<unknown> {
  if (TOGETHER_LIVE) return call((session) => convex!.mutation(api.together.leaveRoom, { session, room: slug }));
  leaveRoomPreview(slug);
  return Promise.resolve();
}

export function sendMessage(room: string, text: string, author: string): Promise<unknown> {
  if (TOGETHER_LIVE) return call((session) => convex!.mutation(api.together.send, { session, room, text }));
  sendMessagePreview(room, text, author);
  return Promise.resolve();
}

/** Post a dish from a scan to a room, with how it went and an optional note. Never the verdict or the person's rules. */
export function shareDish(room: string, dish: SharedDish, note: string, author: string): Promise<unknown> {
  if (TOGETHER_LIVE) return call((session) => convex!.mutation(api.together.send, { session, room, text: note, dish }));
  shareDishPreview(room, dish, note, author);
  return Promise.resolve();
}

export async function createChallenge(input: { room: string; template: string; days: number; entryCents: number; startsAt: number; me: string }): Promise<string> {
  if (TOGETHER_LIVE) {
    return await call((session) =>
      convex!.mutation(api.together.createChallenge, {
        session,
        room: input.room,
        template: input.template,
        days: input.days,
        entryCents: input.entryCents,
        startsAt: input.startsAt,
        tzOffsetMinutes: tz(),
      }),
    );
  }
  return createChallengePreview(input);
}

export function joinChallenge(id: string, me: string): Promise<unknown> {
  if (TOGETHER_LIVE) return call((session) => convex!.mutation(api.together.joinChallenge, { session, id: id as Id<'challenges'> }));
  joinChallengePreview(id, me);
  return Promise.resolve();
}

export function leaveChallenge(id: string): Promise<unknown> {
  if (TOGETHER_LIVE) return call((session) => convex!.mutation(api.together.leaveChallenge, { session, id: id as Id<'challenges'> }));
  leaveChallengePreview(id);
  return Promise.resolve();
}

export function checkIn(id: string, day: string, value: 'yes' | 'no'): Promise<unknown> {
  if (TOGETHER_LIVE) return call((session) => convex!.mutation(api.together.checkIn, { session, id: id as Id<'challenges'>, day, value }));
  checkInPreview(id, day, value);
  return Promise.resolve();
}

// ── Formatting ───────────────────────────────────────────────────────────────────────────────────────────────────

export function money(cents: number): string {
  if (cents === 0) return 'Free';
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export function todayKey(ch: Pick<Challenge, 'tzOffsetMinutes'>): string {
  return dayKey(Date.now(), ch.tzOffsetMinutes);
}

export function daysOf(ch: Challenge): string[] {
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

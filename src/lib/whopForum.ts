import * as ImageManipulator from 'expo-image-manipulator';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import whopRooms from '../../data/whopRooms.json';
import { itemLink, readItemLink, type SharedItem } from './sharedItem';
import { currentAccount, useWhopAccount, whopAccessToken } from './whop';

/**
 * Rooms are Whop forums. Each room is a public Forums experience on the Fit business (data/whopRooms.json); people
 * read, post, comment and like with their own Whop sign-in (forum:read, forum:post:create), so every post, photo
 * and comment lives on Whop and shows there too. Nothing here is simulated: an empty room is empty.
 */

const API = 'https://api.whop.com/api/v1';
type RoomIds = { forumId?: string };
const ROOMS = whopRooms as unknown as Record<string, RoomIds> & { _access: { productId: string; variantId: string } };

/** Whop's free join page for "Fit communities", used only if Whop asks for membership before posting. */
export const JOIN_URL = `https://whop.com/checkout/${ROOMS._access.variantId}`;
const JOIN_RETURN = 'fitscanner://joined';

export class WhopError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function whop<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const token = await whopAccessToken();
  if (!token) throw new WhopError(401, 'Sign in with Whop again.');
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) throw new WhopError(res.status, body.error?.message ?? `Whop said ${res.status}`);
  return body as T;
}

// ── Shared dishes ────────────────────────────────────────────────────────────────────────────────────────────────

export type Reaction = 'loved' | 'okay' | 'nope';
/** A dish or product shared from a scan. `item` carries its facts (never the poster's verdict or rules). */
export type SharedDish = { name: string; place?: string; reaction: Reaction; item?: SharedItem };

export const REACTION_LINE: Record<Reaction, string> = { loved: 'Loved it', okay: 'It was okay', nope: 'Wouldn’t order again' };

/** A shared dish is an ordinary forum post (the dish as title, place and verdict-free reaction first), so it reads well on Whop too. */
function dishBody(dish: SharedDish, note: string): { title: string; content: string } {
  const line = [dish.place, REACTION_LINE[dish.reaction]].filter(Boolean).join(' · ');
  return { title: dish.name.slice(0, 120), content: [line, note.trim(), dish.item ? itemLink(dish.item) : ''].filter(Boolean).join('\n\n') };
}

function parseDish(title: string | null, content: string): { dish: SharedDish; note: string } | null {
  if (!title) return null;
  const [first, ...rest] = content.split('\n\n');
  const parts = first.split(' · ');
  const last = parts[parts.length - 1];
  const reaction = (Object.keys(REACTION_LINE) as Reaction[]).find((r) => REACTION_LINE[r] === last);
  if (!reaction) return null;
  return { dish: { name: title, place: parts.length > 1 ? parts.slice(0, -1).join(' · ') : undefined, reaction }, note: rest.join('\n\n').trim() };
}

// ── Posts ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type Photo = { url: string; width?: number; height?: number };

export type Post = {
  id: string;
  authorId: string;
  author: string;
  avatarUrl?: string;
  title?: string;
  text: string;
  at: number;
  mine: boolean;
  photos: Photo[];
  dish?: SharedDish;
  /** Like count as Whop reported it when this feed loaded. Draw likes with `useLike`, which is current everywhere. */
  likes: number;
  comments: number;
  pinned: boolean;
  /** Still posting from this phone. */
  pending?: boolean;
};

type WhopPost = {
  id: string;
  title: string | null;
  content: string | null;
  created_at: string;
  parent_id: string | null;
  is_pinned: boolean;
  like_count: number;
  comment_count: number;
  user: { id: string; username?: string | null; name?: string | null } | null;
  attachments?: { url?: string | null; width?: number | null; height?: number | null; content_type?: string | null }[];
};

// Profile pictures are not on posts; fetched once per person.
const avatars = new Map<string, string | null>();
async function avatarFor(userId: string) {
  if (avatars.has(userId)) return;
  avatars.set(userId, null);
  try {
    const u = await whop<{ profile_picture?: { url?: string | null } | null }>(`/users/${userId}`);
    avatars.set(userId, u.profile_picture?.url ?? null);
  } catch {
    // No picture: initials instead.
  }
}

/** Markdown images in a post (how posts made with the business key carry photos) become photos; the text keeps the rest. */
const MD_IMAGE = /!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/g;

function toPost(p: WhopPost, meId: string | undefined): Post {
  const raw = p.content ?? '';
  const inline = [...raw.matchAll(MD_IMAGE)].map((m) => ({ url: m[1] }));
  const linked = readItemLink(raw.replace(MD_IMAGE, '').replace(/^\s+/, ''));
  const content = linked.text;
  const parsed = parseDish(p.title, content);
  if (parsed && linked.item) parsed.dish.item = linked.item;
  const authorId = p.user?.id ?? '';
  return {
    id: p.id,
    authorId,
    author: p.user?.name || p.user?.username || 'Member',
    avatarUrl: avatars.get(authorId) ?? undefined,
    title: parsed ? undefined : (p.title ?? undefined),
    text: parsed ? parsed.note : content,
    at: Date.parse(p.created_at),
    mine: authorId === meId,
    photos: [
      ...(p.attachments ?? [])
        .filter((a) => a.url && (a.content_type ?? 'image/').startsWith('image/'))
        .map((a) => ({ url: a.url!, width: a.width ?? undefined, height: a.height ?? undefined })),
      ...inline,
    ],
    dish: parsed?.dish,
    likes: p.like_count,
    comments: p.comment_count,
    pinned: p.is_pinned,
  };
}

// One cache per feed (a room's posts, or a post's comments), so screens open instantly.
type Feed = { items: Post[]; loaded: boolean; error?: string };
const feeds = new Map<string, Feed>();
const feedListeners = new Map<string, Set<() => void>>();
const setFeed = (key: string, next: Partial<Feed>) => {
  feeds.set(key, { ...(feeds.get(key) ?? { items: [], loaded: false }), ...next });
  feedListeners.get(key)?.forEach((l) => l());
};
const EMPTY: Feed = { items: [], loaded: false };

function useFeed(key: string, load: () => Promise<void>, everyMs: number, enabled: boolean): Feed & { refresh: () => void } {
  const state = useSyncExternalStore(
    useCallback(
      (l: () => void) => {
        const set = feedListeners.get(key) ?? new Set();
        set.add(l);
        feedListeners.set(key, set);
        return () => set.delete(l);
      },
      [key],
    ),
    () => feeds.get(key) ?? EMPTY,
  );
  useEffect(() => {
    if (!enabled) return;
    void load();
    const t = setInterval(() => void load(), everyMs);
    return () => clearInterval(t);
    // `load` is rebuilt each render; the key and enabled flag say when to restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, everyMs]);
  return { ...state, refresh: () => void load() };
}

async function loadPosts(key: string, query: string, meId: string | undefined, newestFirst: boolean) {
  try {
    const page = await whop<{ data: WhopPost[] }>(`/forum_posts?${query}&first=40`);
    noteLikes(page.data, meId);
    await Promise.all([...new Set(page.data.map((p) => p.user?.id).filter((x): x is string => Boolean(x)))].map(avatarFor));
    const fresh = page.data.map((p) => toPost(p, meId)).sort((a, b) => (newestFirst ? b.at - a.at : a.at - b.at));
    const pending = (feeds.get(key)?.items ?? []).filter((p) => p.pending);
    const items = newestFirst ? [...pending, ...fresh] : [...fresh, ...pending];
    // Pinned posts lead a room.
    setFeed(key, { items: newestFirst ? [...items.filter((p) => p.pinned), ...items.filter((p) => !p.pinned)] : items, loaded: true, error: undefined });
  } catch (e) {
    setFeed(key, { loaded: true, error: e instanceof Error ? e.message : 'Could not reach Whop' });
  }
}

/** A room's posts, newest first (pinned on top), refreshed from Whop every 10 s while open. */
export function useRoomFeed(slug: string) {
  const { account } = useWhopAccount();
  const forum = ROOMS[slug]?.forumId;
  const key = `room:${slug}`;
  return useFeed(key, () => loadPosts(key, `experience_id=${forum}`, account?.userId, true), 10_000, Boolean(account && forum));
}

/** A post's comments, oldest first, refreshed every 6 s while open. */
export function useComments(slug: string, postId: string) {
  const { account } = useWhopAccount();
  const forum = ROOMS[slug]?.forumId;
  const key = `comments:${postId}`;
  return useFeed(key, () => loadPosts(key, `experience_id=${forum}&parent_id=${postId}`, account?.userId, false), 6_000, Boolean(account && forum));
}

/** The newest real posts across several rooms (yours), newest first, each with its room. Refreshed every 20 s. */
export function useLatestPosts(slugs: string[], limit = 6): { items: (Post & { room: string })[]; loaded: boolean } {
  const { account } = useWhopAccount();
  const key = `latest:${slugs.join(',')}`;
  const load = async () => {
    try {
      const pages = await Promise.all(
        slugs
          .filter((slug) => ROOMS[slug]?.forumId)
          .map(async (slug) => {
            const page = await whop<{ data: WhopPost[] }>(`/forum_posts?experience_id=${ROOMS[slug].forumId}&first=10`);
            return page.data.map((p) => ({ p, slug }));
          }),
      );
      const all = pages.flat();
      noteLikes(
        all.map(({ p }) => p),
        account?.userId,
      );
      await Promise.all([...new Set(all.map(({ p }) => p.user?.id).filter((x): x is string => Boolean(x)))].map(avatarFor));
      const items = all
        .map(({ p, slug }) => ({ ...toPost(p, account?.userId), room: slug }))
        .sort((a, b) => b.at - a.at)
        .slice(0, limit);
      setFeed(key, { items, loaded: true, error: undefined });
    } catch (e) {
      setFeed(key, { loaded: true, error: e instanceof Error ? e.message : 'Could not reach Whop' });
    }
  };
  const feed = useFeed(key, load, 20_000, Boolean(account && slugs.length));
  return { items: feed.items as (Post & { room: string })[], loaded: feed.loaded };
}

/** One post, from whichever feed has it. */
export function usePost(slug: string, postId: string): Post | undefined {
  const feed = useRoomFeed(slug);
  return feed.items.find((p) => p.id === postId);
}

/** Every photo shared in a room, newest first: the room's inspiration board. */
export function useRoomPhotos(slug: string): { photo: Photo; post: Post }[] {
  const { items } = useRoomFeed(slug);
  return useMemo(() => items.flatMap((post) => post.photos.map((photo) => ({ photo, post }))), [items]);
}

/** Photos shrink to at most 1600 px wide before upload. */
async function uploadPhoto(uri: string): Promise<string> {
  // A photo on this phone is shrunk first; one already online (a past scan's photo from the backend, which was
  // compressed when it was taken) is sent as it is.
  const small = uri.startsWith('http') ? { uri } : await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
  const file = await whop<{ id: string; upload_url?: string; upload_headers?: Record<string, string> }>('/files', {
    method: 'POST',
    body: { filename: `fit-${Date.now()}.jpg`, visibility: 'public' },
  });
  if (!file.upload_url) throw new Error('Whop did not give an upload address');
  const blob = await (await fetch(small.uri)).blob();
  const put = await fetch(file.upload_url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', ...(file.upload_headers ?? {}) }, body: blob });
  if (!put.ok) throw new Error('Photo upload failed');
  return file.id;
}

export type NewPost = { title?: string; text?: string; photoUri?: string; dish?: SharedDish };
type Me = { id: string; name: string; avatarUrl?: string };

function optimistic(me: Me, out: NewPost, body: { title?: string; content: string }): Post {
  return {
    id: `pending_${Date.now()}`,
    authorId: me.id,
    author: me.name,
    avatarUrl: me.avatarUrl,
    title: out.dish ? undefined : body.title,
    text: out.dish ? (out.text ?? '').trim() : body.content,
    at: Date.now(),
    mine: true,
    photos: out.photoUri ? [{ url: out.photoUri }] : [],
    dish: out.dish,
    likes: 0,
    comments: 0,
    pinned: false,
    pending: true,
  };
}

async function send(key: string, reload: () => Promise<void>, me: Me, out: NewPost, extra: Record<string, string>, first: boolean) {
  const body = out.dish ? dishBody(out.dish, out.text ?? '') : { title: out.title?.trim() || undefined, content: (out.text ?? '').trim() };
  if (!body.content && !body.title && !out.photoUri) return;
  const temp = optimistic(me, out, body);
  const items = feeds.get(key)?.items ?? [];
  setFeed(key, { items: first ? [temp, ...items] : [...items, temp] });
  try {
    const attachments = out.photoUri ? [{ id: await uploadPhoto(out.photoUri) }] : undefined;
    await whop('/forum_posts', { method: 'POST', body: { ...extra, title: body.title, content: body.content || ' ', attachments } });
  } finally {
    setFeed(key, { items: (feeds.get(key)?.items ?? []).filter((p) => p.id !== temp.id) });
    await reload();
  }
}

/** Post to a room's forum as yourself: a dish, a photo, a thought, or any mix. */
export async function postToRoom(slug: string, out: NewPost, me: Me) {
  const forum = ROOMS[slug]?.forumId;
  if (!forum) throw new Error('No such room');
  const key = `room:${slug}`;
  await send(key, () => loadPosts(key, `experience_id=${forum}`, me.id, true), me, out, { experience_id: forum }, true);
}

/** Reply to a post. */
export async function commentOn(slug: string, postId: string, text: string, me: Me) {
  const forum = ROOMS[slug]?.forumId;
  if (!forum) throw new Error('No such room');
  const key = `comments:${postId}`;
  await send(key, () => loadPosts(key, `experience_id=${forum}&parent_id=${postId}`, me.id, false), me, { text }, { experience_id: forum, parent_id: postId }, false);
  void loadPosts(`room:${slug}`, `experience_id=${forum}`, me.id, true);
}

// ── Likes ────────────────────────────────────────────────────────────────────────────────────────────────────────
//
// Whop's posts carry a like count but not whether you liked them, so that is kept here, per post id, for every
// screen at once (a room, Latest on Together, a post and its comments all read the same state):
// - `mine` is whether you liked it. It starts from what this phone remembers (SecureStore, per Whop account) and is
//   checked against the post's reactions on Whop whenever its count is one we have not checked yet.
// - `counts` is the newest like count any feed has seen.
// - A tap shows at once and holds until Whop's count moves (or a short while passes), so a poll that lands before
//   Whop has counted the tap cannot flip the heart back.

const HEART = ':heart:';
const REMEMBER = 100;
const HOLD_MS = 20_000;

type Toggle = { liked: boolean; likes: number; base: number; done: boolean; at: number };

let likeOwner: string | undefined;
const counts = new Map<string, number>();
const mine = new Map<string, boolean>();
const checkedAt = new Map<string, number>();
const reactionIds = new Map<string, string>();
const toggles = new Map<string, Toggle>();
const checking = new Set<string>();
let likeVersion = 0;
const likeListeners = new Set<() => void>();
const emitLikes = () => {
  likeVersion++;
  likeListeners.forEach((l) => l());
};

const storeKey = (userId: string) => `fit.likes.${userId.replace(/[^A-Za-z0-9._-]/g, '_')}`;

function rememberLikes() {
  const owner = likeOwner;
  if (!owner) return;
  const ids = [...mine].filter(([, v]) => v).map(([id]) => id).slice(-REMEMBER);
  SecureStore.setItemAsync(storeKey(owner), JSON.stringify(ids)).catch(() => {});
}

/** Likes belong to one Whop account: a different sign-in starts clean and reads what this phone remembers for it. */
function ownLikes(userId: string | undefined) {
  if (userId === likeOwner) return;
  likeOwner = userId;
  mine.clear();
  checkedAt.clear();
  reactionIds.clear();
  toggles.clear();
  emitLikes();
  if (!userId) return;
  SecureStore.getItemAsync(storeKey(userId))
    .catch(() => null)
    .then((raw) => {
      if (likeOwner !== userId || !raw) return;
      try {
        // Only fills posts not yet checked against Whop; a check always wins.
        for (const id of JSON.parse(raw) as string[]) if (!mine.has(id)) mine.set(id, true);
        emitLikes();
      } catch {
        // Unreadable: Whop will tell us.
      }
    });
}

function setMine(postId: string, liked: boolean) {
  // Re-inserting keeps the newest likes last, so the remembered list keeps the most recent ones.
  mine.delete(postId);
  mine.set(postId, liked);
}

/** Whether you have liked one post, from its reactions on Whop (paged; most posts have one page). */
async function checkLike(postId: string, count: number, userId: string) {
  if (checking.has(postId)) return;
  checking.add(postId);
  const started = Date.now();
  try {
    let after: string | undefined;
    let found: string | undefined;
    for (let page = 0; page < 5 && !found; page++) {
      const res = await whop<{ data: { id: string; emoji: string | null; user: { id: string } | null }[]; page_info?: { end_cursor?: string | null; has_next_page?: boolean } }>(
        `/reactions?resource_id=${postId}&first=100${after ? `&after=${encodeURIComponent(after)}` : ''}`,
      );
      found = res.data.find((r) => r.user?.id === userId && (r.emoji === null || r.emoji === HEART))?.id;
      if (!res.page_info?.has_next_page || !res.page_info.end_cursor) break;
      after = res.page_info.end_cursor;
    }
    // A tap since the check started, or a different account, makes this answer stale.
    const t = toggles.get(postId);
    if (likeOwner !== userId || (t && t.at >= started)) return;
    setMine(postId, Boolean(found));
    if (found) reactionIds.set(postId, found);
    else reactionIds.delete(postId);
    checkedAt.set(postId, count);
    rememberLikes();
    emitLikes();
  } catch {
    // Try again on the next load.
  } finally {
    checking.delete(postId);
  }
}

/** Every feed load passes its posts through here: newest counts, settled taps, and a check of anything unchecked. */
function noteLikes(posts: WhopPost[], userId: string | undefined) {
  ownLikes(userId);
  const now = Date.now();
  const toCheck: [string, number][] = [];
  for (const p of posts) {
    counts.set(p.id, p.like_count);
    const t = toggles.get(p.id);
    if (t && t.done && (p.like_count !== t.base || now - t.at > HOLD_MS)) toggles.delete(p.id);
    if (toggles.has(p.id) || !userId) continue;
    if (p.like_count === 0) {
      setMine(p.id, false);
      reactionIds.delete(p.id);
      checkedAt.set(p.id, 0);
    } else if (checkedAt.get(p.id) !== p.like_count) {
      toCheck.push([p.id, p.like_count]);
    }
  }
  emitLikes();
  if (userId) {
    // A few at a time, so a fresh room does not fire forty requests at once.
    void (async () => {
      for (let i = 0; i < toCheck.length; i += 4) {
        await Promise.all(toCheck.slice(i, i + 4).map(([id, n]) => checkLike(id, n, userId)));
      }
    })();
  }
}

function likeOf(postId: string, fallback: number): { liked: boolean; likes: number } {
  const t = toggles.get(postId);
  if (t) return { liked: t.liked, likes: t.likes };
  return { liked: mine.get(postId) ?? false, likes: counts.get(postId) ?? fallback };
}

/** Whether you liked a post and how many likes it has, the same on every screen. */
export function useLike(post: Pick<Post, 'id' | 'likes'>): { liked: boolean; likes: number } {
  useSyncExternalStore(
    useCallback((l: () => void) => {
      likeListeners.add(l);
      return () => likeListeners.delete(l);
    }, []),
    () => likeVersion,
  );
  return likeOf(post.id, post.likes);
}

/** Like a post, or take the like back. Shows at once; undone if Whop says no. */
export async function toggleLike(postId: string) {
  const userId = currentAccount()?.userId;
  if (!userId) throw new WhopError(401, 'Sign in with Whop again.');
  ownLikes(userId);
  const t = toggles.get(postId);
  if (t && !t.done) return; // One request per post at a time.
  const before = likeOf(postId, counts.get(postId) ?? 0);
  const liked = !before.liked;
  const base = t ? t.base : (counts.get(postId) ?? before.likes);
  toggles.set(postId, { liked, likes: Math.max(0, before.likes + (liked ? 1 : -1)), base, done: false, at: Date.now() });
  emitLikes();
  try {
    if (liked) {
      const r = await whop<{ id?: string }>('/reactions', { method: 'POST', body: { resource_id: postId, emoji: HEART } });
      if (r.id) reactionIds.set(postId, r.id);
    } else {
      const id = reactionIds.get(postId);
      await whop(id ? `/reactions/${id}` : `/reactions/${postId}?emoji=${encodeURIComponent(HEART)}`, { method: 'DELETE' });
      reactionIds.delete(postId);
    }
    if (likeOwner !== userId) return;
    setMine(postId, liked);
    // Check again once the tap settles, in case the post was already liked elsewhere (on Whop, another phone).
    checkedAt.delete(postId);
    rememberLikes();
    const now = toggles.get(postId);
    if (now) toggles.set(postId, { ...now, done: true });
    emitLikes();
  } catch (e) {
    toggles.delete(postId);
    emitLikes();
    throw e;
  }
}

// ── Access ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Rooms are public forums, so signing in is enough to read. If Whop ever answers a post with "no access", this
 * opens the free "Fit communities" join page once; posting then works in every room.
 */
export async function joinOnWhop(): Promise<void> {
  await WebBrowser.openAuthSessionAsync(JOIN_URL, JOIN_RETURN);
}

export function needsMembership(e: unknown): boolean {
  return e instanceof WhopError && e.status === 403;
}

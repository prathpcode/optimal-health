import * as ImageManipulator from 'expo-image-manipulator';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import whopRooms from '../../data/whopRooms.json';
import { useWhopAccount, whopAccessToken } from './whop';

/**
 * Room chat on Whop. Every room is a Whop chat channel (data/whopRooms.json, created on the Fit business); one free
 * "Fit communities" membership opens them all. The phone reads and posts with the person's own Whop sign-in, so
 * every message, photo and reaction lives on Whop and appears there too. Nothing here is simulated.
 */

const API = 'https://api.whop.com/api/v1';
type RoomIds = { channelId: string; experienceId?: string | null };
const ROOMS = whopRooms as unknown as Record<string, RoomIds> & { _access: { productId: string; variantId: string } };

/** Whop's free join page for "Fit communities". One tap, once. */
export const JOIN_URL = `https://whop.com/checkout/${ROOMS._access.variantId}`;
const JOIN_RETURN = 'fitscanner://joined';

class WhopError extends Error {
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
export type SharedDish = { name: string; place?: string; reaction: Reaction };

export const REACTION_LINE: Record<Reaction, string> = { loved: 'Loved it', okay: 'It was okay', nope: 'Wouldn’t order again' };

/** A shared dish is ordinary Whop markdown, so it reads well on Whop too; the app parses it back into a card. */
function dishContent(dish: SharedDish, note: string): string {
  const head = `**${dish.name.replace(/\*/g, '')}**${dish.place ? ` · ${dish.place}` : ''}`;
  return [head, REACTION_LINE[dish.reaction], note.trim()].filter(Boolean).join('\n');
}

const DISH_RE = /^\*\*(.+?)\*\*(?: · (.+))?\n(Loved it|It was okay|Wouldn’t order again)(?:\n([\s\S]*))?$/;

function parseDish(content: string): { dish: SharedDish; note: string } | null {
  const m = DISH_RE.exec(content.trim());
  if (!m) return null;
  const reaction = (Object.keys(REACTION_LINE) as Reaction[]).find((r) => REACTION_LINE[r] === m[3])!;
  return { dish: { name: m[1], place: m[2] || undefined, reaction }, note: (m[4] ?? '').trim() };
}

// ── Messages ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type ChatPhoto = { url: string; width?: number; height?: number };

export type ChatReaction = { emoji: string; count: number; mine: boolean };

export type ChatMessage = {
  id: string;
  authorId: string;
  author: string;
  avatarUrl?: string;
  text: string;
  at: number;
  mine: boolean;
  photos: ChatPhoto[];
  dish?: SharedDish;
  reactions: ChatReaction[];
  /** Still sending from this phone. */
  pending?: boolean;
};

type WhopMessage = {
  id: string;
  content: string | null;
  created_at: string;
  author_user_id: string;
  author?: { id: string; username?: string | null; name?: string | null; profile_picture?: { url?: string | null } | null } | null;
  attachments?: { url?: string | null; width?: number | null; height?: number | null; content_type?: string | null }[];
  reaction_counts?: { kind?: string; value?: string; reacted?: boolean; user_count?: number }[];
  deleted_at?: string | null;
};

function toMessage(m: WhopMessage, meId: string | undefined): ChatMessage {
  const content = m.content ?? '';
  const parsed = parseDish(content);
  return {
    id: m.id,
    authorId: m.author_user_id,
    author: m.author?.name || m.author?.username || 'Member',
    avatarUrl: m.author?.profile_picture?.url ?? undefined,
    text: parsed ? parsed.note : content,
    at: Date.parse(m.created_at),
    mine: m.author_user_id === meId,
    photos: (m.attachments ?? [])
      .filter((a) => a.url && (a.content_type ?? 'image/').startsWith('image/'))
      .map((a) => ({ url: a.url!, width: a.width ?? undefined, height: a.height ?? undefined })),
    dish: parsed?.dish,
    reactions: (m.reaction_counts ?? [])
      .filter((r) => r.value && (r.user_count ?? 0) > 0)
      .map((r) => ({ emoji: r.value!, count: r.user_count ?? 0, mine: Boolean(r.reacted) })),
  };
}

// One cache per room so leaving and coming back is instant.
type RoomState = { messages: ChatMessage[]; loaded: boolean; error?: string };
const rooms = new Map<string, RoomState>();
const roomListeners = new Map<string, Set<() => void>>();
const emit = (slug: string) => roomListeners.get(slug)?.forEach((l) => l());
const setRoom = (slug: string, next: Partial<RoomState>) => {
  rooms.set(slug, { ...(rooms.get(slug) ?? { messages: [], loaded: false }), ...next });
  emit(slug);
};

async function refresh(slug: string, meId: string | undefined) {
  const channel = ROOMS[slug]?.channelId;
  if (!channel) return;
  try {
    const page = await whop<{ data: WhopMessage[] }>(`/messages?channel_id=${channel}&last=60&order=created_at&direction=asc`);
    const fresh = page.data.filter((m) => !m.deleted_at).map((m) => toMessage(m, meId));
    const pending = (rooms.get(slug)?.messages ?? []).filter((m) => m.pending);
    setRoom(slug, { messages: [...fresh.sort((a, b) => a.at - b.at), ...pending], loaded: true, error: undefined });
  } catch (e) {
    setRoom(slug, { loaded: true, error: e instanceof WhopError && e.status === 403 ? 'not_member' : e instanceof Error ? e.message : 'Could not reach Whop' });
  }
}

/** Photos shrink to at most 1600 px on the long side before upload. */
async function uploadPhoto(uri: string): Promise<string> {
  const small = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
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

export type Outgoing = { text?: string; photoUri?: string; dish?: SharedDish };

/**
 * Post to a room on Whop as the signed-in person: text, a photo, a shared dish, or any mix.
 * Shows at once on this phone and is replaced by Whop's copy on the next refresh.
 */
export async function postToRoom(slug: string, out: Outgoing, me: { id: string; name: string; avatarUrl?: string }) {
  const channel = ROOMS[slug]?.channelId;
  if (!channel) throw new Error('No such room');
  const text = out.dish ? dishContent(out.dish, out.text ?? '') : (out.text ?? '').trim();
  if (!text && !out.photoUri) return;
  const tempId = `pending_${Date.now()}`;
  const optimistic: ChatMessage = {
    id: tempId,
    authorId: me.id,
    author: me.name,
    avatarUrl: me.avatarUrl,
    text: out.dish ? (out.text ?? '').trim() : text,
    at: Date.now(),
    mine: true,
    photos: out.photoUri ? [{ url: out.photoUri }] : [],
    dish: out.dish,
    reactions: [],
    pending: true,
  };
  const state = rooms.get(slug) ?? { messages: [], loaded: false };
  setRoom(slug, { messages: [...state.messages, optimistic] });
  try {
    const attachments = out.photoUri ? [{ id: await uploadPhoto(out.photoUri) }] : undefined;
    await whop('/messages', { method: 'POST', body: { channel_id: channel, content: text, attachments } });
  } finally {
    setRoom(slug, { messages: (rooms.get(slug)?.messages ?? []).filter((m) => m.id !== tempId) });
    await refresh(slug, me.id);
  }
}

/** Add or remove your reaction. */
export async function toggleReaction(slug: string, messageId: string, emoji: string, meId: string) {
  const state = rooms.get(slug);
  const msg = state?.messages.find((m) => m.id === messageId);
  const mine = msg?.reactions.find((r) => r.emoji === emoji)?.mine;
  if (state && msg) {
    // Show it at once.
    const reactions = mine
      ? msg.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r)).filter((r) => r.count > 0)
      : msg.reactions.some((r) => r.emoji === emoji)
        ? msg.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r))
        : [...msg.reactions, { emoji, count: 1, mine: true }];
    setRoom(slug, { messages: state.messages.map((m) => (m.id === messageId ? { ...m, reactions } : m)) });
  }
  try {
    await whop(`/messages/${messageId}/${mine ? 'unreact' : 'react'}`, { method: 'POST', body: { emoji } });
  } finally {
    await refresh(slug, meId);
  }
}

/** A room's messages, refreshed from Whop every 4 s while the screen is open. */
export function useRoomChat(slug: string): RoomState & { refresh: () => void } {
  const { account } = useWhopAccount();
  const meId = account?.userId;
  const state = useSyncExternalStore(
    useCallback(
      (l: () => void) => {
        const set = roomListeners.get(slug) ?? new Set();
        set.add(l);
        roomListeners.set(slug, set);
        return () => set.delete(l);
      },
      [slug],
    ),
    () => rooms.get(slug) ?? EMPTY,
  );
  useEffect(() => {
    if (!meId) return;
    void refresh(slug, meId);
    const t = setInterval(() => void refresh(slug, meId), 4000);
    return () => clearInterval(t);
  }, [slug, meId]);
  return { ...state, refresh: () => void refresh(slug, meId) };
}
const EMPTY: RoomState = { messages: [], loaded: false };

/** Every photo shared in a room, newest first: the room's inspiration board. */
export function useRoomPhotos(slug: string): { photo: ChatPhoto; message: ChatMessage }[] {
  const { messages } = useRoomChat(slug);
  return useMemo(() => messages.flatMap((m) => m.photos.map((photo) => ({ photo, message: m }))).reverse(), [messages]);
}

// ── Access: the one free membership ──────────────────────────────────────────────────────────────────────────────

export type Access = 'signed_out' | 'checking' | 'member' | 'not_member';

let access: Access = 'checking';
const accessListeners = new Set<() => void>();
const setAccess = (a: Access) => {
  access = a;
  accessListeners.forEach((l) => l());
};

async function checkAccess(userId: string): Promise<Access> {
  const exp = ROOMS['heart-health']?.experienceId;
  try {
    const r = await whop<{ has_access: boolean }>(`/users/${userId}/access/${exp}`);
    setAccess(r.has_access ? 'member' : 'not_member');
  } catch {
    setAccess('not_member');
  }
  return access;
}

/** Whether the signed-in person can use the rooms on Whop, and the one-tap way in. */
export function useWhopAccess(): { access: Access; join: () => Promise<boolean>; recheck: () => void } {
  const { account } = useWhopAccount();
  const userId = account?.userId;
  const a = useSyncExternalStore(
    (l) => {
      accessListeners.add(l);
      return () => accessListeners.delete(l);
    },
    () => access,
  );
  useEffect(() => {
    if (userId) void checkAccess(userId);
  }, [userId]);
  const [, force] = useState(0);
  const join = useCallback(async () => {
    if (!userId) return false;
    await WebBrowser.openAuthSessionAsync(JOIN_URL, JOIN_RETURN);
    // Whop can take a moment to grant access after the free checkout.
    for (let i = 0; i < 6; i++) {
      if ((await checkAccess(userId)) === 'member') return true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    force((n) => n + 1);
    return false;
  }, [userId]);
  return { access: userId ? a : 'signed_out', join, recheck: () => userId && void checkAccess(userId) };
}

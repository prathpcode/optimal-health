/**
 * Likes on Whop posts, kept in one place so every screen shows the same heart.
 *
 * Whop's posts carry a like count but not whether *you* liked them, and the count can trail a tap. So:
 * - Whether you liked a post is read from the post's reactions on Whop (the only place that knows), once per
 *   session and again whenever the post's count changes. Until that answer arrives the heart shows what this phone
 *   remembers from last time.
 * - A tap shows at once and is sent in the background. Taps made while one is in flight are not dropped: the last
 *   one wins and is sent next.
 * - A tap is checked against Whop before it is sent, so liking a post you already liked elsewhere sends nothing.
 * - After Whop accepts a tap, a count or a reactions list that has not caught up yet cannot flip the heart back.
 *
 * No network or storage here: both are passed in, so this is tested as plain code (likes.test.ts).
 */

export type LikeApi = {
  /** One page of a post's reactions, and the cursor of the next page when there is one. */
  list(postId: string, after?: string): Promise<{ reactions: { id: string; userId?: string }[]; next?: string }>;
  /** Like a post. Resolves with the new reaction's id when Whop gives one. */
  add(postId: string): Promise<string | undefined>;
  /** Take a like back: by the reaction's id when it is known, else by the post's. */
  remove(target: { reactionId: string } | { postId: string }): Promise<void>;
};

export type LikeMemory = {
  read(userId: string): Promise<string[]>;
  write(userId: string, postIds: string[]): void;
};

export type LikeView = { liked: boolean; likes: number };

/** How long a tap's count is held when Whop's count has not moved. */
export const HOLD_MS = 20_000;
/** How long after Whop accepts a tap a reactions list that disagrees is treated as not caught up yet. */
export const SETTLE_MS = 15_000;
const MAX_PAGES = 10;
const REMEMBER = 80;
const PARALLEL = 4;

type Entry = {
  /** Whop's like count from the newest feed load; null when Whop gave none. */
  count: number | null | undefined;
  /** How many reactions the post has, when its list was read to the end. */
  listed?: number;
  /** Whether you liked it, as Whop last said (a read of its reactions, or an accepted tap). */
  liked?: boolean;
  reactionId?: string;
  /** Read from Whop this session, and the feed count at the time. */
  checked: boolean;
  checkedCount?: number | null;
  /** What was last tapped, until Whop has it. */
  want?: boolean;
  sending: boolean;
  tappedAt?: number;
  settledAt?: number;
  /** What was on screen before the taps began, so the count moves by exactly one. */
  hold?: { count: number; liked: boolean; feed: number | null | undefined };
};

export function createLikes(api: LikeApi, memory: LikeMemory, opts: { now?: () => number; onError?: (e: unknown) => void } = {}) {
  const now = opts.now ?? Date.now;
  let owner: string | undefined;
  const entries = new Map<string, Entry>();
  const views = new Map<string, { version: number; fallback: number | null | undefined; value: LikeView }>();
  const remembered = new Set<string>();
  const queue: string[] = [];
  const reading = new Map<string, Promise<void>>();
  let active = 0;
  let version = 0;
  const listeners = new Set<() => void>();
  const emit = () => {
    version++;
    listeners.forEach((l) => l());
  };

  const entry = (postId: string): Entry => {
    let e = entries.get(postId);
    if (!e) {
      e = { count: undefined, checked: false, sending: false };
      entries.set(postId, e);
    }
    return e;
  };

  function remember(postId: string, liked: boolean) {
    if (!owner) return;
    const had = remembered.has(postId);
    if (liked === had) return;
    if (liked) remembered.add(postId);
    else remembered.delete(postId);
    memory.write(owner, [...remembered].slice(-REMEMBER));
  }

  /** Likes belong to one Whop account: a different sign-in starts clean, from what this phone remembers for it. */
  function own(userId: string | undefined) {
    if (userId === owner) return;
    owner = userId;
    entries.clear();
    views.clear();
    remembered.clear();
    queue.length = 0;
    emit();
    if (!userId) return;
    memory
      .read(userId)
      .catch(() => [] as string[])
      .then((ids) => {
        if (owner !== userId) return;
        // What Whop has already said this session wins over what the phone remembers.
        for (const id of ids) if (entries.get(id)?.liked !== false) remembered.add(id);
        emit();
      });
  }

  function compute(postId: string, fallback: number | null | undefined): LikeView {
    const e = entries.get(postId);
    if (!e) return { liked: remembered.has(postId), likes: fallback ?? 0 };
    const liked = e.want ?? e.liked ?? remembered.has(postId);
    if (e.hold) return { liked, likes: Math.max(0, e.hold.count + (liked ? 1 : 0) - (e.hold.liked ? 1 : 0)) };
    // Your own like is always counted, even before Whop's count shows it.
    return { liked, likes: Math.max(e.count ?? e.listed ?? fallback ?? 0, liked ? 1 : 0) };
  }

  /**
   * What a screen draws. The same object is handed back until the answer really changes, which is what lets a
   * screen subscribe to it directly (useSyncExternalStore needs a cached snapshot) and re-render the moment a tap
   * lands rather than when the next feed load happens to bring a new count.
   */
  function view(postId: string, fallback: number | null | undefined): LikeView {
    const hit = views.get(postId);
    if (hit && hit.version === version && hit.fallback === fallback) return hit.value;
    const fresh = compute(postId, fallback);
    const value = hit && hit.value.liked === fresh.liked && hit.value.likes === fresh.likes ? hit.value : fresh;
    views.set(postId, { version, fallback, value });
    return value;
  }

  /** Your reaction on a post, from Whop. `total` only when the list was read to its end. */
  async function read(postId: string, userId: string): Promise<{ mine?: string; total?: number }> {
    let after: string | undefined;
    let total = 0;
    let mine: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await api.list(postId, after);
      total += res.reactions.length;
      mine ??= res.reactions.find((r) => r.userId === userId)?.id;
      if (!res.next) return { mine, total };
      after = res.next;
    }
    return { mine };
  }

  /** A background read: applied unless a tap got there first, or Whop has plainly not caught up with one. */
  function check(postId: string, userId: string): Promise<void> {
    const running = reading.get(postId);
    if (running) return running;
    const started = now();
    const feed = entries.get(postId)?.count;
    const p = (async () => {
      try {
        const res = await read(postId, userId);
        const e = entries.get(postId);
        if (owner !== userId || !e) return;
        if (e.sending || e.want !== undefined || (e.tappedAt !== undefined && e.tappedAt >= started)) return;
        const liked = Boolean(res.mine);
        if (e.settledAt !== undefined && e.liked !== undefined && liked !== e.liked && started < e.settledAt + SETTLE_MS) return;
        e.liked = liked;
        e.reactionId = res.mine;
        e.checked = true;
        e.checkedCount = feed;
        if (res.total !== undefined) e.listed = res.total;
        remember(postId, liked);
        emit();
      } catch (err) {
        opts.onError?.(err); // Left unchecked: the next feed load tries again.
      } finally {
        reading.delete(postId);
      }
    })();
    reading.set(postId, p);
    return p;
  }

  function pump(userId: string) {
    while (active < PARALLEL && queue.length) {
      const id = queue.shift()!;
      active++;
      void check(id, userId).finally(() => {
        active--;
        if (owner === userId) pump(userId);
      });
    }
  }

  /** Every feed load passes its posts through here: newest counts, settled taps, and a read of anything not yet read. */
  function seen(posts: { id: string; count: number | null }[], userId: string | undefined) {
    own(userId);
    const t = now();
    for (const p of posts) {
      const e = entry(p.id);
      e.count = p.count;
      const idle = !e.sending && e.want === undefined;
      if (e.hold && idle && (e.count !== e.hold.feed || t - (e.settledAt ?? 0) > HOLD_MS)) e.hold = undefined;
      if (!userId || !idle) continue;
      if (e.count === 0 && !(e.liked ?? remembered.has(p.id))) {
        // Nobody has liked it, so neither have you: no need to ask.
        e.liked = false;
        e.reactionId = undefined;
        e.checked = true;
        e.checkedCount = 0;
      } else if ((!e.checked || e.checkedCount !== e.count) && !queue.includes(p.id) && !reading.has(p.id)) {
        queue.push(p.id);
      }
    }
    emit();
    if (userId) pump(userId);
  }

  /** Send taps until Whop has what was last tapped. */
  async function run(postId: string, userId: string) {
    const e = entry(postId);
    e.sending = true;
    try {
      while (e.want !== undefined) {
        const want = e.want;
        if (!e.checked) {
          // Never read this session: find out where Whop stands before changing it.
          try {
            const res = await read(postId, userId);
            e.liked = Boolean(res.mine);
            e.reactionId = res.mine;
            e.checked = true;
            e.checkedCount = e.count;
            if (res.total !== undefined) e.listed = res.total;
            if (e.hold) e.hold.liked = e.liked;
          } catch (err) {
            opts.onError?.(err); // Go by what the phone knows.
          }
          if (owner !== userId) return;
        }
        const current = e.liked ?? remembered.has(postId);
        if (current !== want) {
          if (want) e.reactionId = await api.add(postId);
          else {
            await api.remove(e.reactionId ? { reactionId: e.reactionId } : { postId });
            e.reactionId = undefined;
          }
          if (owner !== userId) return;
          e.liked = want;
          e.settledAt = now();
        }
        remember(postId, want);
        if (e.want === want) e.want = undefined;
      }
    } catch (err) {
      // Whop said no: back to what it last told us, and read it again on the next load.
      e.want = undefined;
      e.hold = undefined;
      e.checked = false;
      throw err;
    } finally {
      e.sending = false;
      emit();
    }
  }

  /** Like a post, or take the like back. Shows at once; rejects (and goes back) if Whop refuses. */
  function toggle(postId: string, userId: string): Promise<void> {
    own(userId);
    const e = entry(postId);
    const shown = view(postId, 0);
    if (!e.hold) e.hold = { count: shown.likes, liked: shown.liked, feed: e.count };
    e.want = !shown.liked;
    e.tappedAt = now();
    emit();
    return e.sending ? Promise.resolve() : run(postId, userId);
  }

  return {
    seen,
    toggle,
    view,
    version: () => version,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

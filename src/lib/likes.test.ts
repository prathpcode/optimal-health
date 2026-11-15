import { describe, expect, it } from 'vitest';

import { createLikes, HOLD_MS, SETTLE_MS, type LikeApi, type LikeMemory } from './likes';

const ME = 'user_me';
const POST = 'post_1';

/** A stand-in for Whop: reactions per post, a like count that can trail them, and a log of every call. */
function fakeWhop() {
  const reactions = new Map<string, { id: string; userId: string }[]>();
  const shownCount = new Map<string, number | null>();
  const calls: string[] = [];
  let n = 0;
  let failNext: Error | null = null;
  let listLag = false;
  let pageSize = 100;
  let gate: Promise<void> | null = null;
  let openGate = () => {};
  const of = (postId: string) => reactions.get(postId) ?? [];
  const api: LikeApi = {
    async list(postId, after) {
      calls.push(`list ${postId}`);
      if (gate) await gate;
      const all = listLag ? of(postId).filter((r) => r.userId !== ME) : of(postId);
      const start = after ? Number(after) : 0;
      const page = all.slice(start, start + pageSize);
      return { reactions: page, next: start + pageSize < all.length ? String(start + pageSize) : undefined };
    },
    async add(postId) {
      calls.push(`add ${postId}`);
      if (failNext) {
        const e = failNext;
        failNext = null;
        throw e;
      }
      const id = `reac_${++n}`;
      reactions.set(postId, [...of(postId), { id, userId: ME }]);
      return id;
    },
    async remove(target) {
      calls.push('reactionId' in target ? `remove ${target.reactionId}` : `remove-by-post ${target.postId}`);
      for (const [postId, list] of reactions) {
        reactions.set(postId, list.filter((r) => ('reactionId' in target ? r.id !== target.reactionId : !(postId === target.postId && r.userId === ME))));
      }
    },
  };
  return {
    api,
    calls,
    /** Someone else's like, or yours made somewhere else. */
    likeAs(postId: string, userId: string) {
      reactions.set(postId, [...of(postId), { id: `reac_${++n}`, userId }]);
    },
    /** What a feed load returns: the real count, unless the count has been left trailing. */
    feed(postId: string) {
      return [{ id: postId, count: shownCount.has(postId) ? shownCount.get(postId)! : of(postId).length }];
    },
    trailCountAt(postId: string, count: number | null) {
      shownCount.set(postId, count);
    },
    countCatchesUp(postId: string) {
      shownCount.delete(postId);
    },
    failNextAdd(e: Error) {
      failNext = e;
    },
    lagList(on: boolean) {
      listLag = on;
    },
    /** Whop takes its time answering reads, until `answerReads`. */
    holdReads() {
      gate = new Promise((r) => (openGate = r));
    },
    answerReads() {
      openGate();
      gate = null;
    },
    setPageSize(size: number) {
      pageSize = size;
    },
    has(postId: string) {
      return of(postId).some((r) => r.userId === ME);
    },
  };
}

function fakeMemory() {
  const stored = new Map<string, string[]>();
  const memory: LikeMemory = {
    read: async (userId) => stored.get(userId) ?? [],
    write: (userId, ids) => void stored.set(userId, ids),
  };
  return { memory, stored };
}

/** Let every promise already queued run. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function setup() {
  const whop = fakeWhop();
  const mem = fakeMemory();
  let time = 1_000_000;
  const clock = { now: () => time, advance: (ms: number) => (time += ms) };
  const open = () => createLikes(whop.api, mem.memory, { now: clock.now });
  return { whop, mem, clock, open, likes: open() };
}

describe('likes', () => {
  it('shows a tap at once and keeps it through a feed load that has not counted it yet', async () => {
    const { whop, likes } = setup();
    likes.seen(whop.feed(POST), ME);
    await settle();
    expect(likes.view(POST, 0)).toEqual({ liked: false, likes: 0 });

    whop.trailCountAt(POST, 0);
    const sent = likes.toggle(POST, ME);
    expect(likes.view(POST, 0)).toEqual({ liked: true, likes: 1 });
    await sent;
    expect(whop.has(POST)).toBe(true);

    likes.seen(whop.feed(POST), ME); // Whop still says 0.
    await settle();
    expect(likes.view(POST, 0)).toEqual({ liked: true, likes: 1 });

    whop.countCatchesUp(POST);
    likes.seen(whop.feed(POST), ME);
    await settle();
    expect(likes.view(POST, 0)).toEqual({ liked: true, likes: 1 }); // Counted once, not twice.
  });

  it('still shows the heart after Whop’s count stays behind for a long time', async () => {
    const { whop, likes, clock } = setup();
    likes.seen(whop.feed(POST), ME);
    whop.trailCountAt(POST, 0);
    await likes.toggle(POST, ME);
    clock.advance(HOLD_MS + SETTLE_MS + 1);
    likes.seen(whop.feed(POST), ME);
    await settle();
    expect(likes.view(POST, 0)).toEqual({ liked: true, likes: 1 });
  });

  it('is not flipped back by a reactions list that has not caught up', async () => {
    const { whop, likes, clock } = setup();
    whop.likeAs(POST, 'user_other');
    likes.seen(whop.feed(POST), ME);
    await settle();
    await likes.toggle(POST, ME);
    whop.lagList(true);
    likes.seen(whop.feed(POST), ME); // Count moved to 2, list does not show you yet.
    await settle();
    expect(likes.view(POST, 0)).toEqual({ liked: true, likes: 2 });
    whop.lagList(false);
    clock.advance(SETTLE_MS + 1);
    likes.seen(whop.feed(POST), ME);
    await settle();
    expect(likes.view(POST, 0)).toEqual({ liked: true, likes: 2 });
  });

  it('remembers your likes across a restart, then confirms them with Whop', async () => {
    const { whop, likes, open } = setup();
    whop.likeAs(POST, 'user_other');
    likes.seen(whop.feed(POST), ME);
    await settle();
    await likes.toggle(POST, ME);

    const reopened = open(); // The app was closed and opened again.
    whop.holdReads(); // Before Whop has answered anything...
    reopened.seen(whop.feed(POST), ME);
    await settle();
    expect(reopened.view(POST, 2)).toEqual({ liked: true, likes: 2 }); // ...the heart is there from memory.
    whop.answerReads();
    await settle();
    reopened.seen(whop.feed(POST), ME);
    await settle();
    expect(reopened.view(POST, 2)).toEqual({ liked: true, likes: 2 });
  });

  it('finds a like made somewhere else (another phone, whop.com)', async () => {
    const { whop, likes } = setup();
    whop.likeAs(POST, ME);
    likes.seen(whop.feed(POST), ME);
    await settle();
    expect(likes.view(POST, 1)).toEqual({ liked: true, likes: 1 });
  });

  it('drops a remembered like that was taken back somewhere else', async () => {
    const { whop, mem, open } = setup();
    mem.stored.set(ME, [POST]);
    whop.likeAs(POST, 'user_other');
    const likes = open();
    likes.seen(whop.feed(POST), ME);
    await settle();
    expect(likes.view(POST, 1)).toEqual({ liked: false, likes: 1 });
    expect(mem.stored.get(ME)).toEqual([]);
  });

  it('takes a like back by its reaction id, and forgets it', async () => {
    const { whop, mem, likes } = setup();
    likes.seen(whop.feed(POST), ME);
    await settle();
    await likes.toggle(POST, ME);
    expect(mem.stored.get(ME)).toEqual([POST]);
    await likes.toggle(POST, ME);
    expect(likes.view(POST, 0)).toEqual({ liked: false, likes: 0 });
    expect(whop.has(POST)).toBe(false);
    expect(whop.calls.filter((c) => c.startsWith('remove'))).toEqual(['remove reac_1']);
    expect(mem.stored.get(ME)).toEqual([]);
  });

  it('takes back a like found on Whop after a restart', async () => {
    const { whop, likes } = setup();
    whop.likeAs(POST, ME);
    likes.seen(whop.feed(POST), ME);
    await settle();
    await likes.toggle(POST, ME);
    expect(whop.has(POST)).toBe(false);
    expect(likes.view(POST, 1)).toEqual({ liked: false, likes: 0 });
  });

  it('does not like twice when the post was already liked before Whop could be read', async () => {
    const { whop, likes } = setup();
    whop.likeAs(POST, ME);
    likes.seen(whop.feed(POST), ME);
    const sent = likes.toggle(POST, ME); // Tapped before the first read came back: the heart looked empty.
    await sent;
    await settle();
    expect(whop.calls.filter((c) => c.startsWith('add'))).toEqual([]);
    expect(likes.view(POST, 1)).toEqual({ liked: true, likes: 1 });
  });

  it('goes back and reports it when Whop refuses', async () => {
    const { whop, likes } = setup();
    likes.seen(whop.feed(POST), ME);
    await settle();
    whop.failNextAdd(new Error('No access'));
    await expect(likes.toggle(POST, ME)).rejects.toThrow('No access');
    expect(likes.view(POST, 0)).toEqual({ liked: false, likes: 0 });
    await likes.toggle(POST, ME); // And works the next time.
    expect(likes.view(POST, 0)).toEqual({ liked: true, likes: 1 });
  });

  it('ends on the last tap when tapped twice quickly', async () => {
    const { whop, likes } = setup();
    likes.seen(whop.feed(POST), ME);
    await settle();
    const first = likes.toggle(POST, ME);
    void likes.toggle(POST, ME);
    expect(likes.view(POST, 0)).toEqual({ liked: false, likes: 0 });
    await first;
    await settle();
    expect(whop.has(POST)).toBe(false);
    expect(likes.view(POST, 0)).toEqual({ liked: false, likes: 0 });
  });

  it('hands back the same view until it changes, and a new one the moment it does', async () => {
    const { whop, likes } = setup();
    likes.seen(whop.feed(POST), ME);
    await settle();
    const before = likes.view(POST, 0);
    // A screen that re-renders for its own reasons must not be told anything changed.
    expect(likes.view(POST, 0)).toBe(before);
    likes.seen(whop.feed(POST), ME);
    await settle();
    expect(likes.view(POST, 0)).toBe(before);

    const sent = likes.toggle(POST, ME);
    const after = likes.view(POST, 0);
    expect(after).not.toBe(before);
    expect(after).toEqual({ liked: true, likes: 1 });
    await sent;
  });

  it('shows the same state to every screen and tells them when it changes', async () => {
    const { whop, likes } = setup();
    let told = 0;
    likes.subscribe(() => told++);
    likes.seen(whop.feed(POST), ME); // A room.
    likes.seen(whop.feed(POST), ME); // Latest on Together.
    await settle();
    const before = told;
    await likes.toggle(POST, ME);
    expect(told).toBeGreaterThan(before);
    expect(likes.view(POST, 0)).toEqual({ liked: true, likes: 1 });
  });

  it('counts likes from the reactions when Whop gives no count', async () => {
    const { whop, likes } = setup();
    whop.likeAs(POST, 'user_a');
    whop.likeAs(POST, ME);
    whop.trailCountAt(POST, null);
    likes.seen(whop.feed(POST), ME);
    await settle();
    expect(likes.view(POST, null)).toEqual({ liked: true, likes: 2 });
  });

  it('reads past the first page of reactions', async () => {
    const { whop, likes } = setup();
    whop.setPageSize(2);
    for (const u of ['a', 'b', 'c', 'd']) whop.likeAs(POST, `user_${u}`);
    whop.likeAs(POST, ME);
    likes.seen(whop.feed(POST), ME);
    await settle();
    expect(likes.view(POST, 5)).toEqual({ liked: true, likes: 5 });
  });

  it('does not ask Whop again while nothing has changed', async () => {
    const { whop, likes } = setup();
    whop.likeAs(POST, 'user_other');
    likes.seen(whop.feed(POST), ME);
    await settle();
    likes.seen(whop.feed(POST), ME);
    likes.seen(whop.feed(POST), ME);
    await settle();
    expect(whop.calls).toEqual([`list ${POST}`]);
  });

  it('keeps one account’s likes away from the next', async () => {
    const { whop, likes } = setup();
    likes.seen(whop.feed(POST), ME);
    await settle();
    await likes.toggle(POST, ME);
    likes.seen(whop.feed(POST), 'user_other');
    await settle();
    expect(likes.view(POST, 1)).toEqual({ liked: false, likes: 1 });
  });
});

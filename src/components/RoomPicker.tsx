import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, useReducedMotion } from 'react-native-reanimated';

import { celebrate } from '@/lib/celebrate';
import { joinRoom, type RoomView } from '@/lib/community';
import { enterAt, gutter, radius, space, spring, useTheme } from '@/theme';
import { RoomRow } from './community';
import { Icon } from './Icon';
import { T } from './T';
import { attempt, GlassAction, RoomStatus } from './together';

/** Join each ticked room, then celebrate. Resolves to how many joined. */
export async function joinRooms(slugs: string[]): Promise<number> {
  let joined = 0;
  for (const slug of slugs) if (await attempt(joinRoom(slug))) joined++;
  if (joined) celebrate({ title: joined === 1 ? 'You’re in' : `${joined} rooms joined`, tone: 'great' });
  return joined;
}

/**
 * Which rooms are ticked. Until the person taps one, the ticks follow `initial` (matching rooms), so they appear
 * even if the rooms load after the screen first draws.
 */
export function usePickedRooms(rooms: RoomView[], initial: string[] = []) {
  const [mine, setMine] = useState<string[] | null>(null);
  const base = mine ?? initial;
  // Only rooms still in the list count (one joined meanwhile drops out).
  const picked = base.filter((s) => rooms.some((r) => r.slug === s));
  const toggle = (slug: string) => setMine((m) => {
    const cur = (m ?? initial).filter((s) => rooms.some((r) => r.slug === s));
    return cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug];
  });
  return { picked, toggle, clear: () => setMine([]) };
}

/** Rooms with a checkbox each. Pair with JoinBar, pinned to the bottom of the screen. */
export function RoomChecklist({ rooms, picked, onToggle }: { rooms: RoomView[]; picked: string[]; onToggle: (slug: string) => void }) {
  const reduced = useReducedMotion();
  return (
    <View style={{ gap: space.sm + 2 }}>
      {rooms.map((r, i) => (
        <Animated.View key={r.slug} entering={enterAt(i, reduced)}>
          <RoomRow
            room={r}
            detail={r.reasons.length ? <Recommended reason={r.reasons[0]} /> : <RoomStatus room={r} />}
            onPress={() => onToggle(r.slug)}
            trailing={<Check on={picked.includes(r.slug)} />}
          />
        </Animated.View>
      ))}
    </View>
  );
}

/**
 * The big Join button, pinned to the bottom of the screen so nobody scrolls to find it. Put it outside the scroll
 * view. With `hideWhenEmpty`, it slides in once a room is ticked.
 */
export function JoinBar({
  picked,
  onJoin,
  verb = 'Join',
  bottom,
  hideWhenEmpty,
}: {
  picked: string[];
  onJoin: (slugs: string[]) => Promise<void>;
  /** "Join", or "Sign in and join" before signing in. */
  verb?: string;
  /** Distance from the bottom of the screen. */
  bottom: number;
  hideWhenEmpty?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  if (hideWhenEmpty && !picked.length) return null;
  const join = async () => {
    setBusy(true);
    try {
      await onJoin(picked);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Animated.View entering={FadeInDown.springify().damping(spring.gentle.damping)} exiting={FadeOutDown} style={[styles.bar, { bottom }]}>
      <GlassAction
        label={picked.length === 0 ? 'Tick the rooms you want' : `${verb} ${picked.length === 1 ? '1 room' : `${picked.length} rooms`}`}
        icon="plus"
        onPress={join}
        loading={busy}
        disabled={!picked.length}
      />
    </Animated.View>
  );
}

/** A room that matches an allergy, condition or diet in your profile. */
function Recommended({ reason }: { reason: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.rec}>
      <View style={[styles.recPill, { backgroundColor: c.goodSoft }]}>
        <T variant="caption" color={c.good}>
          Recommended
        </T>
      </View>
      <T variant="caption" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
        {reason}
      </T>
    </View>
  );
}

function Check({ on }: { on: boolean }) {
  const { c } = useTheme();
  return (
    <View
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={[styles.check, on ? { backgroundColor: c.primary, borderColor: c.primary } : { borderColor: c.textTertiary }]}>
      {on ? <Icon name="check" size={14} color={c.onPrimary} weight="bold" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: gutter, right: gutter },
  rec: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  recPill: { paddingHorizontal: space.sm, paddingVertical: 1, borderRadius: radius.chip },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});

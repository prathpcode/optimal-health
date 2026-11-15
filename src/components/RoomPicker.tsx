import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { celebrate } from '@/lib/celebrate';
import { joinRoom, type RoomView } from '@/lib/community';
import { enterAt, space, useTheme } from '@/theme';
import { RoomRow } from './community';
import { Icon } from './Icon';
import { attempt, GlassAction, RoomStatus } from './together';

/** Join each ticked room, then celebrate. Resolves to how many joined. */
export async function joinRooms(slugs: string[]): Promise<number> {
  let joined = 0;
  for (const slug of slugs) if (await attempt(joinRoom(slug))) joined++;
  if (joined) celebrate({ title: joined === 1 ? 'You’re in' : `${joined} rooms joined`, tone: 'great' });
  return joined;
}

/**
 * Rooms with a checkbox each and one big Join button under them, so several rooms are joined in one go.
 * `initial` starts some ticked (rooms that match your profile).
 */
export function RoomPicker({
  rooms,
  initial = [],
  onJoin,
  verb = 'Join',
}: {
  rooms: RoomView[];
  initial?: string[];
  onJoin: (slugs: string[]) => Promise<void>;
  /** "Join", or "Sign in and join" before signing in. */
  verb?: string;
}) {
  const reduced = useReducedMotion();
  const [picked, setPicked] = useState<string[]>(initial.filter((s) => rooms.some((r) => r.slug === s)));
  const [busy, setBusy] = useState(false);
  const toggle = (slug: string) => setPicked((p) => (p.includes(slug) ? p.filter((x) => x !== slug) : [...p, slug]));

  const join = async () => {
    setBusy(true);
    try {
      await onJoin(picked);
      setPicked([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.sm + 2 }}>
      {rooms.map((r, i) => (
        <Animated.View key={r.slug} entering={enterAt(i, reduced)}>
          <RoomRow room={r} detail={<RoomStatus room={r} />} onPress={() => toggle(r.slug)} trailing={<Check on={picked.includes(r.slug)} />} />
        </Animated.View>
      ))}
      <View style={{ marginTop: space.sm }}>
        <GlassAction
          label={picked.length === 0 ? 'Tick the rooms you want' : `${verb} ${picked.length === 1 ? '1 room' : `${picked.length} rooms`}`}
          icon="plus"
          onPress={join}
          loading={busy}
          disabled={!picked.length}
        />
      </View>
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
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});

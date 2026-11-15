import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoomRow } from '@/components/community';
import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { attempt, GlassAction, RoomStatus } from '@/components/together';
import { celebrate } from '@/lib/celebrate';
import { joinRoom, useTogether } from '@/lib/community';
import { enterAt, gutter, space, useTheme } from '@/theme';

/** Every room you're not in yet. Tick as many as you like, then join them all at once. */
export default function RoomsSheet() {
  const { all } = useTogether();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  // Rooms that match your profile first.
  const rooms = all.filter((r) => !r.joined).sort((a, b) => b.reasons.length - a.reasons.length);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (slug: string) => setPicked((p) => (p.includes(slug) ? p.filter((x) => x !== slug) : [...p, slug]));

  const join = async () => {
    setBusy(true);
    let joined = 0;
    for (const slug of picked) if (await attempt(joinRoom(slug))) joined++;
    setBusy(false);
    if (!joined) return;
    celebrate({ title: joined === 1 ? 'You’re in' : `${joined} rooms joined`, tone: 'great' });
    router.back();
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + 62 + space.xxxl, gap: space.xl }} showsVerticalScrollIndicator={false}>
        <T variant="heroBold">More rooms</T>
        {rooms.length === 0 ? (
          <T tone="secondary">You’re in every room.</T>
        ) : (
          <View style={{ gap: space.sm + 2 }}>
            {rooms.map((r, i) => (
              <Animated.View key={r.slug} entering={enterAt(i, reduced)}>
                <RoomRow room={r} detail={<RoomStatus room={r} />} onPress={() => toggle(r.slug)} trailing={<Check on={picked.includes(r.slug)} />} />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
      {rooms.length ? (
        <View style={[styles.cta, { bottom: insets.bottom + space.md }]}>
          <GlassAction
            label={picked.length === 0 ? 'Pick rooms to join' : picked.length === 1 ? 'Join 1 room' : `Join ${picked.length} rooms`}
            icon="plus"
            onPress={join}
            loading={busy}
            disabled={!picked.length}
          />
        </View>
      ) : null}
    </View>
  );
}

function Check({ on }: { on: boolean }) {
  const { c } = useTheme();
  return (
    <View
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={[styles.check, on ? { backgroundColor: c.primary, borderColor: c.primary } : { borderColor: c.hairline }]}>
      {on ? <Icon name="check" size={14} color={c.onPrimary} weight="bold" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  cta: { position: 'absolute', left: gutter, right: gutter },
});

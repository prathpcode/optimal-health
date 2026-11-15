import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Divider, RoomRow } from '@/components/community';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { Card } from '@/components/ui';
import { useTogether, type RoomView } from '@/lib/community';
import { enterAt, radius, space, useTheme } from '@/theme';

/** Every room you are not in yet. */
export default function RoomsSheet() {
  const { all } = useTogether();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const rooms = all.filter((r) => !r.joined);

  return (
    <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.xxxl, gap: space.xl }} showsVerticalScrollIndicator={false}>
      <T variant="title">More rooms</T>
      {rooms.length === 0 ? (
        <T tone="secondary">You’re in every room.</T>
      ) : (
        <Animated.View entering={enterAt(0, reduced)}>
          <Card style={styles.list}>
            {rooms.map((r, n) => (
              <View key={r.slug}>
                {n ? <Divider /> : null}
                <RoomRow room={r} trailing={<JoinPill room={r} />} onPress={() => open(r)} />
              </View>
            ))}
          </Card>
        </Animated.View>
      )}
    </ScrollView>
  );
}

const open = (r: RoomView) => router.replace({ pathname: '/join/[slug]', params: { slug: r.slug } });

function JoinPill({ room }: { room: RoomView }) {
  const { c } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`Join ${room.title}`} feedback="tap" onPress={() => open(room)} style={[styles.pill, { backgroundColor: c.primary }]}>
      <T variant="caption" color={c.onPrimary}>
        Join
      </T>
    </Tap>
  );
}

const styles = StyleSheet.create({
  list: { padding: 0, paddingVertical: space.xs, overflow: 'hidden' },
  pill: { paddingHorizontal: space.md + 2, paddingVertical: 6, borderRadius: radius.chip },
});

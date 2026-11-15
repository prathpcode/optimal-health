import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoomRow } from '@/components/community';
import { T } from '@/components/T';
import { RoomStatus } from '@/components/together';
import { useTogether } from '@/lib/community';
import { enterAt, radius, space, useTheme } from '@/theme';

/** Every room you are not in yet. */
export default function RoomsSheet() {
  const { all } = useTogether();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const rooms = all.filter((r) => !r.joined);

  return (
    <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.xxxl, gap: space.xl }} showsVerticalScrollIndicator={false}>
      <T variant="heroBold">More rooms</T>
      {rooms.length === 0 ? (
        <T tone="secondary">You’re in every room.</T>
      ) : (
        <View style={{ gap: space.sm + 2 }}>
          {rooms.map((r, i) => (
            <Animated.View key={r.slug} entering={enterAt(i, reduced)}>
              <RoomRow
                room={r}
                detail={<RoomStatus room={r} />}
                onPress={() => router.replace({ pathname: '/join/[slug]', params: { slug: r.slug } })}
                trailing={
                  <View style={[styles.pill, { backgroundColor: c.primary }]}>
                    <T variant="caption" color={c.onPrimary}>
                      Join
                    </T>
                  </View>
                }
              />
            </Animated.View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: space.md + 2, paddingVertical: 6, borderRadius: radius.chip },
});

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoomIcon } from '@/components/community';
import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { attempt, GlassAction, RoomStatus } from '@/components/together';
import { joinRoom, useRoom } from '@/lib/community';
import { space, useTheme } from '@/theme';

/** Add a room to yours by hand. */
export default function JoinSheet() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { room } = useRoom(slug);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  if (!room) return null;

  const join = async () => {
    setBusy(true);
    const ok = await attempt(joinRoom(room.slug));
    setBusy(false);
    if (ok) router.replace({ pathname: '/community/[slug]', params: { slug: room.slug } });
  };

  return (
    <View style={{ padding: space.xxl, paddingBottom: insets.bottom + space.xl, gap: space.xxl }}>
      <View style={styles.head}>
        <RoomIcon icon={room.icon} slug={room.slug} size={64} />
        <View style={{ flex: 1, gap: 4 }}>
          <T variant="heroBold" numberOfLines={2} style={{ fontSize: 28, lineHeight: 34 }}>
            {room.title}
          </T>
          <RoomStatus room={room} />
        </View>
      </View>
      <T tone="secondary">{room.blurb}</T>
      <View style={{ gap: space.md }}>
        <GlassAction label="Join room" onPress={join} loading={busy} />
        <View style={styles.privacy}>
          <Icon name="lock" size={12} color={c.textTertiary} />
          <T variant="caption" tone="tertiary">
            Your profile stays private.
          </T>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
});

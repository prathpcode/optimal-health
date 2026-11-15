import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoomIcon } from '@/components/community';
import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { attempt } from '@/components/together';
import { Button } from '@/components/ui';
import { joinRoom, useRoom } from '@/lib/community';
import { space, useTheme } from '@/theme';

/** Join a room by hand. */
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
      <View style={{ gap: space.lg, alignItems: 'center' }}>
        <RoomIcon icon={room.icon} slug={room.slug} size={72} />
        <View style={{ gap: space.xs, alignItems: 'center' }}>
          <T variant="title">{room.title}</T>
          <T tone="secondary">{room.members.toLocaleString()} members</T>
        </View>
      </View>
      <View style={{ gap: space.md }}>
        <Button label="Join" onPress={join} loading={busy} />
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
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
});

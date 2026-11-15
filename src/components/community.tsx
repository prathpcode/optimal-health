import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { initials, type RoomView } from '@/lib/community';
import { radius, roomAccent, space, useTheme } from '@/theme';
import { GlassSurface } from './Glass';
import { Icon, type IconName } from './Icon';
import { T } from './T';
import { Tap } from './Tap';

export function Avatar({ name, url, size = 32 }: { name: string; url?: string; size?: number }) {
  const { c } = useTheme();
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (url) return <Image source={{ uri: url }} style={box} contentFit="cover" accessibilityIgnoresInvertColors />;
  return (
    <View style={[box, styles.center, { backgroundColor: c.cardMuted }]}>
      <T variant="caption" tone="secondary" style={{ fontSize: Math.max(10, size * 0.36), lineHeight: size * 0.5 }}>
        {initials(name)}
      </T>
    </View>
  );
}

/** A room's icon on its accent colour. */
export function RoomIcon({ icon, size = 52, slug }: { icon: string; size?: number; slug?: string }) {
  const { c } = useTheme();
  const accent = slug ? roomAccent[slug] : undefined;
  return (
    <View style={[styles.center, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: accent ?? c.cardMuted }]}>
      <Icon name={icon as IconName} size={size * 0.42} color={accent ? '#FFFFFF' : c.text} />
    </View>
  );
}

/** One room as a glass row, like a scan on Home: icon, name, one real fact, and a trailing element. */
export function RoomRow({ room, detail, trailing, onPress }: { room: RoomView; detail?: ReactNode; trailing?: ReactNode; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={room.title}
      onPress={onPress ?? (() => router.push({ pathname: '/community/[slug]', params: { slug: room.slug } }))}
      scaleTo={0.98}>
      <GlassSurface tone="theme" interactive style={styles.row}>
        <RoomIcon icon={room.icon} slug={room.slug} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline" numberOfLines={1}>
            {room.title}
          </T>
          {detail}
        </View>
        {trailing ?? <Icon name="chevron" size={14} color={c.textTertiary} />}
      </GlassSurface>
    </Tap>
  );
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingRight: space.lg, borderRadius: radius.card },
});

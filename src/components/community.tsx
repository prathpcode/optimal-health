import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { initials, type RoomView } from '@/lib/community';
import { roomAccent, shadow, space, useTheme } from '@/theme';
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

/** A room's icon on its accent colour. Without a slug it falls back to the neutral muted tile. */
export function RoomIcon({ icon, size = 44, slug }: { icon: string; size?: number; slug?: string }) {
  const { c } = useTheme();
  const accent = slug ? roomAccent[slug] : undefined;
  return (
    <View style={[styles.center, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: accent ?? c.cardMuted }]}>
      <Icon name={icon as IconName} size={size * 0.45} color={accent ? '#FFFFFF' : c.text} />
    </View>
  );
}

export function BackButton() {
  const { c, dark } = useTheme();
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel="Back"
      feedback="tap"
      hitSlop={8}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/together'))}
      style={[styles.round, { backgroundColor: c.card }, shadow('card', dark)]}>
      <Icon name="back" size={17} color={c.text} />
    </Tap>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.hairline, marginLeft: 76 }} />;
}

/** One room in a list: icon, name, why you are here (or how many people are), and a trailing element. */
export function RoomRow({ room, trailing, onPress }: { room: RoomView; trailing?: React.ReactNode; onPress?: () => void }) {
  const { c } = useTheme();
  const detail = [room.online > 0 ? `${room.online} online` : room.members > 0 ? `${room.members.toLocaleString()} ${room.members === 1 ? 'member' : 'members'}` : null, room.reasons[0] ? `For your ${room.reasons[0].toLowerCase()}` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${room.title}, ${detail}`}
      onPress={onPress ?? (() => router.push({ pathname: '/community/[slug]', params: { slug: room.slug } }))}
      scaleTo={0.98}
      style={styles.row}>
      <RoomIcon icon={room.icon} slug={room.slug} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="headline" numberOfLines={1}>
          {room.title}
        </T>
        <T variant="caption" tone="secondary" numberOfLines={1}>
          {detail}
        </T>
      </View>
      {trailing ?? <Icon name="chevron" size={14} color={c.textTertiary} />}
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
  round: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
});

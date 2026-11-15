import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoomSelect } from '@/components/RoomSelect';
import { GlassSurface } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { useMyRooms } from '@/lib/community';
import { useRecentScans, type RecentScan } from '@/lib/scan';
import { enterAt, radius, space, useTheme } from '@/theme';

/**
 * Share a meal with a room: pick one of your scans (or scan something new), then say which dish and how it was.
 * The post carries the dish, the place and the scan's photo, so people see what you actually ate.
 */
export default function ShareAMeal() {
  // From inside a room (`fixed`), the post goes to that room; from Together you choose.
  const { slug: initial, fixed } = useLocalSearchParams<{ slug: string; fixed?: string }>();
  const rooms = useMyRooms();
  // You can only post to rooms you're in: start from the one asked for if you're in it, else your first room.
  const [slug, setSlug] = useState(rooms.some((r) => r.slug === initial) ? initial : rooms[0]?.slug);
  const recent = (useRecentScans() ?? []).filter((s) => s.status === 'done' && s.itemCount > 0);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { c } = useTheme();

  const newScan = () => {
    router.back();
    router.push({ pathname: '/scan', params: { share: slug } });
  };
  const pick = (scan: RecentScan) => router.replace({ pathname: '/share/[scanId]', params: { scanId: scan.id, room: slug, ...(fixed ? { fixed } : {}) } });

  if (!slug) {
    return (
      <View style={{ padding: space.xxl, paddingBottom: insets.bottom + space.xxxl, gap: space.md, alignItems: 'center' }}>
        <T variant="heading">Join a room first</T>
        <T tone="secondary" style={{ textAlign: 'center' }}>
          You can share meals in rooms you’re in.
        </T>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.xxxl, gap: space.xl }} showsVerticalScrollIndicator={false}>
      <View style={{ gap: space.md, zIndex: 10 }}>
        <T variant="heading">Share a meal</T>
        <RoomSelect rooms={rooms} value={slug} onChange={setSlug} locked={Boolean(fixed)} />
      </View>

      <Tap accessibilityRole="button" accessibilityLabel="Scan something new" feedback="tap" onPress={newScan} scaleTo={0.98}>
        <GlassSurface tone="theme" interactive style={styles.row}>
          <View style={[styles.newIcon, { backgroundColor: c.cardMuted }]}>
            <Icon name="camera" size={20} color={c.text} />
          </View>
          <View style={{ flex: 1 }}>
            <T variant="headline">New scan</T>
            <T variant="caption" tone="secondary">
              Scan the menu or the package
            </T>
          </View>
          <Icon name="chevron" size={14} color={c.textTertiary} />
        </GlassSurface>
      </Tap>

      {recent.length ? (
        <View style={{ gap: space.sm + 2 }}>
          <T variant="heading">Your scans</T>
          {recent.map((s, i) => (
            <Animated.View key={s.id} entering={enterAt(i, reduced)}>
              <ScanRow scan={s} onPress={() => pick(s)} />
            </Animated.View>
          ))}
        </View>
      ) : (
        <T tone="secondary" style={{ textAlign: 'center' }}>
          Your scans show up here.
        </T>
      )}
    </ScrollView>
  );
}

function ScanRow({ scan, onPress }: { scan: RecentScan; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`Share from ${scan.title}`} onPress={onPress} scaleTo={0.98}>
      <GlassSurface tone="theme" interactive style={styles.row}>
        <View style={[styles.thumb, { backgroundColor: c.cardMuted }]}>
          {scan.photo ? <Image source={scan.photo} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name={scan.kind === 'product' ? 'barcode' : 'menu'} size={20} color={c.textSecondary} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline" numberOfLines={1}>
            {scan.title}
          </T>
          <T variant="caption" tone="secondary">
            {when(scan.createdAt)} · {scan.itemCount} {scan.itemCount === 1 ? 'item' : 'dishes'}
          </T>
        </View>
        <Icon name="chevron" size={14} color={c.textTertiary} />
      </GlassSurface>
    </Tap>
  );
}

function when(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingRight: space.lg, borderRadius: radius.card },
  newIcon: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 52, height: 52, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});

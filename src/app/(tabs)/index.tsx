import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useRef } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { RulesRing } from '@/components/RulesRing';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { TogetherCard } from '@/components/together';
import { Card, SectionLabel, Skeleton } from '@/components/ui';
import { useProfile } from '@/lib/profile';
import { restartSample, SAMPLE_ID, SAMPLE_PHOTO, useRecentScans, type RecentScan } from '@/lib/scan';
import { enterAt, gutter, radius, shadow, space, useTheme } from '@/theme';

/**
 * Space below content. On iOS each native tab has its own safe-area provider whose bottom inset already includes the
 * tab bar; on Android the tab content already sits above the bar.
 */
function useBottomInset() {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'ios' ? insets.bottom : 0;
}

export default function HomeScreen() {
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useBottomInset();
  const reduced = useReducedMotion();
  const { profile, rules, ready, meds } = useProfile();
  const reading = meds.filter((m) => m.state === 'pending').map((m) => m.name);
  const busy = useRef(false);
  /** Ignore a second tap while the first navigation is still on its way (no double screens). */
  const once = (fn: () => void) => () => {
    if (busy.current) return;
    busy.current = true;
    fn();
    setTimeout(() => (busy.current = false), 800);
  };
  const recent = useRecentScans();

  const count = (level: string) => rules.filter((r) => r.enabled && r.level === level).length;
  const softCount = count('limit') + count('keep_steady');

  const openSample = () => {
    restartSample();
    router.push({ pathname: '/result/[id]', params: { id: SAMPLE_ID } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingTop: insets.top + space.md, paddingHorizontal: gutter, paddingBottom: bottom + 120 }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <View style={[styles.logo, { backgroundColor: c.primary }]}>
              <Icon name="fork" size={15} color={c.onPrimary} />
            </View>
            <T variant="title">Fit</T>
          </View>
          <Tap accessibilityRole="button" accessibilityLabel="Your profile" feedback="tap" onPress={() => router.navigate('/me')} hitSlop={8}>
            <View style={[styles.avatar, { backgroundColor: c.card }, shadow('card', dark)]}>
              <Icon name="person" size={22} color={c.textSecondary} />
            </View>
          </Tap>
        </View>

        {/* Profile summary: Cal AI's big number + ring card */}
        <Animated.View entering={enterAt(0, reduced)}>
          <Tap accessibilityRole="button" accessibilityLabel={`Your rules: ${rules.filter((r) => r.enabled).length}. Edit profile`} onPress={() => router.navigate('/me')} scaleTo={0.98}>
            <Card style={styles.profileCard}>
              <View style={{ flex: 1, gap: space.xs }}>
                {ready ? <T variant="display">{rules.filter((r) => r.enabled).length}</T> : <Skeleton width={48} height={34} />}
                <T variant="bodyStrong" tone="secondary">
                  Rules checked on every scan
                </T>
                <View style={styles.legend}>
                  <Legend color={c.notFit} label={`${count('never')} never`} />
                  <Legend color={c.okay} label={`${count('avoid')} avoid`} />
                  <Legend color={c.cantTell} label={`${softCount} limit`} />
                </View>
              </View>
              <RulesRing
                segments={[
                  { value: count('never'), color: c.notFit },
                  { value: count('avoid'), color: c.okay },
                  { value: softCount, color: c.cantTell },
                ]}
                center={<Icon name="shield" size={26} color={c.text} />}
              />
            </Card>
          </Tap>
        </Animated.View>

        <View style={styles.miniRow}>
          <MiniStat index={1} icon="allergy" label="Allergies" value={profile.allergies.length} tint={c.notFit} />
          <MiniStat index={2} icon="pill" label="Medicines" value={profile.medications.length} tint={c.okay} />
          <MiniStat index={3} icon="heart" label="Conditions" value={profile.conditions.length + profile.diets.length} tint={c.good} />
        </View>

        <Animated.View entering={enterAt(4, reduced)} style={{ marginTop: space.md }}>
          <TogetherCard />
        </Animated.View>

        {reading.length > 0 ? (
          <Animated.View entering={enterAt(0, reduced)} style={[styles.reading, { backgroundColor: c.cardMuted }]}>
            <ActivityIndicator size="small" color={c.textSecondary} />
            <T variant="caption" tone="secondary" style={{ flex: 1 }}>
              Reading the label for {reading.join(', ')}…
            </T>
          </Animated.View>
        ) : null}

        {/* No empty-state card: the + button is how a scan starts, with or without past scans. */}
        {recent === undefined || recent.length > 0 ? (
          <SectionLabel style={{ marginTop: space.xxxl, marginBottom: space.md }}>Recent scans</SectionLabel>
        ) : null}

        {recent === undefined ? (
          <Card style={{ gap: space.md }}>
            <Skeleton width="60%" />
            <Skeleton width="40%" />
          </Card>
        ) : (
          <View style={{ gap: space.md, marginTop: recent.length === 0 ? space.xxxl : 0 }}>
            {recent.map((s, i) => (
              <Animated.View key={s.id} entering={enterAt(i + 4, reduced)}>
                <RecentCard scan={s} />
              </Animated.View>
            ))}
            <Tap accessibilityRole="button" accessibilityLabel="Try the sample menu" onPress={once(openSample)} style={styles.sampleLink} feedback="tap">
              <Image source={SAMPLE_PHOTO} style={styles.sampleThumb} contentFit="cover" />
              <T variant="bodyStrong" tone="secondary">
                Try the sample menu
              </T>
            </Tap>
          </View>
        )}
      </ScrollView>

      <Tap
        accessibilityRole="button"
        accessibilityLabel="Scan a menu"
        feedback="tap"
        onPress={once(() => router.push('/scan'))}
        scaleTo={0.9}
        style={[styles.fab, { backgroundColor: c.primary, bottom: bottom + space.lg }, shadow('floating', dark)]}>
        <Icon name="plus" size={26} color={c.onPrimary} weight="bold" />
      </Tap>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <T variant="caption" tone="secondary">
        {label}
      </T>
    </View>
  );
}

function MiniStat({ index, icon, label, value, tint }: { index: number; icon: IconName; label: string; value: number; tint: string }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={enterAt(index, reduced)} style={{ flex: 1 }}>
      <Tap accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={() => router.navigate('/me')} scaleTo={0.97}>
        <Card style={styles.mini}>
          <T variant="title" style={{ fontVariant: ['tabular-nums'] }}>
            {value}
          </T>
          <T variant="caption" tone="secondary" numberOfLines={1}>
            {label}
          </T>
          <View style={[styles.miniIcon, { backgroundColor: c.cardMuted }]}>
            <Icon name={icon} size={16} color={tint} />
          </View>
        </Card>
      </Tap>
    </Animated.View>
  );
}

function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function RecentCard({ scan }: { scan: RecentScan }) {
  const { c } = useTheme();
  const working = scan.status !== 'done' && scan.status !== 'failed';
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`${scan.title}, ${timeAgo(scan.createdAt)}`} onPress={() => router.push({ pathname: '/result/[id]', params: { id: scan.id } })} scaleTo={0.98}>
      <Card style={styles.recent}>
        <View style={[styles.thumb, { backgroundColor: c.cardMuted }]}>
          {scan.photo ? <Image source={scan.photo} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.recentTop}>
            <T variant="headline" numberOfLines={1} style={{ flex: 1 }}>
              {scan.title}
            </T>
            <T variant="caption" tone="tertiary">
              {timeAgo(scan.createdAt)}
            </T>
          </View>
          {working ? (
            <View style={styles.counts}>
              <ActivityIndicator size="small" color={c.textSecondary} />
              <T variant="caption" tone="secondary">
                Reading the menu
              </T>
            </View>
          ) : scan.status === 'failed' ? (
            <T variant="caption" color={c.notFit}>
              Couldn’t read this one
            </T>
          ) : (
            <View style={styles.counts}>
              <Icon name={scan.kind === 'menu' ? 'menu' : 'barcode'} size={13} color={c.textTertiary} />
              <T variant="caption" tone="secondary">
                {KIND_LABEL[scan.kind] ?? 'Scan'} · {scan.itemCount} {scan.itemCount === 1 ? 'item' : 'items'}
              </T>
            </View>
          )}
        </View>
      </Card>
    </Tap>
  );
}

const KIND_LABEL: Record<string, string> = { menu: 'Menu', product: 'Product', label: 'Label', unknown: 'Scan' };

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  logo: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingVertical: space.xxl },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, rowGap: space.xs, marginTop: space.sm },
  reading: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, padding: space.md, marginTop: space.md },
  miniRow: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  mini: { padding: space.lg, gap: 2, borderRadius: radius.md + 2 },
  miniIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: space.sm },
  recent: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.md, borderRadius: radius.card - 4 },
  thumb: { width: 72, height: 72, borderRadius: radius.md, overflow: 'hidden' },
  recentTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  counts: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  sampleLink: { flexDirection: 'row', alignItems: 'center', gap: space.md, alignSelf: 'center', paddingVertical: space.md },
  sampleThumb: { width: 28, height: 36, borderRadius: 6 },
  fab: { position: 'absolute', right: gutter, width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
});

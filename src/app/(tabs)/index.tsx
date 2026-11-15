import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useRef } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { TogetherCard } from '@/components/together';
import { Button, Card, Rule, SectionLabel, Skeleton } from '@/components/ui';
import { useProfile } from '@/lib/profile';
import { restartSample, SAMPLE_ID, SAMPLE_PHOTO, useRecentScans, type RecentScan } from '@/lib/scan';
import { enterAt, gutter, radius, space, useTheme } from '@/theme';

/**
 * Space below content. On iOS each native tab has its own safe-area provider whose bottom inset already includes the
 * tab bar; on Android the tab content already sits above the bar.
 */
function useBottomInset() {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'ios' ? insets.bottom : 0;
}

export default function HomeScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useBottomInset();
  const reduced = useReducedMotion();
  const { rules, ready, meds } = useProfile();
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
  const active = rules.filter((r) => r.enabled).length;

  const openSample = () => {
    restartSample();
    router.push({ pathname: '/result/[id]', params: { id: SAMPLE_ID } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingTop: insets.top + space.md, paddingHorizontal: gutter, paddingBottom: bottom + space.huge }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <T variant="display" accessibilityRole="header">
            Fit
          </T>
          <Tap accessibilityRole="button" accessibilityLabel="Your profile" feedback="tap" onPress={() => router.navigate('/me')} hitSlop={8}>
            <View style={[styles.avatar, { backgroundColor: c.card, borderColor: c.rule }]}>
              <Icon name="person" size={22} color={c.check} />
            </View>
          </Tap>
        </View>

        {/* What Fit checks for you, in one line. The detail lives in Me. */}
        <Tap
          accessibilityRole="button"
          accessibilityLabel={active ? `Checking ${active} rules for you. Edit in Me` : 'Add what you avoid. Opens Me'}
          onPress={() => router.navigate('/me')}
          scaleTo={0.98}
          style={styles.rulesLine}>
          {ready ? (
            <T variant="body" tone="secondary" style={{ flexShrink: 1 }}>
              {active ? (
                <>
                  Checking{' '}
                  <T variant="bodyStrong" color={c.carbon}>
                    {active} {active === 1 ? 'rule' : 'rules'}
                  </T>{' '}
                  for you
                </>
              ) : (
                'Add what you avoid, so Fit can check for you'
              )}
            </T>
          ) : (
            <Skeleton width={200} height={16} />
          )}
          <Icon name="chevron" size={13} color={c.textTertiary} />
        </Tap>

        {reading.length > 0 ? (
          <Animated.View entering={enterAt(0, reduced)} style={styles.reading}>
            <ActivityIndicator size="small" color={c.textSecondary} />
            <T variant="caption" tone="secondary" style={{ flex: 1 }}>
              Reading the label for {reading.join(', ')}…
            </T>
          </Animated.View>
        ) : null}

        {/* The one thing to do here. */}
        <Animated.View entering={enterAt(0, reduced)}>
          <Card style={styles.scanSlip}>
            <T variant="title">What are you choosing?</T>
            <T variant="body" tone="secondary">
              Point at a menu or a food label. Hold a barcode in view and it reads on its own.
            </T>
            <Button label="Scan" icon="camera" onPress={once(() => router.push('/scan'))} style={{ marginTop: space.md }} />
            {recent !== undefined && recent.length === 0 ? (
              <Tap accessibilityRole="button" accessibilityLabel="Try the sample menu" onPress={once(openSample)} style={styles.sampleLink} feedback="tap">
                <Image source={SAMPLE_PHOTO} style={styles.sampleThumb} contentFit="cover" />
                <T variant="bodyStrong" color={c.check}>
                  Try the sample menu
                </T>
              </Tap>
            ) : null}
          </Card>
        </Animated.View>

        <Animated.View entering={enterAt(1, reduced)} style={{ marginTop: space.md }}>
          <TogetherCard />
        </Animated.View>

        {recent === undefined ? (
          <>
            <SectionLabel style={styles.sectionLabel}>Recent checks</SectionLabel>
            <Card style={{ gap: space.md }}>
              <Skeleton width="60%" />
              <Skeleton width="40%" />
            </Card>
          </>
        ) : recent.length > 0 ? (
          <>
            <SectionLabel style={styles.sectionLabel}>Recent checks</SectionLabel>
            <Animated.View entering={enterAt(2, reduced)}>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {recent.map((s, i) => (
                  <View key={s.id}>
                    {i > 0 ? <Rule inset={space.lg} /> : null}
                    <RecentRow scan={s} number={recent.length - i} />
                  </View>
                ))}
              </Card>
            </Animated.View>
            <Tap accessibilityRole="button" accessibilityLabel="Try the sample menu" onPress={once(openSample)} style={styles.sampleLink} feedback="tap">
              <T variant="bodyStrong" color={c.check}>
                Try the sample menu
              </T>
            </Tap>
          </>
        ) : null}
      </ScrollView>
    </View>
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

/** One line of the check: a carbon number, what was scanned, when, and how many items. */
function RecentRow({ scan, number }: { scan: RecentScan; number: number }) {
  const { c } = useTheme();
  const working = scan.status !== 'done' && scan.status !== 'failed';
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`${scan.title}, ${timeAgo(scan.createdAt)}`} onPress={() => router.push({ pathname: '/result/[id]', params: { id: scan.id } })} scaleTo={0.985}>
      <View style={styles.recent}>
        <View style={[styles.thumb, { backgroundColor: c.cardMuted }]}>
          {scan.photo ? (
            <Image source={scan.photo} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          ) : (
            <Icon name={scan.kind === 'menu' ? 'menu' : 'barcode'} size={18} color={c.textTertiary} />
          )}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline" numberOfLines={1}>
            {scan.title}
          </T>
          {working ? (
            <View style={styles.counts}>
              <ActivityIndicator size="small" color={c.textSecondary} />
              <T variant="caption" tone="secondary">
                Reading
              </T>
            </View>
          ) : scan.status === 'failed' ? (
            <T variant="caption" tone="secondary">
              Couldn’t read this one
            </T>
          ) : (
            <T variant="caption" tone="secondary">
              {KIND_LABEL[scan.kind] ?? 'Scan'} · {scan.itemCount} {scan.itemCount === 1 ? 'item' : 'items'} · {timeAgo(scan.createdAt)}
            </T>
          )}
        </View>
        <T variant="figure" color={c.carbon} accessibilityElementsHidden>
          {String(number).padStart(3, '0')}
        </T>
      </View>
    </Tap>
  );
}

const KIND_LABEL: Record<string, string> = { menu: 'Menu', product: 'Product', label: 'Label', unknown: 'Scan' };

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  rulesLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', minHeight: 44, marginBottom: space.md },
  reading: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  scanSlip: { gap: space.sm, padding: space.xl },
  sectionLabel: { marginTop: space.xxxl, marginBottom: space.sm, marginLeft: space.xs },
  recent: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  thumb: { width: 44, height: 44, borderRadius: radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  counts: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sampleLink: { flexDirection: 'row', alignItems: 'center', gap: space.md, alignSelf: 'center', paddingVertical: space.md, minHeight: 44 },
  sampleThumb: { width: 28, height: 36, borderRadius: 4 },
});

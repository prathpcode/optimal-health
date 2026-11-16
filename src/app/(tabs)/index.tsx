import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  SensorType,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedSensor,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { GlassButton, GlassSurface } from '@/components/Glass';
import { Icon, type IconName } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { haptic } from '@/lib/haptics';
import { useFirstName } from '@/lib/name';
import { useRecentScans, type RecentScan } from '@/lib/scan';
import { gutter, radius, space, spring, titleTop, topBar, useTheme } from '@/theme';

// Home always opens on the salad; a tap cycles to the next one and round again.
const FOOD = [
  { name: 'Salad', source: require('@/assets/food/salad.webp') },
  { name: 'Pasta', source: require('@/assets/food/pasta.webp') },
  { name: 'Coffee', source: require('@/assets/food/coffee.webp') },
  { name: 'Tea', source: require('@/assets/food/tea.webp') },
];

/** How far a scroll stretches the food before it springs back and the scans take over. */
const PULL = 110;
const SCAN_SIZE = 62;

export default function HomeScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const name = useFirstName();
  const recent = useRecentScans();
  // On iOS each native tab's bottom inset already includes the tab bar; on Android the content sits above the bar.
  const bottom = Platform.OS === 'ios' ? insets.bottom : 0;

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const tilt = useAnimatedSensor(SensorType.ROTATION);

  // 0 at rest, 1 at full stretch, back to 0 once the scans have arrived. The spring is what makes it elastic.
  const stretch = useDerivedValue(() => {
    const target = interpolate(Math.abs(scrollY.value), [0, PULL, PULL * 2.6], [0, 1, 0], Extrapolation.CLAMP);
    return reduced ? target : withSpring(target, spring.pop);
  });

  const tick = (full: boolean) => (full ? haptic.shutter() : haptic.tap());
  useAnimatedReaction(
    () => (scrollY.value > PULL ? 2 : scrollY.value > 10 ? 1 : 0),
    (step, before) => {
      if (before !== null && step > before) scheduleOnRN(tick, step === 2);
    },
  );

  // Tapping the food cycles it. The food layer sits over the scroll view, so it only takes touches at rest.
  const [food, setFood] = useState(0);
  const [atTop, setAtTop] = useState(true);
  useAnimatedReaction(
    () => scrollY.value > 8,
    (moved, before) => {
      if (before !== null && moved !== before) scheduleOnRN(setAtTop, !moved);
    },
  );
  const pop = useSharedValue(0);
  const onFoodPress = () => {
    haptic.pop();
    setFood((i) => (i + 1) % FOOD.length);
    pop.value = reduced ? 0 : withSequence(withTiming(1, { duration: 110 }), withSpring(0, spring.pop));
  };

  const size = Math.min(width * 0.86, height * 0.42);
  // The food sits below the greeting, however many lines the greeting wraps to.
  const [headlineHeight, setHeadlineHeight] = useState(0);
  const top = Math.max(insets.top + 250, height * 0.36, insets.top + titleTop + headlineHeight + space.xl);

  const foodStyle = useAnimatedStyle(() => {
    const { pitch, roll } = tilt.sensor.value;
    const turn = reduced ? 0 : Math.max(-0.6, Math.min(0.6, roll)) * 24;
    const nod = reduced ? 0 : Math.max(-0.5, Math.min(0.5, pitch - 0.75)) * -18;
    return {
      opacity: interpolate(scrollY.value, [PULL, PULL * 3], [1, 0.22], Extrapolation.CLAMP),
      transform: [
        { translateY: -Math.max(scrollY.value, 0) * 0.35 },
        { perspective: 700 },
        { translateX: turn * 0.5 },
        { rotateX: `${nod}deg` },
        { rotateY: `${turn}deg` },
        { scaleY: 1 + stretch.value * 0.16 - pop.value * 0.1 },
        { scaleX: 1 - stretch.value * 0.05 + pop.value * 0.12 },
        { rotateZ: `${pop.value * 4}deg` },
      ],
    };
  });
  const shadowStyle = useAnimatedStyle(() => {
    const turn = reduced ? 0 : Math.max(-0.6, Math.min(0.6, tilt.sensor.value.roll)) * 24;
    return {
      opacity: interpolate(scrollY.value, [0, PULL * 2], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: -turn * 0.7 }, { scaleX: 1 - stretch.value * 0.12 }],
    };
  });
  // The arrow that says there are past scans below: it bobs gently and goes as soon as the scroll starts.
  const bob = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    bob.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })), -1);
  }, [reduced, bob]);
  const hintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 40], [0.9, 0], Extrapolation.CLAMP),
    transform: [{ translateY: bob.value * 5 }],
  }));
  const headlineStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, PULL * 2.2], [1, 0], Extrapolation.CLAMP) }));

  if (name === undefined) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  if (!name) return <Redirect href="/welcome" />;

  const scansAt = height * 0.6;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View style={[styles.shadow, { top: top + size * 0.86, left: (width - size * 0.5) / 2, width: size * 0.5 }, shadowStyle]} />
        <Animated.View style={[{ position: 'absolute', top, left: (width - size) / 2, width: size, height: size, transformOrigin: 'bottom' }, foodStyle]}>
          <Image source={FOOD[food].source} style={{ width: size, height: size }} contentFit="contain" transition={180} />
        </Animated.View>
      </View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        alwaysBounceVertical
        snapToOffsets={recent?.length ? [0, scansAt] : undefined}
        snapToEnd={false}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: bottom + SCAN_SIZE + space.xxxl }}>
        <Animated.View style={[{ minHeight: height, paddingTop: insets.top + titleTop }, headlineStyle]}>
          <T variant="hero" accessibilityRole="header" style={{ textAlign: 'center' }} onLayout={(e) => setHeadlineHeight(e.nativeEvent.layout.height)}>
            Hello {name} 👋{'\n'}🏃 time to hit the <T variant="heroBold">ground running</T>
          </T>
          {/* The food is painted behind the scroll view, so its touch target rides along with the content instead. */}
          {atTop ? (
            <Tap
              accessibilityRole="button"
              accessibilityLabel={`${FOOD[food].name}. Tap for another food.`}
              scaleTo={1}
              onPress={onFoodPress}
              style={{ position: 'absolute', top, left: (width - size) / 2, width: size, height: size }}
            />
          ) : null}
        </Animated.View>
        <View style={{ gap: space.sm + 2 }}>
          {recent?.map((s) => (
            <ScanRow key={s.id} scan={s} />
          ))}
        </View>
      </Animated.ScrollView>

      <View style={{ position: 'absolute', top: insets.top + topBar, right: gutter }}>
        <GlassButton tone="theme" icon="person" label="Your profile" onPress={() => router.push('/profile')} />
      </View>
      {recent?.length ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, alignItems: 'center', bottom: bottom + space.md + SCAN_SIZE + space.md }, hintStyle]}>
          <Icon name="down" size={18} color={c.textTertiary} />
        </Animated.View>
      ) : null}
      <Tap accessibilityRole="button" accessibilityLabel="Scan" feedback="tap" scaleTo={0.97} onPress={() => router.push('/scan')} style={{ position: 'absolute', left: gutter, right: gutter, bottom: bottom + space.md }}>
        <GlassSurface tone="theme" interactive style={styles.scan}>
          <Icon name="camera" size={20} color={c.text} />
          <T variant="heading">Scan</T>
        </GlassSurface>
      </Tap>
    </View>
  );
}

function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const KIND_LABEL: Record<string, string> = { menu: 'Menu', product: 'Product', label: 'Label', unknown: 'Scan' };
const KIND_ICON: Record<string, IconName> = { menu: 'menu', product: 'barcode', label: 'box', unknown: 'camera' };

function ScanRow({ scan }: { scan: RecentScan }) {
  const { c } = useTheme();
  const state = scan.status === 'failed' ? 'Couldn’t read' : scan.status !== 'done' ? 'Reading' : (KIND_LABEL[scan.kind] ?? 'Scan');
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`${scan.title}, ${state}, ${timeAgo(scan.createdAt)}`} onPress={() => router.push({ pathname: '/result/[id]', params: { id: scan.id } })} scaleTo={0.98}>
      <GlassSurface tone="theme" interactive style={styles.row}>
        <View style={[styles.thumb, { backgroundColor: c.cardMuted }]}>
          {scan.photo ? <Image source={scan.photo} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <Icon name={KIND_ICON[scan.kind] ?? 'camera'} size={20} color={c.textSecondary} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline" numberOfLines={1}>
            {scan.title}
          </T>
          <T variant="caption" tone="secondary" numberOfLines={1}>
            {state} · {timeAgo(scan.createdAt)}
          </T>
        </View>
        <Icon name="chevron" size={14} color={c.textTertiary} />
      </GlassSurface>
    </Tap>
  );
}

const styles = StyleSheet.create({
  shadow: { position: 'absolute', height: 16, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.08)', boxShadow: '0 0 30px 12px rgba(0,0,0,0.1)' },
  scan: { height: SCAN_SIZE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingRight: space.lg, borderRadius: radius.card },
  thumb: { width: 52, height: 52, borderRadius: radius.sm + 4, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});

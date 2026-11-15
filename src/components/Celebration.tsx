import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { clearCelebration, useCelebration, type Celebration as C } from '@/lib/celebrate';
import { haptic } from '@/lib/haptics';
import { roomAccent, shadow, space, spring, useTheme } from '@/theme';
import { T } from './T';

const COUNT = 36;
const SHOW_MS = 1800;

// Native form sheets draw above the root view, so a sheet that celebrates mounts its own layer ("local"); while one
// is mounted, the root layer stays out of the way so the burst plays once.
let localLayers = 0;
const layerListeners = new Set<() => void>();
const setLocal = (d: number) => {
  localLayers += d;
  layerListeners.forEach((l) => l());
};

/** A confetti burst and a big springy title whenever something is celebrated. Mount once at the root, and in sheets with `local`. */
export function CelebrationLayer({ local }: { local?: boolean }) {
  const current = useCelebration();
  const others = useSyncExternalStore(
    (l) => {
      layerListeners.add(l);
      return () => layerListeners.delete(l);
    },
    () => localLayers,
  );
  useEffect(() => {
    if (!local) return;
    setLocal(1);
    return () => setLocal(-1);
  }, [local]);
  if (!current || (!local && others > 0)) return null;
  return <Burst key={current.id} c={current} />;
}

/** A small seeded generator, so a burst is the same on every render (and differs between bursts). */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Piece = { angle: number; speed: number; size: number; color: string; spin: number; round: boolean; delay: number };

function Burst({ c: celebration }: { c: C }) {
  const { c, dark } = useTheme();
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();

  const pieces = useMemo<Piece[]>(() => {
    const colors = [...Object.values(roomAccent), c.good, c.good, c.okay];
    const random = seeded(celebration.id);
    return Array.from({ length: COUNT }, (_, i) => ({
      angle: -Math.PI / 2 + ((i / COUNT) * 2 - 1) * Math.PI * 0.55 + (random() - 0.5) * 0.3,
      speed: 260 + random() * 260,
      size: 7 + random() * 7,
      color: colors[i % colors.length],
      spin: (random() - 0.5) * 900,
      round: i % 3 === 0,
      delay: random() * 90,
    }));
  }, [c.good, c.okay, celebration.id]);

  const title = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    haptic.success();
    const id = celebration.id;
    const done = () => clearCelebration(id);
    title.value = reduced ? withTiming(1, { duration: 200 }) : withSpring(1, spring.pop);
    fade.value = withDelay(SHOW_MS - 300, withTiming(0, { duration: 300 }, (finished) => finished && runOnJS(done)()));
  }, [celebration.id, reduced, title, fade]);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: fade.value * Math.min(1, title.value * 1.5),
    transform: [{ scale: reduced ? 1 : 0.6 + title.value * 0.4 }, { translateY: (1 - title.value) * 16 }],
  }));

  const accent = celebration.tone === 'neutral' ? c.text : c.good;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {reduced || celebration.tone === 'neutral'
        ? null
        : pieces.map((p, i) => <Particle key={i} p={p} originX={width / 2} originY={height * 0.42} />)}
      <Animated.View style={[styles.center, { top: height * 0.42 - 60 }, titleStyle]}>
        <View style={[styles.badge, { backgroundColor: c.card }, shadow('floating', dark)]}>
          <T variant="display" color={accent} style={styles.title}>
            {celebration.title}
          </T>
          {celebration.subtitle ? (
            <T variant="bodyStrong" tone="secondary" style={{ textAlign: 'center' }}>
              {celebration.subtitle}
            </T>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

function Particle({ p, originX, originY }: { p: Piece; originX: number; originY: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(p.delay, withTiming(1, { duration: SHOW_MS - p.delay, easing: Easing.linear }));
  }, [t, p.delay]);
  const style = useAnimatedStyle(() => {
    const s = t.value * (SHOW_MS / 1000);
    // A thrown piece: initial velocity along its angle, slowed by drag, pulled down by gravity.
    const drag = 1 - Math.exp(-s * 2.4);
    const x = Math.cos(p.angle) * p.speed * (drag / 2.4);
    const y = Math.sin(p.angle) * p.speed * (drag / 2.4) + 420 * s * s;
    return {
      opacity: t.value < 0.75 ? 1 : 1 - (t.value - 0.75) / 0.25,
      transform: [{ translateX: originX + x }, { translateY: originY + y }, { rotate: `${p.spin * s}deg` }, { scaleX: Math.cos(s * 9 + p.spin) }],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        { width: p.size, height: p.round ? p.size : p.size * 0.5, borderRadius: p.round ? p.size / 2 : 2, backgroundColor: p.color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', left: 0, top: 0 },
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  badge: { paddingHorizontal: space.xxl, paddingVertical: space.lg, borderRadius: 28, alignItems: 'center', gap: space.xs, minWidth: 160 },
  title: { fontSize: 44, lineHeight: 50, textAlign: 'center' },
});

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { clearCelebration, useCelebration, type Celebration as C } from '@/lib/celebrate';
import { haptic } from '@/lib/haptics';
import { duration, roomAccent, space, spring, useTheme } from '@/theme';
import { GlassSurface } from './Glass';
import { Icon } from './Icon';
import { T } from './T';

// Native form sheets draw above the root view, so a sheet that celebrates mounts its own layer ("local"); while one
// is mounted, the root layer stays out of the way so the moment plays once.
let localLayers = 0;
const layerListeners = new Set<() => void>();
const setLocal = (d: number) => {
  localLayers += d;
  layerListeners.forEach((l) => l());
};

/** A small title, and confetti drifting slowly down from the top, whenever something is celebrated. Mount once at the root, and in sheets with `local`. */
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
  return <Moment key={current.id} c={current} />;
}

const PIECES = 34;
const FADE_MS = 300;
// Room accents, not verdict colours: those mean something elsewhere.
const COLORS = Object.values(roomAccent);

type Piece = {
  x: number;
  w: number;
  h: number;
  round: boolean;
  color: string;
  /** When it leaves the top and how long its fall takes, as fractions of the whole. */
  start: number;
  span: number;
  sway: number;
  waves: number;
  phase: number;
  spin: number;
  flips: number;
};

function makePieces(width: number): Piece[] {
  const r = Math.random;
  return Array.from({ length: PIECES }, (_, i) => {
    const w = 6 + r() * 4;
    const round = r() < 0.25;
    return {
      // Spread evenly across the width, then jittered, so there are no clumps or gaps.
      x: ((i + r()) / PIECES) * width,
      w,
      h: round ? w : w * (1.4 + r() * 0.8),
      round,
      color: COLORS[i % COLORS.length],
      start: r() * 0.35,
      span: 0.5 + r() * 0.15,
      sway: 10 + r() * 22,
      waves: 1 + r() * 1.5,
      phase: r() * Math.PI * 2,
      spin: (r() < 0.5 ? -1 : 1) * (120 + r() * 300),
      flips: 2 + r() * 3,
    };
  });
}

function Moment({ c: celebration }: { c: C }) {
  const reduced = useReducedMotion();
  const window = useWindowDimensions();
  // The layer's own size: in a sheet it is shorter than the window.
  const [size, setSize] = useState({ width: window.width, height: window.height });

  const neutral = celebration.tone === 'neutral';
  const confetti = !reduced && !neutral;

  const pop = useSharedValue(0);
  const fall = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    haptic.success();
    const id = celebration.id;
    const done = () => clearCelebration(id);
    pop.value = reduced ? withTiming(1, { duration: duration.base }) : withSpring(1, spring.gentle);
    // Whichever lasts longer ends the moment: the confetti, or the title when there is none.
    fade.value = withDelay(
      duration.cheer - FADE_MS,
      withTiming(0, { duration: FADE_MS }, (finished) => {
        if (finished && !confetti) runOnJS(done)();
      }),
    );
    if (confetti) {
      fall.value = withTiming(1, { duration: duration.confetti, easing: Easing.linear }, (finished) => {
        if (finished) runOnJS(done)();
      });
    }
  }, [celebration.id, reduced, confetti, pop, fall, fade]);

  const pieces = useMemo(() => (confetti ? makePieces(size.width) : []), [confetti, size.width]);

  const pill = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 1.5) * fade.value,
    transform: [{ translateY: reduced ? 0 : (1 - pop.value) * 10 }],
  }));

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {pieces.map((p, i) => (
        <Confetto key={i} p={p} t={fall} height={size.height} />
      ))}
      <Animated.View style={[styles.center, { top: size.height * 0.36 }, pill]}>
        <GlassSurface tone="theme" style={styles.badge}>
          <View style={styles.titleRow}>
            {celebration.icon ? <TitleIcon name={celebration.icon} /> : null}
            <T variant="heading" style={styles.title}>
              {celebration.title}
            </T>
          </View>
          {celebration.subtitle ? (
            <T variant="caption" tone="secondary" style={styles.title}>
              {celebration.subtitle}
            </T>
          ) : null}
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

function TitleIcon({ name }: { name: NonNullable<C['icon']> }) {
  const { c } = useTheme();
  return <Icon name={name} size={18} color={c.text} weight="bold" />;
}

/** One piece of paper: falls at its own steady pace, swaying and turning over, and fades out near the bottom. */
function Confetto({ p, t, height }: { p: Piece; t: SharedValue<number>; height: number }) {
  const style = useAnimatedStyle(() => {
    const q = Math.min(1, Math.max(0, (t.value - p.start) / p.span));
    return {
      opacity: q <= 0 ? 0 : q < 0.75 ? 1 : (1 - q) / 0.25,
      transform: [
        { translateX: Math.sin(p.phase + q * p.waves * Math.PI * 2) * p.sway },
        { translateY: -24 + q * (height + 24) },
        { rotate: `${q * p.spin}deg` },
        { rotateX: `${q * p.flips * 360}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[styles.piece, { left: p.x, width: p.w, height: p.h, borderRadius: p.round ? p.w / 2 : 1.5, backgroundColor: p.color }, style]}
    />
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  badge: { paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: 24, alignItems: 'center', gap: 2, minWidth: 140 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { textAlign: 'center' },
  piece: { position: 'absolute', top: 0 },
});

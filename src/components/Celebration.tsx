import { useEffect, useSyncExternalStore } from 'react';
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
import { space, spring, useTheme } from '@/theme';
import { GlassSurface } from './Glass';
import { Icon } from './Icon';
import { T } from './T';

const SHOW_MS = 1800;

// Native form sheets draw above the root view, so a sheet that celebrates mounts its own layer ("local"); while one
// is mounted, the root layer stays out of the way so the burst plays once.
let localLayers = 0;
const layerListeners = new Set<() => void>();
const setLocal = (d: number) => {
  localLayers += d;
  layerListeners.forEach((l) => l());
};

/** A check that pops with a ring and a few rays, and a small title, whenever something is celebrated. Mount once at the root, and in sheets with `local`. */
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

const RAYS = 8;
const DISC = 56;

function Burst({ c: celebration }: { c: C }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();

  const pop = useSharedValue(0);
  const wave = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    haptic.success();
    const id = celebration.id;
    const done = () => clearCelebration(id);
    pop.value = reduced ? withTiming(1, { duration: 200 }) : withSpring(1, spring.pop);
    wave.value = reduced ? 0 : withDelay(80, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
    fade.value = withDelay(SHOW_MS - 300, withTiming(0, { duration: 300 }, (finished) => finished && runOnJS(done)()));
  }, [celebration.id, reduced, pop, wave, fade]);

  const neutral = celebration.tone === 'neutral';
  const accent = neutral ? c.textSecondary : celebration.tone === 'good' ? c.okay : c.good;

  const wrap = useAnimatedStyle(() => ({ opacity: fade.value }));
  const disc = useAnimatedStyle(() => ({ transform: [{ scale: reduced ? 1 : 0.4 + pop.value * 0.6 }] }));
  const ring = useAnimatedStyle(() => ({ opacity: (1 - wave.value) * 0.5, transform: [{ scale: 1 + wave.value * 1.3 }] }));
  const pill = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 1.5),
    transform: [{ translateY: reduced ? 0 : (1 - pop.value) * 10 }],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.center, { top: height * 0.4 - DISC }, wrap]}>
        <View style={styles.mark}>
          {reduced || neutral ? null : (
            <>
              <Animated.View style={[styles.ring, { borderColor: accent }, ring]} />
              {Array.from({ length: RAYS }, (_, i) => (
                <Ray key={i} angle={(i / RAYS) * 360} color={accent} t={wave} />
              ))}
            </>
          )}
          <Animated.View style={[styles.disc, { backgroundColor: accent }, disc]}>
            <Icon name={celebration.icon ?? 'check'} size={26} color="#FFFFFF" weight="bold" />
          </Animated.View>
        </View>
        <Animated.View style={pill}>
          <GlassSurface tone="theme" style={styles.badge}>
            <T variant="heading" style={styles.title}>
              {celebration.title}
            </T>
            {celebration.subtitle ? (
              <T variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
                {celebration.subtitle}
              </T>
            ) : null}
          </GlassSurface>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** One short line thrown straight out from the mark, shrinking as it goes. */
function Ray({ angle, color, t }: { angle: number; color: string; t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.6 ? 1 : 1 - (t.value - 0.6) / 0.4,
    transform: [{ rotate: `${angle}deg` }, { translateY: -(DISC / 2 + 8 + t.value * 22) }, { scaleY: 1 - t.value * 0.7 }],
  }));
  return <Animated.View style={[styles.ray, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: space.md },
  mark: { width: DISC, height: DISC, alignItems: 'center', justifyContent: 'center' },
  disc: { width: DISC, height: DISC, borderRadius: DISC / 2, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: DISC, height: DISC, borderRadius: DISC / 2, borderWidth: 2 },
  ray: { position: 'absolute', width: 3, height: 10, borderRadius: 1.5 },
  badge: { paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: 24, alignItems: 'center', gap: 2, minWidth: 140 },
  title: { textAlign: 'center' },
});

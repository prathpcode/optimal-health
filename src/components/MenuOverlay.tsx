import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import type { Fit, Item, Rule, Verdict } from '@engine/types';
import { tagLabel } from '@engine/tags';
import { DOT, estimateChipWidth, placeChips, type Rect } from '@/lib/layout';
import { fitColor } from '@/lib/verdict';
import { duration, onPhoto, palette, radius, shadow, space, spring } from '@/theme';
import { T } from './T';
import { Tap } from './Tap';
import { VerdictDot } from './ui';

// Chip heights: 7 + 18 + 7 padding plus a 2 pt border each side; the second line adds 16.
const CHIP_ONE = 36;
const CHIP_TWO = 52;
// Chips sit on the photo, so they use the light palette in both themes (like a label stuck on paper).
const light = palette.light;

/** The second line of a chip: whose rule this is, in a few words. */
function chipReason(verdict: Verdict | undefined, rules: Rule[]): string | null {
  if (!verdict) return null;
  const ruleOf = (id?: string) => rules.find((r) => r.id === id);
  if (verdict.fit === 'not_fit') {
    const f = verdict.findings.find((x) => x.outcome === 'blocked');
    const r = ruleOf(f?.ruleId);
    return r ? `${capital(tagLabel(r.tag))} · ${r.from.label}` : null;
  }
  if (verdict.fit === 'cant_tell') {
    const f = verdict.findings.find((x) => x.outcome === 'ask');
    const r = ruleOf(f?.ruleId);
    return r ? `Ask about ${tagLabel(r.tag)}` : 'Ask your server';
  }
  return null;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function MenuOverlay({
  photo,
  bounds,
  items,
  verdicts,
  rules,
  provisional = false,
  selectedId,
  onSelect,
}: {
  photo: Rect;
  bounds: { width: number; height: number };
  items: Item[];
  verdicts: Record<string, Verdict>;
  rules: Rule[];
  /** Fast first-pass verdicts still being checked: each chip says "checking". */
  provisional?: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const chips = useMemo(() => {
    const withBox = items.filter((i) => i.position?.[0]);
    const inputs = withBox.map((i) => {
      const reason = chipReason(verdicts[i.id], rules);
      const fit = verdicts[i.id]?.fit;
      return {
        id: i.id,
        box: i.position![0],
        height: reason ? CHIP_TWO : CHIP_ONE,
        width: estimateChipWidth(i.name, reason),
        important: fit === 'not_fit' || fit === 'cant_tell',
      };
    });
    return placeChips(inputs, photo, bounds);
  }, [items, verdicts, rules, photo, bounds]);

  if (photo.width === 0) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {chips.map((p, order) => {
        const item = items.find((i) => i.id === p.id)!;
        const verdict = verdicts[p.id];
        return (
          <DishMarker
            key={p.id}
            order={order}
            item={item}
            fit={verdict?.fit ?? null}
            reason={chipReason(verdict, rules)}
            mode={p.mode}
            checking={provisional && !!verdict}
            x={p.x}
            y={p.y}
            maxWidth={p.width}
            outline={p.outline}
            selected={selectedId === p.id}
            onPress={() => onSelect(p.id)}
          />
        );
      })}
    </View>
  );
}

function DishMarker({
  order,
  item,
  fit,
  reason,
  mode,
  checking,
  x,
  y,
  maxWidth,
  outline,
  selected,
  onPress,
}: {
  order: number;
  item: Item;
  fit: Fit | null;
  reason: string | null;
  mode: 'chip' | 'dot';
  checking: boolean;
  x: number;
  y: number;
  maxWidth: number;
  outline: Rect;
  selected: boolean;
  onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const pop = useSharedValue(1);
  const outlineOpacity = useSharedValue(0);
  const top = useSharedValue(y);
  const hadFit = useRef(fit !== null);
  const col = fit ? fitColor(fit, light).solid : light.cantTell;

  // The verdict "pop": once, when a verdict first lands on this chip, staggered down the menu.
  useEffect(() => {
    if (fit && !hadFit.current && !reduced) {
      pop.value = withDelay(order * 60, withSequence(withTiming(1.07, { duration: 140 }), withSpring(1, spring.pop)));
    }
    if (fit) outlineOpacity.value = withDelay(order * 60, withTiming(1, { duration: 300 }));
    hadFit.current = fit !== null;
  }, [fit, order, reduced, pop, outlineOpacity]);

  // Chips glide when the layout changes (a second line appears and pushes the ones below).
  useEffect(() => {
    top.value = reduced ? y : withSpring(y, spring.gentle);
  }, [y, reduced, top]);

  const chipStyle = useAnimatedStyle(() => ({ top: top.value, transform: [{ scale: pop.value }] }));
  const outlineStyle = useAnimatedStyle(() => ({ opacity: outlineOpacity.value * (selected ? 1 : 0.55) }));

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.outline,
          { left: outline.x - 4, top: outline.y - 4, width: outline.width + 8, height: outline.height + 8, borderColor: col },
          outlineStyle,
        ]}
      />
      {mode === 'dot' ? (
        <Animated.View
          key="dot"
          entering={reduced ? FadeIn.duration(duration.fast) : ZoomIn.springify().damping(14).delay(order * 30)}
          style={[styles.chipWrap, { left: x }, chipStyle]}>
          <Tap accessibilityRole="button" accessibilityLabel={`${item.name}${fit ? `, ${fit.replace('_', ' ')}` : ''}`} feedback="select" onPress={onPress} hitSlop={10} scaleTo={0.85}>
            <View style={[styles.dot, { backgroundColor: col }, shadow('floating', false), selected ? styles.dotSelected : null]} />
          </Tap>
        </Animated.View>
      ) : (
      <Animated.View key="chip" entering={reduced ? FadeIn.duration(duration.fast) : ZoomIn.springify().damping(14).delay(order * 50)} style={[styles.chipWrap, { left: x, maxWidth }, chipStyle]}>
        <Tap accessibilityRole="button" accessibilityLabel={`${item.name}${fit ? `, ${fit.replace('_', ' ')}` : ''}`} feedback="select" onPress={onPress} scaleTo={0.94}>
          <View style={[styles.chip, shadow('floating', false), selected ? { borderColor: light.text, borderWidth: 2 } : null]}>
            <View style={styles.row}>
              <VerdictDot fit={fit} size={9} />
              <T variant="caption" color={onPhoto.chipText} numberOfLines={1} style={styles.name}>
                {item.name}
              </T>
              {checking ? (
                <Animated.View entering={FadeIn.duration(duration.fast)} exiting={FadeOut.duration(duration.base)}>
                  <T variant="caption" color={onPhoto.chipTextSecondary} style={{ fontSize: 11 }}>
                    checking…
                  </T>
                </Animated.View>
              ) : null}
            </View>
            {reason ? (
              <Animated.View entering={FadeIn.duration(duration.base)}>
                <T variant="caption" color={col} numberOfLines={1} style={styles.reason}>
                  {reason}
                </T>
              </Animated.View>
            ) : null}
          </View>
        </Tap>
      </Animated.View>
      )}
    </>
  );
}

/** A soft bright band sweeping down the photo while it is being read. */
export function ScanSweep({ photo, active }: { photo: Rect; active: boolean }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  const visible = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    visible.value = withTiming(active ? 1 : 0, { duration: duration.slow });
    if (active && !reduced) {
      t.value = 0;
      t.value = withRepeat(withTiming(1, { duration: duration.sweep, easing: Easing.inOut(Easing.quad) }), -1, true);
    } else {
      cancelAnimation(t);
    }
  }, [active, reduced, t, visible]);

  const band = 120;
  const style = useAnimatedStyle(() => ({
    opacity: visible.value,
    transform: [{ translateY: t.value * Math.max(0, photo.height - band) }],
  }));
  const dim = useAnimatedStyle(() => ({ opacity: visible.value * 0.28 }));

  if (photo.width === 0) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill]}>
      <Animated.View style={[{ position: 'absolute', left: photo.x, top: photo.y, width: photo.width, height: photo.height, backgroundColor: '#000' }, dim]} />
      <Animated.View style={[{ position: 'absolute', left: photo.x, top: photo.y, width: photo.width, height: band }, style]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sweepLine} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outline: { position: 'absolute', borderWidth: 2, borderRadius: radius.sm },
  chipWrap: { position: 'absolute' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2.5, borderColor: onPhoto.chip },
  dotSelected: { transform: [{ scale: 1.25 }] },
  chip: {
    backgroundColor: onPhoto.chip,
    borderRadius: 14,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { fontWeight: '600', flexShrink: 1 },
  reason: { marginLeft: 16, marginTop: 1, fontSize: 12, lineHeight: 15 },
  sweepLine: { position: 'absolute', left: 0, right: 0, top: 59, height: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
});

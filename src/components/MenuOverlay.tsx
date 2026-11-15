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

import type { Box, Fit, Item, Rule, Verdict } from '@engine/types';
import { tagLabel } from '@engine/tags';
import { boxToRect, estimateChipWidth, unionBox, type Rect } from '@/lib/layout';
import { fitColor } from '@/lib/verdict';
import { duration, onPhoto, palette, radius, shadow, space, spring } from '@/theme';
import { T } from './T';
import { Tap } from './Tap';
import { VerdictDot } from './ui';

// Labels sit on the photo, so they use the light palette in both themes (like a label stuck on paper).
const light = palette.light;
const LABEL_HEIGHT = 52;
const LABEL_GAP = 6;

/** The second line of a label: whose rule this is, in a few words. */
function labelReason(verdict: Verdict | undefined, rules: Rule[]): string | null {
  if (!verdict) return null;
  const ruleOf = (id?: string) => rules.find((r) => r.id === id);
  if (verdict.fit === 'not_fit') {
    const f = verdict.findings.find((x) => x.outcome === 'blocked');
    const r = ruleOf(f?.ruleId);
    return r ? `${capital(tagLabel(r.tag))} · ${r.from.label}` : 'Not a fit';
  }
  if (verdict.fit === 'cant_tell') {
    const f = verdict.findings.find((x) => x.outcome === 'ask');
    const r = ruleOf(f?.ruleId);
    return r ? `Ask about ${tagLabel(r.tag)}` : 'Ask your server';
  }
  return verdict.fit === 'good' ? 'Good fit' : 'Okay, with notes';
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A box around each dish on the photo, in its verdict's colour. The boxes carry the result on their own: nothing is
 * laid over the menu's text, so it stays readable. Tapping a box selects the dish, and only the selected dish gets a
 * label, placed just above its box (or below, when there is no room above).
 */
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
  /** The part of the screen the overlay may draw in: `top` is where the top bar ends, `height` where the sheet begins. */
  bounds: { width: number; height: number; top?: number };
  items: Item[];
  verdicts: Record<string, Verdict>;
  rules: Rule[];
  /** Fast first-pass verdicts still being checked: boxes are drawn dashed until they are confirmed. */
  provisional?: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const boxes = useMemo(
    () =>
      items
        .filter((i) => i.position?.[0])
        // The whole dish: its name and the description lines under it. Top to bottom, so the stagger reads down the menu.
        .map((i) => ({ item: i, rect: boxToRect(unionBox(i.position!), photo) }))
        .sort((a, b) => a.rect.y - b.rect.y),
    [items, photo],
  );

  if (photo.width === 0) return null;
  const selected = boxes.find((b) => b.item.id === selectedId);
  const minTop = bounds.top ?? 0;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {boxes.map(({ item, rect }, order) => (
        <DishBox
          key={item.id}
          order={order}
          item={item}
          rect={rect}
          fit={verdicts[item.id]?.fit ?? null}
          checking={provisional && !!verdicts[item.id]}
          selected={selectedId === item.id}
          // A box that has slid under the top bar or the sheet is not a target.
          hidden={rect.y + rect.height < minTop || rect.y > bounds.height}
          onPress={() => onSelect(item.id)}
        />
      ))}
      {selected ? (
        <DishLabel
          key={selected.item.id}
          name={selected.item.name}
          fit={verdicts[selected.item.id]?.fit ?? null}
          reason={labelReason(verdicts[selected.item.id], rules)}
          rect={selected.rect}
          bounds={bounds}
        />
      ) : null}
    </View>
  );
}

function DishBox({ order, item, rect, fit, checking, selected, hidden, onPress }: { order: number; item: Item; rect: Rect; fit: Fit | null; checking: boolean; selected: boolean; hidden: boolean; onPress: () => void }) {
  const reduced = useReducedMotion();
  const pop = useSharedValue(1);
  const opacity = useSharedValue(0);
  const hadFit = useRef(fit !== null);
  const col = fit ? fitColor(fit, light).solid : onPhoto.textSecondary;
  // Dishes that are out or need a question carry more weight than the ones that are fine.
  const strong = fit === 'not_fit' || fit === 'cant_tell';

  useEffect(() => {
    // The verdict "pop": once, when a verdict first lands on this box, staggered down the menu.
    if (fit && !hadFit.current && !reduced) {
      pop.value = withDelay(order * 50, withSequence(withTiming(1.04, { duration: 140 }), withSpring(1, spring.pop)));
    }
    // The box is there as soon as the dish has a name: faint and grey until a verdict colours it.
    opacity.value = withDelay(order * 50, withTiming(fit ? 1 : 0.6, { duration: 300 }));
    hadFit.current = fit !== null;
  }, [fit, order, reduced, pop, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: pop.value }] }));
  if (hidden) return null;

  return (
    <Animated.View style={[{ position: 'absolute', left: rect.x - 5, top: rect.y - 4, width: rect.width + 10, height: rect.height + 8 }, style]}>
      <Tap accessibilityRole="button" accessibilityLabel={`${item.name}${fit ? `, ${fit.replace('_', ' ')}` : ''}`} feedback="select" onPress={onPress} hitSlop={6} scaleTo={0.98} style={StyleSheet.absoluteFill}>
        <View
          style={[
            styles.box,
            {
              borderColor: col,
              borderWidth: selected ? 3 : strong ? 2.5 : 1.5,
              borderStyle: checking ? 'dashed' : 'solid',
              // A light wash of the verdict's colour, so a dish reads at a glance without a label.
              backgroundColor: fit ? `${col}${selected ? '40' : strong ? '2E' : '1F'}` : 'transparent',
            },
          ]}
        />
      </Tap>
    </Animated.View>
  );
}

/** The selected dish's name and reason, beside its box rather than over it. */
function DishLabel({ name, fit, reason, rect, bounds }: { name: string; fit: Fit | null; reason: string | null; rect: Rect; bounds: { width: number; height: number; top?: number } }) {
  const reduced = useReducedMotion();
  const col = fit ? fitColor(fit, light).solid : light.cantTell;
  const width = Math.min(Math.max(140, estimateChipWidth(name, reason)), bounds.width - 20);
  const above = rect.y - 4 - LABEL_GAP - LABEL_HEIGHT;
  const below = rect.y + rect.height + 4 + LABEL_GAP;
  // Above the box when that keeps clear of the top bar; otherwise below it, unless that would go under the sheet.
  const y = above >= (bounds.top ?? 0) + 4 || below + LABEL_HEIGHT > bounds.height ? Math.max((bounds.top ?? 0) + 4, above) : below;
  const x = Math.max(10, Math.min(rect.x - 5, bounds.width - 10 - width));
  return (
    <Animated.View pointerEvents="none" entering={reduced ? FadeIn.duration(duration.fast) : ZoomIn.springify().damping(16)} exiting={FadeOut.duration(duration.fast)} style={[styles.label, shadow('floating', false), { left: x, top: y, width }]}>
      <View style={styles.row}>
        <VerdictDot fit={fit} size={9} />
        <T variant="caption" color={onPhoto.chipText} numberOfLines={1} style={styles.name}>
          {name}
        </T>
      </View>
      {reason ? (
        <T variant="caption" color={col} numberOfLines={1} style={styles.reason}>
          {reason}
        </T>
      ) : null}
    </Animated.View>
  );
}

/**
 * Every line of text found on the photo, as faint outlines. Shown for the first seconds of a scan, before any dish
 * has a name, so the menu is visibly being found; replaced by the dish boxes once they exist.
 */
export function TextOutlines({ photo, boxes }: { photo: Rect; boxes: Box[] }) {
  const reduced = useReducedMotion();
  if (photo.width === 0) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {boxes.map((b, i) => {
        const r = boxToRect(b, photo);
        return (
          <Animated.View
            key={i}
            entering={reduced ? FadeIn.duration(duration.fast) : FadeIn.duration(duration.base).delay(Math.min(i * 12, 600))}
            exiting={FadeOut.duration(duration.fast)}
            style={[styles.textLine, { left: r.x - 2, top: r.y - 1, width: r.width + 4, height: r.height + 2 }]}
          />
        );
      })}
    </View>
  );
}

/**
 * Lines that already look like trouble, a couple of seconds into a scan: a dashed box in the colour the dish is
 * likely to end up, drawn over the faint text outlines. Dashed means "still checking", as it does on the dish boxes.
 */
export function EarlyHints({ photo, hints }: { photo: Rect; hints: { box: Box; fit: 'not_fit' | 'cant_tell' }[] }) {
  const reduced = useReducedMotion();
  if (photo.width === 0) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {hints.map((h, i) => {
        const r = boxToRect(h.box, photo);
        const col = fitColor(h.fit, light).solid;
        return (
          <Animated.View
            key={`${h.box.top}-${h.box.left}`}
            entering={reduced ? FadeIn.duration(duration.fast) : ZoomIn.springify().damping(14).delay(Math.min(i * 60, 400))}
            exiting={FadeOut.duration(duration.fast)}
            style={[styles.hint, { left: r.x - 4, top: r.y - 3, width: r.width + 8, height: r.height + 6, borderColor: col, backgroundColor: `${col}33` }]}
          />
        );
      })}
    </View>
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
  box: { flex: 1, borderRadius: radius.sm },
  label: { position: 'absolute', height: LABEL_HEIGHT, backgroundColor: onPhoto.chip, borderRadius: 14, paddingHorizontal: space.md, justifyContent: 'center' },
  hint: { position: 'absolute', borderWidth: 2, borderRadius: 5, borderStyle: 'dashed' },
  textLine: { position: 'absolute', borderWidth: 1, borderRadius: 3, borderColor: 'rgba(255,255,255,0.55)', backgroundColor: 'rgba(255,255,255,0.08)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { fontWeight: '600', flexShrink: 1 },
  reason: { marginLeft: 16, marginTop: 1, fontSize: 12, lineHeight: 15 },
  sweepLine: { position: 'absolute', left: 0, right: 0, top: 59, height: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
});

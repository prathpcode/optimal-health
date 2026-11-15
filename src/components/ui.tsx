import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { Fit } from '@engine/types';
import { fitColor, FIT_LABEL } from '@/lib/verdict';
import { duration, ease, radius, shadow, space, spring, useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';
import { T } from './T';
import { Tap } from './Tap';

// Small shared building blocks. Each uses only theme tokens.

/** A slip of check paper: hairline-edged, lying nearly flat on the green stock. */
export function Card({ children, style, muted }: { children: ReactNode; style?: StyleProp<ViewStyle>; muted?: boolean }) {
  const { c, dark } = useTheme();
  return (
    <View
      style={[
        { backgroundColor: muted ? c.cardMuted : c.card, borderRadius: radius.card, padding: space.lg },
        { borderWidth: StyleSheet.hairlineWidth, borderColor: c.rule },
        muted ? null : shadow('card', dark),
        style,
      ]}>
      {children}
    </View>
  );
}

/** A ruled line across a slip, as printed on a guest check. */
export function Rule({ inset = 0, strong }: { inset?: number; strong?: boolean }) {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, marginLeft: inset, backgroundColor: strong ? c.rule : c.hairline }} />;
}

/** The perforated edge of anything you tear off or hand over. */
export function Perforation({ color }: { color?: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.perf} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: 28 }).map((_, i) => (
        <View key={i} style={[styles.perfHole, { backgroundColor: color ?? c.bg }]} />
      ))}
    </View>
  );
}

/**
 * The verdict as line form, so it reads without colour: a ruled line for Good fit, a double rule for Okay, a dashed
 * line for Can't tell. Not a fit strikes through the dish name instead (see strikeFor).
 */
export function VerdictLine({ fit, width = 28 }: { fit: Fit | null; width?: number }) {
  const { c } = useTheme();
  const col = fit ? fitColor(fit, c).solid : c.textTertiary;
  if (fit === 'okay') {
    return (
      <View style={{ width, gap: 2 }}>
        <View style={{ height: 2, backgroundColor: col, borderRadius: 1 }} />
        <View style={{ height: 2, backgroundColor: col, borderRadius: 1 }} />
      </View>
    );
  }
  if (fit === 'cant_tell' || fit === null) {
    return (
      <View style={{ width, flexDirection: 'row', justifyContent: 'space-between' }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: width / 6, height: 2, backgroundColor: col, borderRadius: 1 }} />
        ))}
      </View>
    );
  }
  if (fit === 'not_fit') {
    return (
      <View style={{ width, height: 6, justifyContent: 'center' }}>
        <View style={{ height: 2, backgroundColor: col, borderRadius: 1, transform: [{ rotate: '-8deg' }] }} />
      </View>
    );
  }
  return <View style={{ width, height: 2, backgroundColor: col, borderRadius: 1 }} />;
}

/** Text style for a dish name: carbon-struck when it is not a fit. */
export function strikeFor(fit: Fit | null, c: { notFit: string }) {
  return fit === 'not_fit' ? ({ textDecorationLine: 'line-through', textDecorationColor: c.notFit } as const) : null;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const primary = variant === 'primary';
  const fg = primary ? c.onPrimary : c.text;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      feedback="tap"
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        primary ? { backgroundColor: c.primary } : { backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: c.rule },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={17} color={fg} /> : null}
          <T variant="headline" color={fg}>
            {label}
          </T>
        </>
      )}
    </Tap>
  );
}

/** A coloured dot that animates between verdict colours and pulses while there is no verdict yet. */
export function VerdictDot({ fit, size = 10 }: { fit: Fit | null; size?: number }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);
  const progress = useSharedValue(fit ? 1 : 0);
  const target = fit ? fitColor(fit, c).solid : c.textTertiary;
  const from = useSharedValue(c.textTertiary);
  const to = useSharedValue(target);

  useEffect(() => {
    if (fit) {
      pulse.value = withTiming(1, { duration: duration.fast });
      return;
    }
    if (reduced) return;
    pulse.value = withRepeat(withSequence(withTiming(0.35, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
  }, [fit, reduced, pulse]);

  useEffect(() => {
    from.value = to.value;
    to.value = target;
    progress.value = 0;
    progress.value = withTiming(1, { duration: duration.base, easing: ease });
  }, [target, from, to, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: pulse.value,
    backgroundColor: interpolateColor(progress.value, [0, 1], [from.value, to.value]),
  }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2 }, style]} />;
}

export function VerdictPill({ fit, large }: { fit: Fit; large?: boolean }) {
  const { c } = useTheme();
  const col = fitColor(fit, c);
  return (
    <View
      accessibilityLabel={FIT_LABEL[fit]}
      style={[styles.pill, { backgroundColor: col.soft }, large ? { paddingHorizontal: space.md, paddingVertical: space.sm } : null]}>
      <VerdictDot fit={fit} size={large ? 9 : 7} />
      <T variant={large ? 'bodyStrong' : 'caption'} color={col.solid}>
        {FIT_LABEL[fit]}
      </T>
    </View>
  );
}

/** A printed column heading on the check: check-green caps. */
export function SectionLabel({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={style} accessibilityRole="header">
      <T variant="micro" color={c.check}>
        {children}
      </T>
    </View>
  );
}

/** Selectable chip with an animated fill and check. */
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.value = withSpring(selected ? 1 : 0, spring.snappy);
  }, [selected, on]);
  const box = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [c.card, c.primary]),
    borderColor: interpolateColor(on.value, [0, 1], [c.rule, c.primary]),
  }));
  const check = useAnimatedStyle(() => ({ width: on.value * 18, opacity: on.value, transform: [{ scale: 0.6 + on.value * 0.4 }] }));
  return (
    <Tap accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={label} feedback="select" onPress={onPress}>
      <Animated.View style={[styles.chip, box]}>
        <Animated.View style={[styles.chipCheck, check]}>
          <Icon name="check" size={13} color={c.onPrimary} weight="bold" />
        </Animated.View>
        <T variant="bodyStrong" color={selected ? c.onPrimary : c.text}>
          {label}
        </T>
      </Animated.View>
    </Tap>
  );
}

/** Shimmering placeholder line. */
export function Skeleton({ width, height = 14, style }: { width: number | `${number}%`; height?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const o = useSharedValue(0.5);
  useEffect(() => {
    if (reduced) return;
    o.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0.5, { duration: 650 })), -1);
  }, [o, reduced]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: height / 2, backgroundColor: c.cardMuted }, anim, style]} />;
}

const styles = StyleSheet.create({
  button: {
    height: 54,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.chip,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingHorizontal: space.lg,
    borderRadius: radius.chip,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  perf: { flexDirection: 'row', justifyContent: 'space-between', overflow: 'hidden', height: 6 },
  perfHole: { width: 6, height: 6, borderRadius: 3 },
  chipCheck: { overflow: 'hidden', alignItems: 'flex-start', justifyContent: 'center', height: 18 },
});

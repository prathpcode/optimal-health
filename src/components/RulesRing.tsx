import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { duration, ease, useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Segment = { value: number; color: string };

/** A ring split into coloured arcs (one per rule level) that draw themselves in on mount. */
export function RulesRing({ segments, size = 108, stroke = 11, center }: { segments: Segment[]; size?: number; stroke?: number; center: ReactNode }) {
  const { c } = useTheme();
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const gap = total > 1 ? 6 : 0;

  const arcs = segments
    .filter((s) => s.value > 0)
    .reduce<{ color: string; start: number; length: number; end: number }[]>((acc, s) => {
      const start = acc.length ? acc[acc.length - 1].end : 0;
      const length = total ? (s.value / total) * circumference : 0;
      return [...acc, { color: s.color, start, length: Math.max(0, length - gap), end: start + length }];
    }, []);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.cardMuted} strokeWidth={stroke} fill="none" />
        {arcs.map((a, i) => (
          <Arc key={`${a.color}-${i}`} index={i} size={size} r={r} stroke={stroke} color={a.color} start={a.start} length={a.length} circumference={circumference} />
        ))}
      </Svg>
      {center}
    </View>
  );
}

function Arc({ index, size, r, stroke, color, start, length, circumference }: { index: number; size: number; r: number; stroke: number; color: string; start: number; length: number; circumference: number }) {
  const reduced = useReducedMotion();
  const drawn = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    drawn.value = reduced ? 1 : withDelay(index * 120, withTiming(1, { duration: duration.ring, easing: ease }));
  }, [length, index, reduced, drawn]);

  // Standard progress-ring technique: a static dash pattern, an animated offset, and the arc rotated to its start.
  const props = useAnimatedProps(() => ({ strokeDashoffset: circumference - length * drawn.value }));

  return (
    <AnimatedCircle
      cx={size / 2}
      cy={size / 2}
      r={r}
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap={length > stroke ? 'round' : 'butt'}
      fill="none"
      strokeDasharray={`${circumference} ${circumference}`}
      rotation={(start / circumference) * 360}
      origin={`${size / 2}, ${size / 2}`}
      animatedProps={props}
    />
  );
}

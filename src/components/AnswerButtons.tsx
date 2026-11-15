import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import type { Answer } from '@/lib/scan';
import { radius, spring, useTheme } from '@/theme';
import { T } from './T';
import { Tap } from './Tap';

const options = (skipLabel: string): { value: Answer; label: string }[] => [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'skipped', label: skipLabel },
];

/** Segmented Yes / No / Didn't ask, with a sliding selection. */
export function AnswerButtons({ value, onChange, question, skipLabel = 'Didn’t ask' }: { value?: Answer; onChange: (v: Answer) => void; question: string; skipLabel?: string }) {
  const OPTIONS = options(skipLabel);
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const index = value ? OPTIONS.findIndex((o) => o.value === value) : -1;
  const x = useSharedValue(0);
  const shown = useSharedValue(index >= 0 ? 1 : 0);
  const segment = width / OPTIONS.length;

  useEffect(() => {
    if (index >= 0) x.value = withSpring(index * segment, spring.snappy);
    shown.value = withSpring(index >= 0 ? 1 : 0, spring.snappy);
  }, [index, segment, x, shown]);

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { scale: 0.9 + shown.value * 0.1 }], opacity: shown.value }));
  const selectedBg = value === 'yes' ? c.notFit : c.primary;

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={question}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width - 8)}
      style={[styles.track, { backgroundColor: c.cardMuted }]}>
      {width > 0 ? <Animated.View style={[styles.thumb, { width: segment, backgroundColor: selectedBg }, thumb]} /> : null}
      {OPTIONS.map((o) => {
        const on = o.value === value;
        return (
          <Tap
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            feedback="select"
            onPress={() => onChange(o.value)}
            style={styles.option}>
            <T variant="bodyStrong" color={on ? (value === 'yes' ? c.onAccent : c.onPrimary) : c.text}>
              {o.label}
            </T>
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.button, padding: 4, height: 48 },
  thumb: { position: 'absolute', top: 4, left: 4, bottom: 4, borderRadius: radius.button - 4 },
  option: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

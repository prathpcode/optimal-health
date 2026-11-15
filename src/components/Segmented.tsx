import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { radius, shadow, spring, useTheme } from '@/theme';
import { T } from './T';
import { Tap } from './Tap';

/** A segmented control with a sliding thumb. Generic over the option values. */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  label: string;
}) {
  const { c, dark } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segment = width / options.length;
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withSpring(index * segment, spring.snappy);
  }, [index, segment, x]);

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width - 8)}
      style={[styles.track, { backgroundColor: c.cardMuted }]}>
      {width > 0 ? <Animated.View style={[styles.thumb, { width: segment, backgroundColor: c.card }, shadow('card', dark), thumb]} /> : null}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Tap
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            feedback="select"
            scaleTo={1}
            onPress={() => onChange(o.value)}
            style={styles.option}>
            <T variant="bodyStrong" tone={on ? 'primary' : 'secondary'}>
              {o.label}
            </T>
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', height: 40, borderRadius: radius.button, padding: 4 },
  thumb: { position: 'absolute', top: 4, left: 4, bottom: 4, borderRadius: radius.sm },
  option: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { duration, pressScale, spring } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type TapProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** How far it shrinks under a finger. */
  scaleTo?: number;
  /** Light haptic on press. On for primary actions. */
  feedback?: 'tap' | 'select' | 'none';
};

/** Every pressable surface: shrinks on press-in with a spring, springs back on release. */
export function Tap({ style, scaleTo = pressScale, feedback = 'none', onPressIn, onPressOut, onPress, disabled, ...rest }: TapProps) {
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);

  const animated = useAnimatedStyle(() => {
    const base = disabled ? 0.4 : 1;
    if (reduced) return { opacity: base * (1 - pressed.value * 0.25) };
    return { opacity: base, transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }] };
  });

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        pressed.value = reduced ? withTiming(1, { duration: duration.fast }) : withSpring(1, spring.snappy);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = reduced ? withTiming(0, { duration: duration.fast }) : withSpring(0, spring.snappy);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (feedback === 'tap') haptic.tap();
        if (feedback === 'select') haptic.select();
        onPress?.(e);
      }}
      style={[style, animated]}
    />
  );
}

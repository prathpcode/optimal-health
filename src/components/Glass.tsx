import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { onPhoto, radius } from '@/theme';
import { Icon, type IconName } from './Icon';
import { Tap } from './Tap';

let glassOk: boolean | null = null;
function canUseGlass(): boolean {
  if (glassOk === null) {
    try {
      glassOk = isGlassEffectAPIAvailable();
    } catch {
      glassOk = false;
    }
  }
  return glassOk;
}

/** Liquid glass on iOS 26+, a dark translucent surface everywhere else (or with Reduce Transparency on). */
export function GlassSurface({ children, style, interactive }: { children?: ReactNode; style?: StyleProp<ViewStyle>; interactive?: boolean }) {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then(setReduceTransparency)
      .catch(() => {});
  }, []);

  if (canUseGlass() && !reduceTransparency) {
    return (
      <GlassView glassEffectStyle="regular" colorScheme="dark" isInteractive={interactive} style={[styles.base, style]}>
        {children}
      </GlassView>
    );
  }
  return <View style={[styles.base, { backgroundColor: onPhoto.glassFallback }, style]}>{children}</View>;
}

/** Round glass control for use over the camera or the photo. */
export function GlassButton({ icon, onPress, label, size = 44 }: { icon: IconName; onPress: () => void; label: string; size?: number }) {
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} feedback="tap" onPress={onPress} hitSlop={8}>
      <GlassSurface interactive style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={size * 0.4} color={onPhoto.text} />
      </GlassSurface>
    </Tap>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden', borderRadius: radius.chip },
});

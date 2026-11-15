import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { onPhoto, radius, useTheme } from '@/theme';
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

/** 'photo' sits over the camera or a photo and is always dark; 'theme' sits over app screens and follows light or dark. */
type Tone = 'photo' | 'theme';

/** Liquid glass on iOS 26+, a translucent surface everywhere else (or with Reduce Transparency on). */
export function GlassSurface({ children, style, interactive, tone = 'photo' }: { children?: ReactNode; style?: StyleProp<ViewStyle>; interactive?: boolean; tone?: Tone }) {
  const { c, dark } = useTheme();
  const [reduceTransparency, setReduceTransparency] = useState(false);
  useEffect(() => {
    // Not implemented on web.
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then(setReduceTransparency)
      .catch(() => {});
  }, []);

  if (canUseGlass() && !reduceTransparency) {
    return (
      <GlassView glassEffectStyle="regular" colorScheme={tone === 'photo' || dark ? 'dark' : 'light'} isInteractive={interactive} style={[styles.base, style]}>
        {children}
      </GlassView>
    );
  }
  return <View style={[styles.base, { backgroundColor: tone === 'photo' ? onPhoto.glassFallback : c.glass }, style]}>{children}</View>;
}

/** Round glass control. */
export function GlassButton({ icon, onPress, label, size = 44, tone = 'photo', disabled }: { icon: IconName; onPress: () => void; label: string; size?: number; tone?: Tone; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} feedback="tap" onPress={onPress} disabled={disabled} hitSlop={8}>
      <GlassSurface interactive tone={tone} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={size * 0.4} color={tone === 'photo' ? onPhoto.text : c.text} />
      </GlassSurface>
    </Tap>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden', borderRadius: radius.chip },
});

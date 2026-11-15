import { Text, type TextProps } from 'react-native';

import { type, useTheme, type TypeVariant } from '@/theme';

type Tone = 'primary' | 'secondary' | 'tertiary';

export type TProps = TextProps & { variant?: TypeVariant; tone?: Tone; color?: string };

/** The only text component. Variant sets size and weight from the type scale; tone picks the theme colour. */
export function T({ variant = 'body', tone = 'primary', color, style, ...rest }: TProps) {
  const { c } = useTheme();
  const toneColor = tone === 'secondary' ? c.textSecondary : tone === 'tertiary' ? c.textTertiary : c.text;
  return <Text maxFontSizeMultiplier={1.4} {...rest} style={[type[variant], { color: color ?? toneColor }, style]} />;
}

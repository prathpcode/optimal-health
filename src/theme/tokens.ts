import { Platform, type TextStyle, type ViewStyle } from 'react-native';

// The only source of colour, type, spacing, radius and shadow values. Screens use these and nothing else.

export const palette = {
  light: {
    bg: '#F6F6F4',
    card: '#FFFFFF',
    cardMuted: '#F0F0EE',
    text: '#0B0B0C',
    textSecondary: '#6B6B70',
    textTertiary: '#A3A3A8',
    hairline: 'rgba(0,0,0,0.06)',
    primary: '#0B0B0C',
    onPrimary: '#FFFFFF',
    onAccent: '#FFFFFF',
    good: '#1FA463',
    okay: '#E8A317',
    notFit: '#E5484D',
    cantTell: '#8E8E93',
    goodSoft: 'rgba(31,164,99,0.12)',
    okaySoft: 'rgba(232,163,23,0.14)',
    notFitSoft: 'rgba(229,72,77,0.12)',
    cantTellSoft: 'rgba(142,142,147,0.14)',
    scrim: 'rgba(0,0,0,0.35)',
    glass: 'rgba(255,255,255,0.72)',
  },
  dark: {
    bg: '#0B0B0C',
    card: '#1A1A1C',
    cardMuted: '#232326',
    text: '#F5F5F4',
    textSecondary: '#9A9AA0',
    textTertiary: '#636368',
    hairline: 'rgba(255,255,255,0.08)',
    primary: '#F5F5F4',
    onPrimary: '#0B0B0C',
    onAccent: '#FFFFFF',
    good: '#34C77B',
    okay: '#F2B63D',
    notFit: '#FF6369',
    cantTell: '#A1A1A6',
    goodSoft: 'rgba(52,199,123,0.16)',
    okaySoft: 'rgba(242,182,61,0.16)',
    notFitSoft: 'rgba(255,99,105,0.16)',
    cantTellSoft: 'rgba(161,161,166,0.18)',
    scrim: 'rgba(0,0,0,0.5)',
    glass: 'rgba(44,44,46,0.6)',
  },
} as const;

export type Colors = { [K in keyof (typeof palette)['light']]: string };

/** Colours used on top of the camera and photo, the same in both themes. */
export const onPhoto = {
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.72)',
  chip: '#FFFFFF',
  chipText: '#0B0B0C',
  chipTextSecondary: '#6B6B70',
  glassFallback: 'rgba(28,28,30,0.55)',
  black: '#000000',
} as const;

/** One accent per community room, used for its icon. Same in both themes; tiles use it at low opacity. */
export const roomAccent: Record<string, string> = {
  'heart-health': '#FF5A5F',
  'kidney-health': '#3D8BFF',
  diabetes: '#8B6CFF',
  'gluten-free': '#F0A202',
  'dairy-free': '#2BB3D9',
  'liver-health': '#22B573',
  'gut-health': '#FF7A33',
  gout: '#E0457B',
  'plant-based': '#3CB043',
  'nut-allergy': '#B8763E',
  'seafood-allergy': '#1AA6A6',
};

/** A hex colour at an opacity, for soft tints. */
export function tint(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;
export const gutter = space.xl;

/**
 * Every tab lays out its top the same way: a row of round glass buttons at `topBar` below the safe area, and the
 * page title starting at `titleTop` below it, centred. Keeping these shared is what lines the tabs up.
 */
export const topBar = space.md;
export const titleTop = 64;

export const radius = { chip: 999, sm: 10, button: 16, md: 18, card: 24, sheet: 28 } as const;

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const type = {
  /** Headlines and headings. Geist is loaded in the root layout, one family per weight; no fontWeight with it. */
  hero: { fontFamily: 'Geist-Regular', fontSize: 34, lineHeight: 42, letterSpacing: -0.8 },
  heroBold: { fontFamily: 'Geist-SemiBold', fontSize: 34, lineHeight: 42, letterSpacing: -0.8 },
  heading: { fontFamily: 'Geist-SemiBold', fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  /** A sentence that opens a screen or sheet: the hero's regular weight at reading size, with `leadBold` for the phrase that matters. */
  lead: { fontFamily: 'Geist-Regular', fontSize: 22, lineHeight: 30, letterSpacing: -0.4 },
  leadBold: { fontFamily: 'Geist-SemiBold', fontSize: 22, lineHeight: 30, letterSpacing: -0.4 },
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.6, ...tabular },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.3 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  micro: { fontSize: 11, lineHeight: 13, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

export function shadow(level: 'card' | 'floating', dark: boolean): ViewStyle {
  if (dark) return {};
  const s = level === 'card' ? { y: 4, r: 16, o: 0.06 } : { y: 8, r: 24, o: 0.14 };
  return Platform.select<ViewStyle>({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: s.y }, shadowRadius: s.r / 2, shadowOpacity: s.o },
    android: { elevation: level === 'card' ? 2 : 8 },
    default: { boxShadow: `0 ${s.y}px ${s.r}px rgba(0,0,0,${s.o})` },
  })!;
}

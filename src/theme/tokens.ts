import { Platform, type TextStyle, type ViewStyle } from 'react-native';

// The only source of colour, type, spacing, radius and shadow values. Screens use these and nothing else.

export const palette = {
  // The Guest Check: pale green check stock as the ground, slip-white sheets ruled in check green, ink for text,
  // carbon violet for figures. Verdict colours appear only on verdicts.
  light: {
    bg: '#E3EBD8',
    card: '#FBFCF8',
    cardMuted: '#EDF2E6',
    text: '#16181A',
    textSecondary: '#4B564C',
    textTertiary: '#6F7B70',
    hairline: 'rgba(47,93,58,0.16)',
    rule: 'rgba(47,93,58,0.32)',
    check: '#2F5D3A',
    carbon: '#3B3F8F',
    primary: '#16181A',
    onPrimary: '#FFFFFF',
    onAccent: '#FFFFFF',
    good: '#1A9458',
    okay: '#B97A00',
    notFit: '#D93A40',
    cantTell: '#6E6E73',
    goodSoft: 'rgba(26,148,88,0.12)',
    okaySoft: 'rgba(214,150,10,0.16)',
    notFitSoft: 'rgba(217,58,64,0.11)',
    cantTellSoft: 'rgba(110,110,115,0.13)',
    scrim: 'rgba(0,0,0,0.35)',
  },
  dark: {
    bg: '#0E1310',
    card: '#171E19',
    cardMuted: '#1F2822',
    text: '#EEF2EA',
    textSecondary: '#A2AEA4',
    textTertiary: '#748177',
    hairline: 'rgba(160,205,170,0.12)',
    rule: 'rgba(160,205,170,0.26)',
    check: '#8DBE95',
    carbon: '#AEB2F7',
    primary: '#EEF2EA',
    onPrimary: '#0E1310',
    onAccent: '#FFFFFF',
    good: '#3CC983',
    okay: '#F2B63D',
    notFit: '#FF6369',
    cantTell: '#A1A1A6',
    goodSoft: 'rgba(60,201,131,0.15)',
    okaySoft: 'rgba(242,182,61,0.16)',
    notFitSoft: 'rgba(255,99,105,0.15)',
    cantTellSoft: 'rgba(161,161,166,0.16)',
    scrim: 'rgba(0,0,0,0.5)',
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

/** One accent per community room, used for its tile and icon. Same in both themes; tiles use it at low opacity. */
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

/** Paper corners: slips and buttons are only gently rounded; pills stay round. */
export const radius = { chip: 999, sm: 8, button: 14, md: 12, card: 16, sheet: 22 } as const;

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/**
 * Four sizes do the work (34 / 22 / 17 / 13, iOS Large Title, Title 2, Body, Footnote); weight makes the rest of
 * the hierarchy. micro is the check's printed column heading, the only uppercase style.
 */
export const type = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.4, ...tabular },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 17, lineHeight: 23, fontWeight: '400', letterSpacing: -0.2 },
  bodyStrong: { fontSize: 17, lineHeight: 23, fontWeight: '600', letterSpacing: -0.2 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  micro: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  /** Questions shown to a server across the table: the one size above Title, for reading at arm's length. */
  stub: { fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.4 },
  figure: { fontSize: 13, lineHeight: 18, fontWeight: '600', fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), ...tabular },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

export function shadow(level: 'card' | 'floating', dark: boolean): ViewStyle {
  if (dark) return {};
  // A slip lies flat on the check stock (a short, tight shadow); only things that float (sheets, chips on the photo) lift.
  const s = level === 'card' ? { y: 1, r: 3, o: 0.07 } : { y: 8, r: 24, o: 0.16 };
  return Platform.select<ViewStyle>({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: s.y }, shadowRadius: s.r / 2, shadowOpacity: s.o },
    android: { elevation: level === 'card' ? 2 : 8 },
    default: { boxShadow: `0 ${s.y}px ${s.r}px rgba(0,0,0,${s.o})` },
  })!;
}

import type { Fit, RankedItem } from '@engine/types';
import type { Colors } from '@/theme';

// Verdict wording is fixed by PLAN rule 1. The app never says "safe".

export const FIT_LABEL: Record<Fit, string> = {
  good: 'Good fit',
  okay: 'Okay, with notes',
  not_fit: 'Not a fit',
  cant_tell: "Can't tell",
};

export const SECTION_LABEL: Record<RankedItem['section'], string> = {
  best: 'Best for you',
  okay: 'Okay',
  cant_tell: "Can't tell",
  not_fit: 'Not a fit',
};

export const SECTION_FIT: Record<RankedItem['section'], Fit> = {
  best: 'good',
  okay: 'okay',
  cant_tell: 'cant_tell',
  not_fit: 'not_fit',
};

export function fitColor(fit: Fit, c: Colors): { solid: string; soft: string } {
  switch (fit) {
    case 'good':
      return { solid: c.good, soft: c.goodSoft };
    case 'okay':
      return { solid: c.okay, soft: c.okaySoft };
    case 'not_fit':
      return { solid: c.notFit, soft: c.notFitSoft };
    default:
      return { solid: c.cantTell, soft: c.cantTellSoft };
  }
}

export const LEVEL_LABEL = { never: 'Never', avoid: 'Avoid', limit: 'Limit', keep_steady: 'Keep steady' } as const;

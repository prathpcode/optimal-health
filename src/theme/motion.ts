import { Easing, FadeIn, FadeInDown, type WithSpringConfig } from 'react-native-reanimated';

// Every animation value in the app. Nothing else defines a duration, spring or curve.

export const spring = {
  /** Buttons, chips, small things that respond to a finger. */
  snappy: { damping: 18, stiffness: 260, mass: 1 } satisfies WithSpringConfig,
  /** Sheets, cards, things that travel. */
  gentle: { damping: 22, stiffness: 180, mass: 1 } satisfies WithSpringConfig,
  /** A single overshoot, for the verdict "pop". */
  pop: { damping: 9, stiffness: 320, mass: 0.8 } satisfies WithSpringConfig,
};

export const duration = { fast: 160, base: 240, slow: 420, ring: 700, sweep: 1400, /** A celebration's title stays up this long. */ cheer: 2200, /** Confetti drifting from the top of the screen to the bottom. */ confetti: 4200 } as const;

export const ease = Easing.bezier(0.2, 0, 0, 1);

export const pressScale = 0.96;

/** List entrance: fade + rise, staggered, capped so long lists never wait. */
export function enterAt(index: number, reduced: boolean) {
  const delay = Math.min(index, 8) * 40;
  if (reduced) return FadeIn.duration(duration.fast).delay(delay);
  return FadeInDown.springify().damping(spring.gentle.damping).stiffness(spring.gentle.stiffness).delay(delay);
}

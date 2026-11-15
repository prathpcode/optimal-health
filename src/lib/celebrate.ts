import { useSyncExternalStore } from 'react';

import type { IconName } from '@/components/Icon';

/**
 * A moment worth celebrating: joining or starting a challenge, or logging a meal. The root layout draws a title and a slow
 * fall of confetti for whichever arrives (src/components/Celebration.tsx).
 */
export type Celebration = { id: number; title: string; subtitle?: string; tone: 'great' | 'good' | 'neutral'; icon?: IconName };

let current: Celebration | null = null;
const listeners = new Set<() => void>();

export function celebrate(c: Omit<Celebration, 'id'>) {
  current = { ...c, id: Date.now() };
  listeners.forEach((l) => l());
}

export function clearCelebration(id: number) {
  if (current?.id !== id) return;
  current = null;
  listeners.forEach((l) => l());
}

export function useCelebration(): Celebration | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

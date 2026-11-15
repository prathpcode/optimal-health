import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

// The first name Home greets, asked for on the welcome screen. It stays on this phone: never sent to the backend or
// a model provider.

const KEY = 'fit.firstName';
let name: string | undefined;
let started = false;
const listeners = new Set<() => void>();

function load() {
  if (started) return;
  started = true;
  SecureStore.getItemAsync(KEY)
    .catch(() => null)
    .then((stored) => {
      if (name !== undefined) return;
      name = stored ?? '';
      listeners.forEach((l) => l());
    });
}

export function setFirstName(next: string) {
  name = next;
  listeners.forEach((l) => l());
  SecureStore.setItemAsync(KEY, next).catch(() => {});
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** `undefined` until the stored name has been read, then the name ('' when none has been given yet). */
export function useFirstName(): string | undefined {
  load();
  return useSyncExternalStore(
    subscribe,
    () => name,
    () => name,
  );
}

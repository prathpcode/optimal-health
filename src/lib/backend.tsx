import { ConvexProvider, ConvexReactClient } from 'convex/react';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const url = process.env.EXPO_PUBLIC_CONVEX_URL;

/** False when the app is built without a Convex URL: it then runs on the bundled sample only. */
export const HAS_BACKEND = Boolean(url);

export const convex = url ? new ConvexReactClient(url, { unsavedChangesWarning: false }) : null;

const DEVICE_KEY = 'fit.deviceId';
const DeviceContext = createContext<string | null>(null);

/** A random id made once per install. It stands in for an account (PLAN 7.1). */
async function loadDeviceId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_KEY);
    if (existing) return existing;
    const id = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_KEY, id);
    return id;
  } catch {
    // Storage can fail (simulator keychain quirks); a per-session id still lets the app work.
    return Crypto.randomUUID();
  }
}

export function BackendProvider({ children }: { children: ReactNode }) {
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadDeviceId().then((id) => {
      if (!alive) return;
      setDeviceId(id);
    });
    return () => {
      alive = false;
    };
  }, []);

  const tree = <DeviceContext.Provider value={deviceId}>{children}</DeviceContext.Provider>;
  return convex ? <ConvexProvider client={convex}>{tree}</ConvexProvider> : tree;
}

/** Null for the first few milliseconds while the id loads. */
export function useDeviceId(): string | null {
  return useContext(DeviceContext);
}

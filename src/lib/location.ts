import * as Location from 'expo-location';

/** Where the phone is, for telling one restaurant from another (PLAN 6.5). Never more precise than the backend needs. */
export type Where = { lat: number; lng: number };

let last: Where | null = null;

const timeout = <T,>(ms: number) => new Promise<T | null>((resolve) => setTimeout(() => resolve(null), ms));

async function read(): Promise<Where | null> {
  const known = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
  const fix = known ?? (await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), timeout<Location.LocationObject>(4000)]));
  return fix ? { lat: fix.coords.latitude, lng: fix.coords.longitude } : null;
}

/**
 * The phone's location, or null. Never throws and never waits more than a few seconds: a scan must not fail or
 * stall because location is off. With `ask`, the permission prompt is shown if the person has not decided yet;
 * without it, nothing is ever shown.
 */
export async function locate(options: { ask?: boolean } = {}): Promise<Where | null> {
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted && options.ask && permission.canAskAgain) permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const where = await read();
    if (where) last = where;
    return where ?? last;
  } catch {
    return last;
  }
}

/** The most recent location already in hand, without waiting for anything. */
export function lastLocation(): Where | null {
  return last;
}

/** True when location is switched off for the app and only Settings can change that. */
export async function locationBlocked(): Promise<boolean> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    return !permission.granted && !permission.canAskAgain;
  } catch {
    return false;
  }
}

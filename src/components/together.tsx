import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';

import { celebrate } from '@/lib/celebrate';
import { useMealForScan, useTogether as useTogetherRooms, type Reaction, type RoomView } from '@/lib/community';
import { signInWithWhop, useWhopAccount } from '@/lib/whop';
import { joinOnWhop, needsMembership } from '@/lib/whopForum';
import { radius, space, spring, useTheme } from '@/theme';
import { GlassSurface } from './Glass';
import { Icon, type IconName } from './Icon';
import { T } from './T';
import { Tap } from './Tap';

/** The full-width glass button, like Scan on Home. */
export function GlassAction({ label, icon, onPress, loading, disabled }: { label: string; icon?: IconName; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} feedback="tap" scaleTo={0.97} onPress={onPress} disabled={disabled || loading}>
      <GlassSurface tone="theme" interactive style={styles.action}>
        {loading ? (
          <ActivityIndicator color={c.text} />
        ) : (
          <>
            {icon ? <Icon name={icon} size={20} color={c.text} /> : null}
            <T variant="heading">{label}</T>
          </>
        )}
      </GlassSurface>
    </Tap>
  );
}

/**
 * Anything you can see without an account, you can tap: if you're signed out, this asks you to sign in with Whop
 * first, then carries on to what you tapped.
 */
export function useSignedIn(): (then: () => void) => Promise<void> {
  const { account } = useWhopAccount();
  return async (then) => {
    if (account) return then();
    const r = await signInWithWhop();
    if (r.ok) then();
    else if (!r.cancelled) Alert.alert('Couldn’t sign in', r.message ?? 'Try again in a moment.');
  };
}

/** On a result reached from a room's "Share a meal": one button to share this scan to that room. */
export function ShareToRoom({ scanId, room }: { scanId: string; room: string }) {
  const { all } = useTogetherRooms();
  const r = all.find((x) => x.slug === room);
  return (
    <GlassAction
      label={r ? `Share with ${r.title}` : 'Share'}
      icon="send"
      onPress={() => router.push({ pathname: '/share/[scanId]', params: { scanId, room } })}
    />
  );
}

/** A section's title, as on Manage, with an optional small action on the right. */
export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.section}>
      <T variant="heading">{title}</T>
      {action}
    </View>
  );
}

/** A dot that pulses: shown only when real people are online right now. */
export function PulseDot({ color, size = 8 }: { color: string; size?: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    p.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1);
  }, [p, reduced]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - p.value), transform: [{ scale: 1 + p.value * 1.6 }] }));
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: color }, ring]} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

/** The one real fact under a room's name: who's online, else how many members, else why you're in it. Never invented. */
export function RoomStatus({ room }: { room: RoomView }) {
  const { c } = useTheme();
  if (room.online > 0) {
    return (
      <View style={styles.live}>
        <PulseDot color={c.good} size={7} />
        <T variant="caption" color={c.good}>
          {room.online} online
        </T>
      </View>
    );
  }
  const text = room.members > 0 ? `${compact(room.members)} ${room.members === 1 ? 'member' : 'members'}` : room.reasons[0] ? `For your ${room.reasons[0].toLowerCase()}` : '';
  if (!text) return null;
  return (
    <T variant="caption" tone="secondary" numberOfLines={1}>
      {text}
    </T>
  );
}

/** Run a Together action; if it fails, say why in a short alert. Resolves to whether it worked. */
export async function attempt(action: Promise<unknown>): Promise<boolean> {
  try {
    await action;
    return true;
  } catch (e) {
    const raw = e instanceof Error ? e.message : '';
    // Convex wraps server errors as "[CONVEX ...] Uncaught Error: <message> at ..."; keep only the message.
    const message = raw.match(/Uncaught Error: ([^\n]+?)(?:\s+at |\n|$)/)?.[1] ?? (raw.length < 120 ? raw : '');
    Alert.alert('Couldn’t do that', message || 'Try again in a moment.');
    return false;
  }
}

export const REACTION_LABEL: Record<Reaction, string> = { loved: 'Loved it', okay: 'It was okay', nope: 'Wouldn’t again' };

/** Pick a meal photo: take one or choose one. Resolves to a local uri, or null. */
export function pickPhoto(): Promise<string | null> {
  const fromCamera = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return null;
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.85 });
    return r.canceled ? null : (r.assets[0]?.uri ?? null);
  };
  const fromLibrary = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.85 });
    return r.canceled ? null : (r.assets[0]?.uri ?? null);
  };
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: ['Take photo', 'Choose from library', 'Cancel'], cancelButtonIndex: 2 }, (i) => {
        if (i === 0) void fromCamera().then(resolve);
        else if (i === 1) void fromLibrary().then(resolve);
        else resolve(null);
      });
    } else {
      Alert.alert('Add a photo', undefined, [
        { text: 'Take photo', onPress: () => void fromCamera().then(resolve) },
        { text: 'Choose from library', onPress: () => void fromLibrary().then(resolve) },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ]);
    }
  });
}

/**
 * Post to Whop. Rooms are public forums, so this usually just works; if Whop asks for membership first, offer the
 * one free step ("Join Fit on Whop"), then try again. Resolves to whether it posted.
 */
export async function postWithWhop(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run();
    return true;
  } catch (e) {
    if (!needsMembership(e)) return attempt(Promise.reject(e));
    const join = await new Promise<boolean>((resolve) =>
      Alert.alert('Join Fit on Whop', 'Free, and only once. Then you can post in every room.', [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Join', onPress: () => resolve(true) },
      ]),
    );
    if (!join) return false;
    await joinOnWhop();
    const ok = await attempt(run());
    if (ok) celebrate({ title: 'You’re in', subtitle: 'Post in any room', tone: 'great' });
    return ok;
  }
}

/** On a finished scan: "What did you order?", or what you logged. */
export function MealCard({ scanId }: { scanId: string }) {
  const { c } = useTheme();
  const meal = useMealForScan(scanId);
  const reduced = useReducedMotion();
  const pop = useSharedValue(0.9);
  useEffect(() => {
    pop.value = reduced ? 1 : withSpring(1, spring.pop);
  }, [meal, pop, reduced]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  if (meal === undefined) return null;

  const open = () => router.push({ pathname: '/ate/[scanId]', params: { scanId } });
  return (
    <Tap accessibilityRole="button" accessibilityLabel={meal ? `You ordered ${meal.dishName}. Change` : 'What did you order?'} feedback="tap" scaleTo={0.98} onPress={open}>
      <GlassSurface tone="theme" interactive style={styles.row}>
        <Animated.View style={[styles.rowIcon, { backgroundColor: meal ? c.goodSoft : c.primary }, iconStyle]}>
          <Icon name={meal ? 'check' : 'fork'} size={20} color={meal ? c.good : c.onPrimary} weight="bold" />
        </Animated.View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline" numberOfLines={1}>
            {meal ? meal.dishName : 'What did you order?'}
          </T>
          <T variant="caption" tone="secondary">
            {meal ? 'Logged · tap to change' : 'Log it to score your challenges'}
          </T>
        </View>
        <Icon name="chevron" size={14} color={c.textTertiary} />
      </GlassSurface>
    </Tap>
  );
}

/** Two or three tabs on glass, with a sliding thumb. */
export function GlassTabs<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const seg = width / options.length;
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withSpring(index * seg, spring.snappy);
  }, [index, seg, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <GlassSurface tone="theme" style={styles.tabs}>
      <View accessibilityRole="tablist" style={styles.tabRow} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? <Animated.View style={[styles.thumb, { width: seg, backgroundColor: c.card }, thumb]} /> : null}
        {options.map((o) => (
          <Tap
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: o.value === value }}
            feedback="select"
            scaleTo={1}
            onPress={() => onChange(o.value)}
            style={styles.tab}>
            <T variant="bodyStrong" tone={o.value === value ? 'primary' : 'secondary'}>
              {o.label}
            </T>
          </Tap>
        ))}
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  action: { height: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  live: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingRight: space.lg, borderRadius: radius.card },
  rowIcon: { width: 52, height: 52, borderRadius: radius.sm + 4, alignItems: 'center', justifyContent: 'center' },
  tabs: { height: 44, padding: 4 },
  tabRow: { flexDirection: 'row', flex: 1 },
  thumb: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: radius.chip },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

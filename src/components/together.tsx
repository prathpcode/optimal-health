import { router } from 'expo-router';
import { useEffect } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { useActiveChallenges, useMealForScan, useTopRoom, type Reaction, type RoomView } from '@/lib/community';
import { useWhopAccount } from '@/lib/whop';
import { radius, roomAccent, shadow, space, tint, useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';
import { T } from './T';
import { Tap } from './Tap';

const ORBIT: { icon: IconName; color: string }[] = [
  { icon: 'heart', color: roomAccent['heart-health'] },
  { icon: 'leaf', color: roomAccent['gluten-free'] },
  { icon: 'drop', color: roomAccent['kidney-health'] },
  { icon: 'chart', color: roomAccent.diabetes },
  { icon: 'flame', color: roomAccent['gut-health'] },
  { icon: 'shield', color: roomAccent['liver-health'] },
];

/** Room icons circling a centre mark, slowly. Used only when there is no matched room to lead with. */
export function Orbit({ size = 240 }: { size?: number }) {
  const { c, dark } = useTheme();
  const reduced = useReducedMotion();
  const spin = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    spin.value = withRepeat(withTiming(1, { duration: 40_000, easing: Easing.linear }), -1);
  }, [reduced, spin]);

  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const upright = useAnimatedStyle(() => ({ transform: [{ rotate: `${-spin.value * 360}deg` }] }));

  const r = size / 2 - 28;
  return (
    <View style={{ width: size, height: size, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[StyleSheet.absoluteFill, ring]}>
        {ORBIT.map((o, i) => {
          const a = (i / ORBIT.length) * Math.PI * 2;
          return (
            <Animated.View key={o.icon} style={[styles.bubble, { left: size / 2 + Math.cos(a) * r - 22, top: size / 2 + Math.sin(a) * r - 22, backgroundColor: o.color }, upright]}>
              <Icon name={o.icon} size={18} color="#FFFFFF" />
            </Animated.View>
          );
        })}
      </Animated.View>
      <View style={[styles.core, { backgroundColor: c.primary }, shadow('floating', dark)]}>
        <Icon name="people" size={30} color={c.onPrimary} />
      </View>
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

/** The one real fact under a room's name: who's online, else how many members, else why you're in it. */
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
  const text =
    room.members > 0 ? `${compact(room.members)} ${room.members === 1 ? 'member' : 'members'}` : room.reasons[0] ? `For your ${room.reasons[0].toLowerCase()}` : '';
  if (!text) return null;
  return (
    <T variant="caption" tone="secondary" numberOfLines={1}>
      {text}
    </T>
  );
}

/** A room as a tile in its accent colour. */
export function RoomTile({ room, width = 148 }: { room: RoomView; width?: number }) {
  const { dark } = useTheme();
  const accent = roomAccent[room.slug] ?? '#888888';
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={room.title}
      onPress={() => router.push({ pathname: '/community/[slug]', params: { slug: room.slug } })}
      scaleTo={0.96}
      feedback="tap">
      <View style={[styles.tile, { width, backgroundColor: tint(accent, dark ? 0.2 : 0.11) }]}>
        <View style={[styles.tileIcon, { backgroundColor: accent }]}>
          <Icon name={room.icon as IconName} size={20} color="#FFFFFF" />
        </View>
        <View style={{ gap: space.xs }}>
          <T variant="headline" numberOfLines={2}>
            {room.title}
          </T>
          <RoomStatus room={room} />
        </View>
      </View>
    </Tap>
  );
}

/** The last tile in the rooms carousel: find another room. */
export function AddTile({ width = 88 }: { width?: number }) {
  const { c } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel="Find more rooms" onPress={() => router.push('/rooms')} scaleTo={0.95} feedback="tap">
      <View style={[styles.tile, styles.add, { width, borderColor: c.hairline }]}>
        <Icon name="plus" size={20} color={c.textSecondary} weight="bold" />
      </View>
    </Tap>
  );
}

/** Run a Together action; if the server refuses, say why in a short alert. Resolves to whether it worked. */
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

/** Home's way into Together, led by your matched room. */
export function TogetherCard() {
  const { c, dark } = useTheme();
  const { account } = useWhopAccount();
  const room = useTopRoom();
  const live = useActiveChallenges()[0];
  const score = live?.me?.score;
  const card = [styles.home, { backgroundColor: c.card }, dark ? { borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline } : null, shadow('card', dark)];

  if (!room) {
    return (
      <Tap accessibilityRole="button" accessibilityLabel="Add a condition to find your people" onPress={() => router.navigate('/me')} scaleTo={0.98}>
        <View style={card}>
          <View style={[styles.homeIcon, { backgroundColor: c.cardMuted }]}>
            <Icon name="people" size={18} color={c.text} />
          </View>
          <T variant="bodyStrong" style={{ flex: 1 }}>
            Add a condition to find your people
          </T>
          <Icon name="chevron" size={14} color={c.textTertiary} />
        </View>
      </Tap>
    );
  }

  const accent = roomAccent[room.slug] ?? c.text;
  const open = () => (account ? router.push({ pathname: '/community/[slug]', params: { slug: room.slug } }) : router.navigate('/together'));
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`${room.title}, people with ${room.reasons[0] ?? 'your conditions'}`} onPress={open} scaleTo={0.98}>
      <View style={card}>
        <View style={[styles.homeIcon, { backgroundColor: accent }]}>
          <Icon name={room.icon as IconName} size={18} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline" numberOfLines={1}>
            {room.title}
          </T>
          {room.online > 0 ? (
            <RoomStatus room={room} />
          ) : (
            <T variant="caption" tone="secondary" numberOfLines={1}>
              {room.reasons[0] ? `For your ${room.reasons[0].toLowerCase()}` : 'Your room'}
            </T>
          )}
        </View>
        {live && score != null ? (
          <View style={[styles.chip, { backgroundColor: c.goodSoft }]}>
            <Icon name="trophy" size={11} color={c.good} />
            <T variant="caption" color={c.good}>
              {score}%
            </T>
          </View>
        ) : (
          <Icon name="chevron" size={14} color={c.textTertiary} />
        )}
      </View>
    </Tap>
  );
}

/** On a finished scan: "What did you order?", or what you logged, with a way to change it. */
export function MealCard({ scanId }: { scanId: string }) {
  const { c, dark } = useTheme();
  const meal = useMealForScan(scanId);
  const reduced = useReducedMotion();
  const nudge = useSharedValue(0);
  useEffect(() => {
    if (reduced || meal !== null) return;
    nudge.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })), 3);
  }, [meal, nudge, reduced]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + nudge.value * 0.1 }] }));
  if (meal === undefined) return null;

  const open = () => router.push({ pathname: '/ate/[scanId]', params: { scanId } });
  return (
    <Tap accessibilityRole="button" accessibilityLabel={meal ? `You ordered ${meal.dishName}. Change` : 'What did you order?'} feedback="tap" scaleTo={0.98} onPress={open}>
      <View
        style={[
          styles.row,
          { backgroundColor: meal ? c.card : c.primary },
          dark && meal ? { borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline } : null,
          shadow('card', dark),
        ]}>
        <Animated.View style={[styles.rowIcon, { backgroundColor: meal ? c.goodSoft : tint(c.onPrimary, 0.15) }, iconStyle]}>
          <Icon name={meal ? 'check' : 'fork'} size={16} color={meal ? c.good : c.onPrimary} weight="bold" />
        </Animated.View>
        <View style={{ flex: 1 }}>
          {meal ? (
            <T variant="bodyStrong" numberOfLines={1}>
              You ordered {meal.dishName}
            </T>
          ) : (
            <T variant="bodyStrong" color={c.onPrimary}>
              What did you order?
            </T>
          )}
        </View>
        <T variant="caption" color={meal ? c.textSecondary : tint(c.onPrimary, 0.7)}>
          {meal ? 'Change' : 'Log it'}
        </T>
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  bubble: { position: 'absolute', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  core: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  tile: { height: 150, borderRadius: radius.card, padding: space.lg, justifyContent: 'space-between' },
  tileIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  live: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  home: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.card - 4 },
  homeIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.sm + 2, paddingVertical: 5, borderRadius: radius.chip },
  add: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingRight: space.lg, borderRadius: radius.md },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});

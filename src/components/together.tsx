import { router } from 'expo-router';
import { useEffect } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { countdown, money, useMyRooms, type ChallengeView, type Reaction, type RoomView } from '@/lib/community';
import { useWhopAccount } from '@/lib/whop';
import { radius, roomAccent, shadow, space, tint, useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';
import { RulesRing } from './RulesRing';
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

/** Room icons circling the app's mark, slowly. Each bubble counter-rotates so its icon stays upright. */
export function Orbit({ size = 260 }: { size?: number }) {
  const { c, dark } = useTheme();
  const reduced = useReducedMotion();
  const spin = useSharedValue(0);
  const breathe = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    spin.value = withRepeat(withTiming(1, { duration: 28_000, easing: Easing.linear }), -1);
    breathe.value = withRepeat(withSequence(withTiming(1, { duration: 1800 }), withTiming(0, { duration: 1800 })), -1);
  }, [reduced, spin, breathe]);

  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const upright = useAnimatedStyle(() => ({ transform: [{ rotate: `${-spin.value * 360}deg` }] }));
  const core = useAnimatedStyle(() => ({ transform: [{ scale: 1 + breathe.value * 0.06 }] }));
  const halo = useAnimatedStyle(() => ({ opacity: 0.5 - breathe.value * 0.35, transform: [{ scale: 1 + breathe.value * 0.35 }] }));

  const r = size / 2 - 30;
  return (
    <View style={{ width: size, height: size, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.track, { width: r * 2, height: r * 2, borderRadius: r, borderColor: c.hairline }]} />
      <Animated.View style={[StyleSheet.absoluteFill, ring]}>
        {ORBIT.map((o, i) => {
          const a = (i / ORBIT.length) * Math.PI * 2;
          return (
            <Animated.View
              key={o.icon}
              style={[
                styles.bubble,
                { left: size / 2 + Math.cos(a) * r - 24, top: size / 2 + Math.sin(a) * r - 24, backgroundColor: o.color },
                shadow('card', dark),
                upright,
              ]}>
              <Icon name={o.icon} size={20} color="#FFFFFF" />
            </Animated.View>
          );
        })}
      </Animated.View>
      <Animated.View style={[styles.halo, { backgroundColor: c.primary }, halo]} />
      <Animated.View style={[styles.core, { backgroundColor: c.primary }, shadow('floating', dark), core]}>
        <Icon name="people" size={34} color={c.onPrimary} />
      </Animated.View>
    </View>
  );
}

/** A soft dot that pulses: "people are here right now". */
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

/** A room as a colourful tile with a gently bobbing icon. */
export function RoomTile({ room, index = 0, width = 150 }: { room: RoomView; index?: number; width?: number }) {
  const { c, dark } = useTheme();
  const reduced = useReducedMotion();
  const accent = roomAccent[room.slug] ?? c.text;
  const bob = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    bob.value = withDelay(index * 300, withRepeat(withSequence(withTiming(-4, { duration: 1400 }), withTiming(0, { duration: 1400 })), -1));
  }, [bob, index, reduced]);
  const float = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${room.title}, ${room.members} members`}
      onPress={() => router.push({ pathname: '/community/[slug]', params: { slug: room.slug } })}
      scaleTo={0.95}
      feedback="tap">
      <View style={[styles.tile, { width, backgroundColor: tint(accent, dark ? 0.22 : 0.12) }]}>
        <Animated.View style={[styles.tileIcon, { backgroundColor: accent }, float]}>
          <Icon name={room.icon as IconName} size={22} color="#FFFFFF" />
        </Animated.View>
        <View style={{ gap: space.xs }}>
          <T variant="headline" numberOfLines={2}>
            {room.title}
          </T>
          <View style={styles.live}>
            <PulseDot color={c.good} size={7} />
            <T variant="caption" tone="secondary">
              {compact(room.members)}
            </T>
          </View>
        </View>
      </View>
    </Tap>
  );
}

/** The challenge you are in, as a bold dark card with your progress ring. */
export function ChallengeHero({ ch }: { ch: ChallengeView }) {
  const { c, dark } = useTheme();
  const accent = roomAccent[ch.room] ?? c.good;
  const score = ch.me?.score ?? 0;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`${ch.title}, ${score} of ${ch.max} points`} onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: ch.id } })} scaleTo={0.97} feedback="tap">
      <View style={[styles.hero, { backgroundColor: c.primary }, shadow('floating', dark)]}>
        <View style={{ flex: 1, gap: space.sm }}>
          <View style={[styles.heroTag, { backgroundColor: tint(accent, 0.25) }]}>
            <Icon name="trophy" size={12} color={accent} />
            <T variant="caption" color={accent}>
              {ch.status === 'upcoming' ? countdown(ch) : `Day ${ch.dayNumber} of ${ch.days}`}
            </T>
          </View>
          <T variant="title" color={c.onPrimary} numberOfLines={2}>
            {ch.title}
          </T>
          <T variant="bodyStrong" color={tint(c.onPrimary, 0.6)}>
            {ch.entryCents ? `${money(ch.potCents)} pot` : 'Free'} · {ch.me ? `${ordinalShort(ch.me.rank)} place` : `${ch.players.length} in`}
          </T>
        </View>
        <RulesRing
          size={84}
          stroke={9}
          segments={[
            { value: score, color: accent },
            { value: Math.max(0.0001, ch.max - score), color: tint(c.onPrimary, 0.15) },
          ]}
          center={
            <T variant="headline" color={c.onPrimary}>
              {score}
            </T>
          }
        />
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

/** After a scan: one small prompt to tell your room how a dish went. Shown only when signed in and in a room. */
export function ShareCard({ scanId }: { scanId: string }) {
  const { c, dark } = useTheme();
  const { account } = useWhopAccount();
  const rooms = useMyRooms();
  if (!account || rooms.length === 0) return null;
  const room = rooms[0];
  const accent = roomAccent[room.slug] ?? c.text;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`Share with ${room.title}`}
      feedback="tap"
      scaleTo={0.98}
      onPress={() => router.push({ pathname: '/share/[scanId]', params: { scanId, room: room.slug } })}>
      <View style={[styles.row, { backgroundColor: tint(accent, dark ? 0.2 : 0.1) }]}>
        <View style={[styles.rowIcon, { backgroundColor: accent }]}>
          <Icon name={room.icon as IconName} size={16} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="bodyStrong" numberOfLines={1}>
            Share with {room.title}
          </T>
          <T variant="caption" tone="secondary">
            How did it go?
          </T>
        </View>
        <Icon name="chevron" size={14} color={c.textTertiary} />
      </View>
    </Tap>
  );
}

/** Home's small way into Together: your rooms' icons stacked, and what's happening. */
export function TogetherCard() {
  const { c, dark } = useTheme();
  const { account } = useWhopAccount();
  const rooms = useMyRooms();
  const shown = rooms.length ? rooms.slice(0, 3).map((r) => ({ key: r.slug, icon: r.icon as IconName, color: roomAccent[r.slug] ?? c.text })) : ORBIT.slice(0, 3).map((o) => ({ key: o.icon, icon: o.icon, color: o.color }));
  const title = !account ? 'Find your people' : rooms.length ? (rooms.length === 1 ? rooms[0].title : `${rooms.length} rooms`) : 'Join a room';
  const detail = !account ? 'Rooms and challenges' : rooms.length ? 'Your rooms' : 'Matched to your conditions';
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} onPress={() => router.navigate('/together')} scaleTo={0.98}>
      <View style={[styles.home, { backgroundColor: c.card }, dark ? { borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline } : null, shadow('card', dark)]}>
        <View style={{ flexDirection: 'row' }}>
          {shown.map((s, i) => (
            <View key={s.key} style={[styles.stack, { backgroundColor: s.color, marginLeft: i ? -10 : 0, borderColor: c.card, zIndex: 3 - i }]}>
              <Icon name={s.icon} size={15} color="#FFFFFF" />
            </View>
          ))}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline" numberOfLines={1}>
            {title}
          </T>
          <View style={styles.live}>
            {account && rooms.length ? <PulseDot color={c.good} size={6} /> : null}
            <T variant="caption" tone="secondary" numberOfLines={1}>
              {detail}
            </T>
          </View>
        </View>
        <Icon name="chevron" size={14} color={c.textTertiary} />
      </View>
    </Tap>
  );
}

/** The last tile in the rooms carousel: find another room. */
export function AddTile({ width = 96 }: { width?: number }) {
  const { c } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel="Find more rooms" onPress={() => router.push('/rooms')} scaleTo={0.95} feedback="tap">
      <View style={[styles.tile, styles.add, { width, borderColor: c.hairline }]}>
        <View style={[styles.addIcon, { backgroundColor: c.cardMuted }]}>
          <Icon name="plus" size={20} color={c.text} weight="bold" />
        </View>
        <T variant="caption" tone="secondary">
          More
        </T>
      </View>
    </Tap>
  );
}

/** A challenge you are not in yet, as one compact row. */
export function ChallengeRow({ ch }: { ch: ChallengeView }) {
  const { c, dark } = useTheme();
  const accent = roomAccent[ch.room] ?? c.text;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`${ch.title}, ${countdown(ch)}`} onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: ch.id } })} scaleTo={0.98}>
      <View style={[styles.row, { backgroundColor: c.card }, dark ? { borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline } : null, shadow('card', dark)]}>
        <View style={[styles.rowIcon, { backgroundColor: tint(accent, dark ? 0.22 : 0.14) }]}>
          <Icon name="trophy" size={16} color={accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="bodyStrong" numberOfLines={1}>
            {ch.title}
          </T>
          <T variant="caption" tone="secondary" numberOfLines={1}>
            {countdown(ch)}
          </T>
        </View>
        <T variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
          {ch.entryCents ? money(ch.potCents) : 'Free'}
        </T>
      </View>
    </Tap>
  );
}

function ordinalShort(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

const styles = StyleSheet.create({
  track: { position: 'absolute', borderWidth: 1.5, borderStyle: 'dashed' },
  bubble: { position: 'absolute', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  core: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 84, height: 84, borderRadius: 42 },
  tile: { height: 168, borderRadius: radius.card, padding: space.lg, justifyContent: 'space-between' },
  tileIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  live: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.lg, borderRadius: radius.card, padding: space.xl },
  home: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.card - 4 },
  stack: { width: 34, height: 34, borderRadius: 17, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  add: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  addIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingRight: space.lg, borderRadius: radius.md },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  heroTag: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', paddingHorizontal: space.sm + 2, paddingVertical: 4, borderRadius: radius.chip },
});

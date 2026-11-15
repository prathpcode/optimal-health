import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import type { Standing } from '@/lib/community';
import { space, spring } from '@/theme';
import { avg } from './challenge';
import { Avatar } from './community';
import { Icon } from './Icon';
import { T } from './T';

// Metal finishes for the three steps. Same in both themes: they are objects, not UI chrome.
const GOLD = ['#FFE08A', '#F2B63D', '#D9901A'] as const;
const SILVER = ['#F1F3F6', '#C9CED6', '#A4AAB4'] as const;
const BRONZE = ['#F6C49C', '#D98F5C', '#B06A3A'] as const;

// Drawn left to right: 2nd, 1st, 3rd.
const SLOTS = [
  { index: 1, height: 58, colors: SILVER, delay: 120 },
  { index: 0, height: 78, colors: GOLD, delay: 0 },
  { index: 2, height: 46, colors: BRONZE, delay: 220 },
] as const;

const AVATAR = 48;
const AVATAR_FIRST = 60;

function Slot({ player, place, height, colors, delay }: { player: Standing; place: number; height: number; colors: readonly [string, string, string]; delay: number }) {
  const reduced = useReducedMotion();
  const grow = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) grow.value = withDelay(delay, withSpring(1, spring.gentle));
  }, [reduced, delay, grow]);
  const step = useAnimatedStyle(() => ({ height: grow.value * height }));
  const top = useAnimatedStyle(() => ({ opacity: grow.value, transform: [{ translateY: (1 - grow.value) * 16 }] }));

  const first = place === 1;
  const size = first ? AVATAR_FIRST : AVATAR;
  const ring = colors[1];

  return (
    <View style={styles.slot}>
      <Animated.View style={[styles.top, top]}>
        {first ? (
          <View style={styles.trophy}>
            <Icon name="trophy" size={22} color={GOLD[2]} weight="bold" />
          </View>
        ) : null}
        <View style={[styles.ring, { borderColor: ring, borderRadius: (size + 8) / 2 }]}>
          <Avatar name={player.name} url={player.avatarUrl} size={size} />
        </View>
        <T variant="bodyStrong" numberOfLines={1} style={styles.name}>
          {player.me ? 'You' : player.name.split(' ')[0]}
        </T>
        <T variant="caption" tone="secondary" style={styles.num}>
          {avg(player)}
        </T>
      </Animated.View>
      <Animated.View style={[styles.step, step]}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.shine} />
        <T variant="heroBold" color="rgba(255,255,255,0.95)" style={styles.num}>
          {place}
        </T>
      </Animated.View>
    </View>
  );
}

/** The top three of a challenge standing on a podium. Only places someone holds are drawn. */
export function Podium({ standings }: { standings: Standing[] }) {
  const top = standings.slice(0, 3);
  const label = top.map((p) => `${p.rank}: ${p.me ? 'you' : p.name}, average ${avg(p)}`).join('; ');
  return (
    <View style={styles.wrap} accessible accessibilityLabel={`Podium. ${label}`}>
      {SLOTS.map((s) => {
        const player = top[s.index];
        if (!player) return null;
        return <Slot key={s.index} player={player} place={player.rank} height={s.height} colors={s.colors} delay={s.delay} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 6, paddingTop: space.xs },
  slot: { flex: 1, maxWidth: 112, alignItems: 'stretch' },
  top: { alignItems: 'center', paddingBottom: space.sm, paddingHorizontal: 2 },
  trophy: { marginBottom: 4 },
  ring: { padding: 2, borderWidth: 2 },
  name: { marginTop: space.xs, maxWidth: '100%' },
  num: { fontVariant: ['tabular-nums'] },
  step: { borderTopLeftRadius: 14, borderTopRightRadius: 14, overflow: 'hidden', alignItems: 'center', paddingTop: 6 },
  shine: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
});

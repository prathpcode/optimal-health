import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import type { Fit } from '@engine/types';
import { countdown, daysOf, todayKey, type ChallengeView } from '@/lib/community';
import { fitColor } from '@/lib/verdict';
import { radius, space, spring, useTheme } from '@/theme';
import { GlassSurface } from './Glass';
import { Icon } from './Icon';
import { T } from './T';
import { Tap } from './Tap';

/** One meal as a dot in its verdict colour. */
export function MealDot({ fit, size = 10 }: { fit: Fit; size?: number }) {
  const { c } = useTheme();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: fitColor(fit, c).solid }} />;
}

const SCORING: { fit: Fit; points: string; label: string }[] = [
  { fit: 'good', points: '+2', label: 'Good fit' },
  { fit: 'okay', points: '+1', label: 'Okay' },
  { fit: 'not_fit', points: '0', label: 'Not a fit' },
];

/** How a meal scores, as three pills. */
export function FitLegend() {
  const { c } = useTheme();
  return (
    <View style={styles.legend} accessibilityLabel="Good fit scores 2, okay 1, not a fit 0">
      {SCORING.map((s) => {
        const col = fitColor(s.fit, c);
        return (
          <View key={s.fit} style={[styles.legendPill, { backgroundColor: col.soft }]}>
            <T variant="bodyStrong" color={col.solid} style={{ fontVariant: ['tabular-nums'] }}>
              {s.points}
            </T>
            <T variant="caption" color={col.solid}>
              {s.label}
            </T>
          </View>
        );
      })}
    </View>
  );
}

/** Your fit % in Home's hero type, with a bar that fills to it. */
export function FitMeter({ score }: { score: number | null }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const fill = useSharedValue(0);
  useEffect(() => {
    const to = (score ?? 0) / 100;
    fill.value = reduced ? to : withSpring(to, spring.gentle);
  }, [score, fill, reduced]);
  const bar = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View style={{ gap: space.md }} accessibilityLabel={score != null ? `${score} percent fit` : 'No meals yet'}>
      <View style={styles.meterTop}>
        <T variant="heroBold" style={styles.big}>
          {score != null ? score : '–'}
        </T>
        <T variant="hero" tone="secondary" style={styles.pct}>
          % fit
        </T>
      </View>
      <View style={[styles.track, { backgroundColor: c.cardMuted }]}>
        <Animated.View style={[styles.fill, { backgroundColor: c.good }, bar]} />
      </View>
    </View>
  );
}

/** One column per challenge day, a dot per meal that day. Today is outlined. */
export function DayStrip({ ch, perDay }: { ch: ChallengeView; perDay: Record<string, Fit[]> }) {
  const { c } = useTheme();
  const today = todayKey(ch);
  const days = daysOf(ch);
  const narrow = days.length > 7;
  return (
    <View style={styles.strip}>
      {days.map((d, i) => {
        const meals = perDay[d] ?? [];
        const future = d > today;
        return (
          <View key={d} style={styles.dayCol}>
            <View style={[styles.day, { backgroundColor: future ? 'transparent' : c.cardMuted, borderColor: d === today ? c.text : future ? c.hairline : 'transparent' }]}>
              {meals.map((f, j) => (
                <MealDot key={j} fit={f} size={narrow ? 6 : 8} />
              ))}
            </View>
            {!narrow || i % 2 === 0 ? (
              <T variant="caption" tone={d === today ? 'primary' : 'tertiary'} style={styles.dayLabel}>
                {i + 1}
              </T>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** A rank: 1 to 3 on a filled circle, the rest as a plain number. */
export function Rank({ rank, size = 28 }: { rank: number; size?: number }) {
  const { c } = useTheme();
  if (rank > 3) {
    return (
      <View style={{ width: size, alignItems: 'center' }}>
        <T variant="bodyStrong" tone="tertiary" style={{ fontVariant: ['tabular-nums'] }}>
          {rank}
        </T>
      </View>
    );
  }
  return (
    <View style={[styles.medal, { width: size, height: size, borderRadius: size / 2, backgroundColor: rank === 1 ? c.primary : c.cardMuted }]}>
      <T variant="caption" color={rank === 1 ? c.onPrimary : c.text} style={{ fontWeight: '700' }}>
        {rank}
      </T>
    </View>
  );
}

/** A challenge as a glass row: your fit %, place and time left. */
export function ChallengeRow({ ch }: { ch: ChallengeView }) {
  const { c } = useTheme();
  const me = ch.me;
  const scored = me?.score != null;
  const place = ch.standings.length > 1 && me ? `${ordinalShort(me.rank)} of ${ch.standings.length}` : null;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${ch.title}, ${scored ? `${me!.score} percent` : 'no meals yet'}, ${countdown(ch)}`}
      onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: ch.id } })}
      scaleTo={0.98}>
      <GlassSurface tone="theme" interactive style={styles.row}>
        <View style={[styles.score, { backgroundColor: scored ? c.goodSoft : c.cardMuted }]}>
          <T variant="heading" color={scored ? c.good : c.textTertiary} style={{ fontVariant: ['tabular-nums'] }}>
            {scored ? `${me!.score}%` : '–'}
          </T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline" numberOfLines={1}>
            {ch.title}
          </T>
          <T variant="caption" tone="secondary" numberOfLines={1}>
            {[place, countdown(ch)].filter(Boolean).join(' · ')}
          </T>
        </View>
        <Icon name="chevron" size={14} color={c.textTertiary} />
      </GlassSurface>
    </Tap>
  );
}

export function ordinalShort(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  legendPill: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: space.md, paddingVertical: 7, borderRadius: radius.chip },
  meterTop: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  big: { fontSize: 72, lineHeight: 78, letterSpacing: -2, fontVariant: ['tabular-nums'] },
  pct: { fontSize: 28, lineHeight: 34 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  strip: { flexDirection: 'row', gap: 4 },
  dayCol: { flex: 1, alignItems: 'center', gap: 4 },
  day: { width: '100%', minHeight: 44, borderRadius: radius.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 4 },
  dayLabel: { fontSize: 11, lineHeight: 13 },
  medal: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingRight: space.lg, borderRadius: radius.card },
  score: { width: 64, height: 52, borderRadius: radius.sm + 4, alignItems: 'center', justifyContent: 'center' },
});

import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { Fit } from '@engine/types';
import { countdown, daysOf, todayKey, type ChallengeView } from '@/lib/community';
import { fitColor } from '@/lib/verdict';
import { radius, roomAccent, shadow, space, useTheme } from '@/theme';
import { Icon } from './Icon';
import { T } from './T';
import { Tap } from './Tap';

/** One meal as a dot in its verdict colour. */
export function MealDot({ fit, size = 10 }: { fit: Fit; size?: number }) {
  const { c } = useTheme();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: fitColor(fit, c).solid }} />;
}

/** How a meal scores, as three pills: no sentences. */
export function FitLegend() {
  const { c } = useTheme();
  const items: { fit: Fit; label: string }[] = [
    { fit: 'good', label: '+2' },
    { fit: 'okay', label: '+1' },
    { fit: 'not_fit', label: '0' },
  ];
  return (
    <View style={styles.legend} accessibilityLabel="Good fit scores 2, okay scores 1, not a fit scores 0">
      {items.map((i) => {
        const col = fitColor(i.fit, c);
        return (
          <View key={i.fit} style={[styles.legendPill, { backgroundColor: col.soft }]}>
            <MealDot fit={i.fit} size={9} />
            <T variant="bodyStrong" color={col.solid} style={{ fontVariant: ['tabular-nums'] }}>
              {i.label}
            </T>
          </View>
        );
      })}
    </View>
  );
}

/** One column per challenge day, a dot per meal eaten that day. Today is outlined. */
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
            <View
              style={[
                styles.day,
                { backgroundColor: future ? 'transparent' : c.cardMuted, borderColor: d === today ? c.text : future ? c.hairline : 'transparent' },
              ]}>
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

const medal = (rank: number, c: ReturnType<typeof useTheme>['c']) => (rank === 1 ? c.okay : rank === 2 ? c.cantTell : rank === 3 ? roomAccent['nut-allergy'] : null);

/** Your rank as a coloured medal for the top three, else a plain number. */
export function Rank({ rank, size = 28 }: { rank: number; size?: number }) {
  const { c } = useTheme();
  const m = medal(rank, c);
  if (!m) {
    return (
      <View style={{ width: size, alignItems: 'center' }}>
        <T variant="bodyStrong" tone="tertiary" style={{ fontVariant: ['tabular-nums'] }}>
          {rank}
        </T>
      </View>
    );
  }
  return (
    <View style={[styles.medal, { width: size, height: size, borderRadius: size / 2, backgroundColor: m }]}>
      <T variant="caption" color="#FFFFFF" style={{ fontWeight: '700' }}>
        {rank}
      </T>
    </View>
  );
}

/** A challenge in a list: your fit %, rank, time left and today's meals. */
export function ChallengeRow({ ch }: { ch: ChallengeView }) {
  const { c, dark } = useTheme();
  const me = ch.me;
  const today = me?.perDay[todayKey(ch)] ?? [];
  const status = ch.status === 'live' ? countdown(ch) : ch.status === 'upcoming' ? countdown(ch) : 'Ended';
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${ch.title}, ${me?.score != null ? `${me.score} percent` : 'no meals yet'}, ${status}`}
      onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: ch.id } })}
      scaleTo={0.98}>
      <View style={[styles.row, { backgroundColor: c.card }, dark ? { borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline } : null, shadow('card', dark)]}>
        <View style={[styles.score, { backgroundColor: me?.score != null ? c.goodSoft : c.cardMuted }]}>
          <T variant="headline" color={me?.score != null ? c.good : c.textTertiary} style={{ fontVariant: ['tabular-nums'] }}>
            {me?.score != null ? `${me.score}%` : '–'}
          </T>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <T variant="bodyStrong" numberOfLines={1}>
            {ch.days}-day {ch.title}
          </T>
          <View style={styles.meta}>
            {ch.standings.length > 1 && me ? (
              <T variant="caption" tone="secondary">
                #{me.rank} of {ch.standings.length} ·
              </T>
            ) : null}
            <T variant="caption" tone="secondary">
              {status}
            </T>
            {today.length ? (
              <View style={styles.todayDots}>
                {today.map((f, i) => (
                  <MealDot key={i} fit={f} size={7} />
                ))}
              </View>
            ) : null}
          </View>
        </View>
        <Icon name="chevron" size={14} color={c.textTertiary} />
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: space.sm },
  legendPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.chip },
  strip: { flexDirection: 'row', gap: 4 },
  dayCol: { flex: 1, alignItems: 'center', gap: 4 },
  day: { width: '100%', minHeight: 40, borderRadius: radius.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 4 },
  dayLabel: { fontSize: 11, lineHeight: 13 },
  medal: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingRight: space.lg, borderRadius: radius.md },
  score: { width: 56, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  todayDots: { flexDirection: 'row', gap: 3, marginLeft: space.xs },
});

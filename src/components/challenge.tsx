import { router } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Share, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { MEAL_POINTS, MEALS_PER_DAY, type Play } from '@engine/challenge';
import type { Fit } from '@engine/types';
import { countdown, daysOf, leaveChallenge, todayKey, type ChallengeView, type Standing } from '@/lib/community';
import { haptic } from '@/lib/haptics';
import { dishEmoji } from '@/lib/emoji';
import { fitColor } from '@/lib/verdict';
import { radius, space, spring, useTheme } from '@/theme';
import { Avatar } from './community';
import { GlassSurface } from './Glass';
import { Icon } from './Icon';
import { T } from './T';
import { Tap } from './Tap';

/**
 * The scan's verdict, said plainly for the game: does the dish suit your diet? (Scan results keep the app's verdict
 * names; here people only need to know what earns points.)
 */
export const PLAIN_FIT: Record<'good' | 'okay' | 'not_fit', string> = {
  good: 'Fits your diet',
  okay: 'Mostly fits',
  not_fit: 'Doesn’t fit',
};

const TIERS: { fit: Fit; label: string }[] = [
  { fit: 'good', label: PLAIN_FIT.good },
  { fit: 'okay', label: PLAIN_FIT.okay },
  { fit: 'not_fit', label: PLAIN_FIT.not_fit },
];

const pts = (n: number) => `${n} ${n === 1 ? 'pt' : 'pts'}`;

/** A dish's points as a pill in its verdict colour: "+3", "+1", "0". */
export function PointsPill({ fit, points, muted }: { fit: Fit; points: number; muted?: boolean }) {
  const { c } = useTheme();
  const col = muted ? fitColor('cant_tell', c) : fitColor(fit, c);
  return (
    <View style={[styles.pill, { backgroundColor: col.soft }]}>
      <T variant="bodyStrong" color={col.solid} style={styles.num}>
        {points > 0 ? `+${points}` : '0'}
      </T>
    </View>
  );
}

/** What each verdict is worth, before anyone has played: on the Together tab and when starting a race. */
export function PointsKey() {
  return (
    <View style={{ gap: space.sm }} accessibilityLabel={`Fits your diet ${MEAL_POINTS.good} points, mostly fits ${MEAL_POINTS.okay}, doesn’t fit 0`}>
      {TIERS.map((t) => (
        <View key={t.fit} style={styles.keyRow}>
          <PointsPill fit={t.fit} points={MEAL_POINTS[t.fit]} />
          <T variant="bodyStrong">{t.label}</T>
        </View>
      ))}
    </View>
  );
}

/**
 * "How to win", worked through with your own dishes: each verdict, what it is worth, how many of your dishes landed
 * there and what they added. Before you've logged anything it is just the key.
 */
export function HowToWin({ ch }: { ch: ChallengeView }) {
  const { c } = useTheme();
  const plays = (ch.me?.plays ?? []).filter((p) => !p.skipped);
  const ends = new Date(ch.endsAt - 1).toLocaleDateString(undefined, { weekday: 'long' });
  return (
    <GlassSurface tone="theme" style={styles.card}>
      {TIERS.map((t, i) => {
        const mine = plays.filter((p) => p.fit === t.fit);
        const subtotal = mine.length * MEAL_POINTS[t.fit];
        return (
          <View key={t.fit} style={[styles.tier, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline } : null]}>
            <PointsPill fit={t.fit} points={MEAL_POINTS[t.fit]} />
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="headline">{t.label}</T>
              {mine.length ? (
                <T variant="caption" tone="secondary" numberOfLines={2}>
                  {mine.map((p) => `${dishEmoji(p.dish)} ${p.dish}`).join('  ·  ')}
                </T>
              ) : null}
            </View>
            {ch.me ? (
              <View style={{ alignItems: 'flex-end' }}>
                <T variant="headline" style={styles.num} color={mine.length ? c.text : c.textTertiary}>
                  {subtotal}
                </T>
                <T variant="caption" tone="tertiary" style={styles.num}>
                  {mine.length} × {MEAL_POINTS[t.fit]}
                </T>
              </View>
            ) : null}
          </View>
        );
      })}
      <View style={[styles.howFoot, { backgroundColor: c.cardMuted }]}>
        <T variant="caption" tone="secondary">
          Scan a menu, then tap what you ordered. Up to {MEALS_PER_DAY} dishes a day count. Most points when it ends on {ends} wins.
        </T>
      </View>
    </GlassSurface>
  );
}

/** One player's total as a bar made of their dishes: each counted dish is a segment as wide as its points. */
function PointsBar({ plays, scale }: { plays: Play[]; scale: number }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const counted = plays.filter((p) => p.points > 0);
  const total = counted.reduce((a, p) => a + p.points, 0);
  const grow = useSharedValue(0);
  useEffect(() => {
    const to = scale > 0 ? total / scale : 0;
    grow.value = reduced ? to : withSpring(to, spring.gentle);
  }, [total, scale, grow, reduced]);
  const width = useAnimatedStyle(() => ({ width: `${grow.value * 100}%` }));
  return (
    <View style={[styles.track, { backgroundColor: c.cardMuted }]}>
      <Animated.View style={[styles.segments, width]}>
        {counted.map((p, i) => (
          <View key={i} style={{ flex: p.points, backgroundColor: fitColor(p.fit, c).solid }} />
        ))}
      </Animated.View>
    </View>
  );
}

/** The race: everyone's total, best first, each bar built from the dishes that earned it. */
export function RaceBoard({ ch }: { ch: ChallengeView }) {
  const { c } = useTheme();
  const top = Math.max(1, ...ch.standings.map((p) => p.points));
  return (
    <GlassSurface tone="theme" style={[styles.card, { padding: space.lg, gap: space.lg }]}>
      <T variant="bodyStrong" tone="secondary">
        {raceLine(ch)}
      </T>
      {ch.standings.map((p) => (
        <PlayerLine key={p.id} p={p} scale={top} winner={ch.status === 'ended' && p.rank === 1 && p.points > 0} />
      ))}
      {ch.standings.length > 0 && ch.status !== 'upcoming' ? (
        <View style={styles.legendRow}>
          {(['good', 'okay'] as const).map((f) => (
            <View key={f} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: fitColor(f, c).solid }]} />
              <T variant="caption" tone="tertiary">
                {PLAIN_FIT[f]}
              </T>
            </View>
          ))}
        </View>
      ) : null}
    </GlassSurface>
  );
}

function PlayerLine({ p, scale, winner }: { p: Standing; scale: number; winner: boolean }) {
  const { c } = useTheme();
  const counts = [p.good && `${p.good} good`, p.okay && `${p.okay} okay`, p.notFit && `${p.notFit} not a fit`].filter(Boolean).join(' · ');
  return (
    <View style={{ gap: space.sm }} accessibilityLabel={`${p.me ? 'You' : p.name}, place ${p.rank}, ${pts(p.points)}`}>
      <View style={styles.playerTop}>
        <Rank rank={p.rank} />
        <Avatar name={p.name} url={p.avatarUrl} size={32} />
        <View style={{ flex: 1 }}>
          <T variant="headline" numberOfLines={1}>
            {p.me ? 'You' : p.name} {winner ? '🏆' : ''}
          </T>
          <T variant="caption" tone="tertiary" numberOfLines={1}>
            {counts || 'No dishes yet'}
          </T>
        </View>
        <T variant="title" style={styles.num} color={p.points ? c.text : c.textTertiary}>
          {p.points}
        </T>
      </View>
      <PointsBar plays={p.plays} scale={scale} />
    </View>
  );
}

/** One sentence on the state of the race, from your side of it. */
export function raceLine(ch: ChallengeView): string {
  const [first, second] = ch.standings;
  const me = ch.me;
  const name = (p: Standing) => (p.me ? 'You' : p.name);
  if (ch.status === 'upcoming') return `${ch.standings.length} in · everyone starts at 0`;
  if (ch.standings.length < 2) return me?.points ? 'Just you so far. Invite someone to race.' : 'Log your first dish to get on the board.';
  if (ch.status === 'ended') {
    if (!first.points) return 'Nobody scored this time.';
    const tied = ch.standings.filter((p) => p.rank === 1);
    return tied.length > 1 ? `Tie for first on ${pts(first.points)}` : `${name(first)} won with ${pts(first.points)}`;
  }
  if (!first.points) return 'Nobody has scored yet. The first dish that fits takes the lead.';
  if (first.points === second.points) {
    const pair = second.me ? `${first.name} and you` : `${name(first)} and ${second.name}`;
    return `${pair} are level on ${pts(first.points)}`;
  }
  if (me && me.rank === 1) return `You lead by ${pts(first.points - second.points)}`;
  if (me) {
    const gap = first.points - me.points;
    const goods = Math.ceil((gap + 1) / MEAL_POINTS.good);
    return `${gap} behind ${first.name}. ${goods} Good-fit ${goods === 1 ? 'dish takes' : 'dishes take'} the lead.`;
  }
  return `${first.name} leads by ${pts(first.points - second.points)}`;
}

type FeedPlay = Play & { who: string; me: boolean; avatarUrl?: string };

/** Every dish anyone logged, newest first, grouped by day: what they ordered and what it scored. */
export function PlayFeed({ ch }: { ch: ChallengeView }) {
  const { c } = useTheme();
  const today = todayKey(ch);
  const days = daysOf(ch);
  const all: FeedPlay[] = ch.standings
    .flatMap((p) => p.plays.map((x) => ({ ...x, who: p.me ? 'You' : p.name, me: p.me, avatarUrl: p.avatarUrl })))
    .sort((a, b) => b.at - a.at);
  if (!all.length) {
    return (
      <GlassSurface tone="theme" style={[styles.card, { padding: space.lg, alignItems: 'center', gap: space.xs }]}>
        <T style={{ fontSize: 28, lineHeight: 34 }}>🍽️</T>
        <T variant="bodyStrong">No dishes yet</T>
        <T variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
          Every dish anyone orders shows up here with its points.
        </T>
      </GlassSurface>
    );
  }
  const groups = days
    .map((d, i) => ({ d, i, plays: all.filter((p) => p.day === d) }))
    .filter((g) => g.plays.length)
    .reverse();
  return (
    <View style={{ gap: space.lg }}>
      {groups.map((g) => (
        <View key={g.d} style={{ gap: space.sm }}>
          <T variant="micro" tone="tertiary">
            {g.d === today ? 'Today' : `Day ${g.i + 1} · ${new Date(`${g.d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}`}
          </T>
          <GlassSurface tone="theme" style={styles.card}>
            {g.plays.map((p, j) => (
              <View key={`${p.at}-${j}`} style={[styles.play, j > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline } : null]}>
                <View style={[styles.emoji, { backgroundColor: fitColor(p.skipped ? 'cant_tell' : p.fit, c).soft }]}>
                  <T style={{ fontSize: 20, lineHeight: 24 }}>{dishEmoji(p.dish)}</T>
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <T variant="bodyStrong" numberOfLines={1}>
                    {p.dish}
                  </T>
                  <T variant="caption" tone="secondary" numberOfLines={1}>
                    {p.who} · {playNote(p)}
                  </T>
                </View>
                <PointsPill fit={p.fit} points={p.points} muted={Boolean(p.skipped)} />
              </View>
            ))}
          </GlassSurface>
        </View>
      ))}
    </View>
  );
}

function playNote(p: Play): string {
  if (p.skipped === 'daily_limit') return `over ${MEALS_PER_DAY} today, didn’t count`;
  if (p.skipped === 'cant_tell') return 'couldn’t tell, didn’t count';
  return TIERS.find((t) => t.fit === p.fit)?.label ?? '';
}

/** A rank: 1 to 3 on a filled circle, the rest as a plain number. */
export function Rank({ rank, size = 26 }: { rank: number; size?: number }) {
  const { c } = useTheme();
  if (rank > 3) {
    return (
      <View style={{ width: size, alignItems: 'center' }}>
        <T variant="bodyStrong" tone="tertiary" style={styles.num}>
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

/** A challenge as a glass row on the Together tab: your points, place and time left. */
/** Ask once, then leave the race. `after` runs once you've left (e.g. go back). */
export function confirmLeave(ch: Pick<ChallengeView, 'id'>, after?: () => void) {
  Alert.alert('Leave this race?', 'Your points leave with you.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Leave',
      style: 'destructive',
      onPress: () =>
        void leaveChallenge(ch.id)
          .then(() => after?.())
          .catch((e: unknown) => Alert.alert('Couldn’t leave', e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, '') : 'Try again in a moment.')),
    },
  ]);
}

export function ChallengeRow({ ch }: { ch: ChallengeView }) {
  const { c } = useTheme();
  const me = ch.me;
  const place = ch.standings.length > 1 && me ? `${ordinalShort(me.rank)} of ${ch.standings.length}` : null;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${ch.title}, ${pts(me?.points ?? 0)}, ${countdown(ch)}`}
      accessibilityHint={ch.joined && ch.status !== 'ended' ? 'Long-press to leave' : undefined}
      onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: ch.id } })}
      onLongPress={
        ch.joined && ch.status !== 'ended'
          ? () => {
              haptic.select();
              confirmLeave(ch);
            }
          : undefined
      }
      scaleTo={0.98}>
      <GlassSurface tone="theme" interactive style={styles.row}>
        <View style={[styles.score, { backgroundColor: me?.points ? c.goodSoft : c.cardMuted }]}>
          <T variant="heading" color={me?.points ? c.good : c.textTertiary} style={styles.num}>
            {me?.points ?? 0}
          </T>
          <T variant="caption" color={me?.points ? c.good : c.textTertiary}>
            pts
          </T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline" numberOfLines={1}>
            {ch.days}-day {ch.title.toLowerCase()}
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

/** Open the share sheet with a challenge's invite link. */
export function inviteToChallenge(ch: Pick<ChallengeView, 'id' | 'days'>) {
  return Share.share({ message: `Race me on Second Look: ${ch.days} days, points for every dish that fits you. secondlook://challenge/${ch.id}` });
}

export function ordinalShort(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

const styles = StyleSheet.create({
  num: { fontVariant: ['tabular-nums'] },
  pill: { minWidth: 44, height: 30, paddingHorizontal: space.sm, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  card: { borderRadius: radius.card, overflow: 'hidden' },
  tier: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  howFoot: { paddingHorizontal: space.lg, paddingVertical: space.md },
  playerTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  segments: { height: 10, flexDirection: 'row', gap: 2 },
  legendRow: { flexDirection: 'row', gap: space.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  play: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  emoji: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  medal: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingRight: space.lg, borderRadius: radius.card },
  score: { width: 64, height: 52, borderRadius: radius.sm + 4, alignItems: 'center', justifyContent: 'center' },
});

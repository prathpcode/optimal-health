import { router } from 'expo-router';
import { Alert, Share, StyleSheet, View } from 'react-native';

import { averageScore, MEAL_POINTS, type Play } from '@engine/challenge';
import type { Fit } from '@engine/types';
import { countdown, daysOf, leaveChallenge, todayKey, type ChallengeView, type Standing } from '@/lib/community';
import { haptic } from '@/lib/haptics';
import { dishEmoji } from '@/lib/emoji';
import { fitColor } from '@/lib/verdict';
import { radius, space, useTheme } from '@/theme';
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
  good: 'Good for you',
  okay: 'Okay for you',
  not_fit: 'Other food',
};

const TIERS: { fit: Fit; label: string }[] = [
  { fit: 'good', label: PLAIN_FIT.good },
  { fit: 'okay', label: PLAIN_FIT.okay },
  { fit: 'not_fit', label: PLAIN_FIT.not_fit },
];

type Scored = { points: number; meals: number };

/** A score as shown everywhere, to two decimals ("2.40"). */
const fmt = (n: number) => n.toFixed(2);
/** A player's score: their average points per meal. */
export const avg = (p: Scored) => fmt(averageScore(p.points, p.meals));
/** How far `a`'s average is ahead of `b`'s. */
const lead = (a: Scored, b: Scored) => fmt(averageScore(a.points, a.meals) - averageScore(b.points, b.meals));
const mealsLabel = (n: number) => `${n} ${n === 1 ? 'meal' : 'meals'}`;

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

/** The whole of the scoring as a table: what each verdict is worth. On the Together tab and the how-it-works sheet. */
export function PointsKey() {
  return (
    <View style={{ gap: space.sm }} accessibilityLabel={`Good for you ${MEAL_POINTS.good} points, okay for you ${MEAL_POINTS.okay}, other food 0`}>
      {TIERS.map((t) => (
        <View key={t.fit} style={styles.keyRow}>
          <PointsPill fit={t.fit} points={MEAL_POINTS[t.fit]} />
          <T variant="bodyStrong">{t.label}</T>
        </View>
      ))}
    </View>
  );
}

/** An amount of money, in dollars: "$10", "$9.41". (`money` in lib/community says "Free" for 0; this never does.) */
export const usd = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);

/** How a money race works, said once and shown wherever someone is about to pay: creating, joining, and the how-it-works sheet. */
export const MONEY_RULES = [
  'Everyone pays the same entry. Entries close when the race starts.',
  'The best average takes the whole pool. A tie for first splits it equally.',
  'Leave before the start and your entry is refunded. After that the pool is locked.',
  'If fewer than two people pay in, or nobody logs a meal, everyone is refunded.',
  'The pool is what arrives after payment fees. The prize goes to the winner’s Whop balance.',
] as const;

export function MoneyRules() {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      {MONEY_RULES.map((rule) => (
        <View key={rule} style={styles.rule}>
          <View style={[styles.bullet, { backgroundColor: c.textTertiary }]} />
          <T variant="caption" tone="secondary" style={{ flex: 1 }}>
            {rule}
          </T>
        </View>
      ))}
    </View>
  );
}

/** What has happened with your own money in a race, in one line. Empty when there is nothing to say. */
function payoutLine(ch: ChallengeView): string {
  const p = ch.payout;
  if (!p) return '';
  const where = p.kind === 'prize' ? 'to your Whop balance' : 'to how you paid';
  const what = p.kind === 'prize' ? `You won ${usd(p.cents)}` : `Your ${usd(p.cents)} entry is refunded`;
  if (p.status === 'sent') return `${what}, sent ${where}.`;
  if (p.status === 'failed') return `${what}. Sending it ${where} has not gone through yet; we keep trying.`;
  return `${what}. It is on its way ${where}.`;
}

/** The money in a race: the pool, what an entry costs, and what became of it once the race is settled. Nothing for a free race. */
export function StakesCard({ ch }: { ch: ChallengeView }) {
  if (ch.entryCents <= 0) return null;
  const paidIn = ch.standings.length;
  const mine = payoutLine(ch);
  const state = ch.settlement
    ? ch.settlement.refundAll
      ? 'No race this time, so every entry was refunded.'
      : `Settled: the winner took ${usd(ch.settlement.prizeCents)}.`
    : ch.status === 'ended'
      ? 'The pool is settled about an hour after the end.'
      : `${usd(ch.entryCents)} entry · ${paidIn} paid in · winner takes the pool`;
  return (
    <GlassSurface tone="theme" style={[styles.card, styles.stakes]}>
      <View accessible accessibilityLabel={`Pool ${usd(ch.prizeCents)}. ${state} ${mine}`} style={{ gap: space.xs }}>
        <T variant="micro" tone="tertiary">
          POOL
        </T>
        <T variant="display">{usd(ch.settlement?.refundAll ? 0 : ch.prizeCents)}</T>
        <T variant="caption" tone="secondary">
          {state}
        </T>
        {mine ? <T variant="bodyStrong">{mine}</T> : null}
      </View>
    </GlassSurface>
  );
}

/** The standings as a leaderboard: place, who, how many meals they have logged, average. `from` skips the places a podium already shows. */
export function Leaderboard({ ch, from = 0 }: { ch: ChallengeView; from?: number }) {
  const { c } = useTheme();
  const rows = ch.standings.slice(from);
  if (!rows.length) return null;
  return (
    <GlassSurface tone="theme" style={styles.card}>
      {rows.map((p, i) => {
        const winner = ch.status === 'ended' && p.rank === 1 && p.points > 0;
        return (
          <View
            key={p.id}
            accessibilityLabel={`${p.me ? 'You' : p.name}, place ${p.rank}, average ${avg(p)}, ${mealsLabel(p.meals)}`}
            style={[styles.leader, p.me ? { backgroundColor: c.cardMuted } : null, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline } : null]}>
            <Rank rank={p.rank} />
            <Avatar name={p.name} url={p.avatarUrl} size={36} />
            <View style={{ flex: 1 }}>
              <T variant="headline" numberOfLines={1}>
                {p.me ? 'You' : p.name} {winner ? '🏆' : ''}
              </T>
              <T variant="caption" tone="tertiary" numberOfLines={1}>
                {p.meals ? mealsLabel(p.meals) : 'No meals yet'}
              </T>
            </View>
            <T variant="title" style={styles.num} color={p.points ? c.text : c.textTertiary}>
              {avg(p)}
            </T>
          </View>
        );
      })}
    </GlassSurface>
  );
}

/** One sentence on the state of the race, from your side of it. */
export function raceLine(ch: ChallengeView): string {
  const [first, second] = ch.standings;
  const me = ch.me;
  const name = (p: Standing) => (p.me ? 'You' : p.name);
  if (ch.status === 'upcoming') return `${ch.standings.length} in · everyone starts at 0`;
  if (ch.standings.length < 2) return '';
  if (ch.status === 'ended') {
    if (!first.points) return 'Nobody scored this time.';
    const tied = ch.standings.filter((p) => p.rank === 1);
    return tied.length > 1 ? `Tie for first on ${avg(first)}` : `${name(first)} won with an average of ${avg(first)}`;
  }
  if (!first.points) return 'Nobody has scored yet, so scan a menu to start the board.';
  if (first.rank === second.rank) {
    const pair = second.me ? `${first.name} and you` : `${name(first)} and ${second.name}`;
    return `${pair} are level on ${avg(first)}`;
  }
  if (me && me.rank === 1) return `You lead by ${lead(first, second)}`;
  if (me) {
    return `${lead(first, me)} behind ${first.name}`;
  }
  return `${first.name} leads by ${lead(first, second)}`;
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
export function confirmLeave(ch: Pick<ChallengeView, 'id'> & Partial<Pick<ChallengeView, 'entryCents' | 'joined'>>, after?: () => void) {
  const paid = (ch.entryCents ?? 0) > 0;
  const note = !paid ? 'Your points leave with you.' : ch.joined ? `Your ${usd(ch.entryCents ?? 0)} entry will be refunded.` : 'You have not paid, so there is nothing to refund.';
  Alert.alert('Leave this race?', note, [
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
  const ranked = me && ch.status !== 'upcoming' ? me : null;
  const leading = Boolean(ranked && ranked.rank === 1 && ranked.points > 0);
  const stake = ch.entryCents > 0 ? (ch.pending && ch.status === 'upcoming' ? ` · pay ${usd(ch.entryCents)} to enter` : ` · ${usd(ch.entryCents)} entry`) : '';
  // A money race is locked once it starts; an entry you never paid can always be dropped.
  const canLeave = ch.status !== 'ended' && (ch.pending || (ch.joined && (ch.entryCents === 0 || ch.status === 'upcoming')));
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${ch.title}, ${ranked ? `place ${ranked.rank}, ` : ''}average ${avg(me ?? { points: 0, meals: 0 })}, ${countdown(ch)}${stake}`}
      accessibilityHint={canLeave ? 'Long-press to leave' : undefined}
      onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: ch.id } })}
      onLongPress={
        canLeave
          ? () => {
              haptic.select();
              confirmLeave(ch);
            }
          : undefined
      }
      scaleTo={0.98}>
      <GlassSurface tone="theme" interactive style={styles.row}>
        <View style={[styles.score, { backgroundColor: leading ? c.goodSoft : c.cardMuted }]}>
          {ranked ? (
            <T variant="heading" color={leading ? c.good : c.text} style={styles.num}>
              #{ranked.rank}
            </T>
          ) : (
            <Icon name="trophy" size={20} color={c.textTertiary} />
          )}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline" numberOfLines={1}>
            {ch.days}-day {ch.title.toLowerCase()}
          </T>
          <T variant="caption" tone="secondary" numberOfLines={1}>
            {countdown(ch)}
            {stake}
          </T>
        </View>
        <Icon name="chevron" size={14} color={c.textTertiary} />
      </GlassSurface>
    </Tap>
  );
}

/** Open the share sheet with a challenge's invite link. */
export function inviteToChallenge(ch: Pick<ChallengeView, 'id' | 'days'> & Partial<Pick<ChallengeView, 'entryCents'>>) {
  const stake = ch.entryCents ? ` ${usd(ch.entryCents)} to enter, winner takes the pool.` : '';
  return Share.share({ message: `Join my ${ch.days}-day menu challenge on Second Look. Scan what you order and tap it in.${stake} secondlook://challenge/${ch.id}` });
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
  stakes: { padding: space.xl },
  rule: { flexDirection: 'row', gap: space.sm },
  bullet: { width: 4, height: 4, borderRadius: 2, marginTop: 7 },
  leader: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  play: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  emoji: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  medal: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingRight: space.lg, borderRadius: radius.card },
  score: { width: 64, height: 52, borderRadius: radius.sm + 4, alignItems: 'center', justifyContent: 'center' },
});

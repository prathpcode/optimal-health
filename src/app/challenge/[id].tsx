import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, BackButton } from '@/components/community';
import { Icon } from '@/components/Icon';
import { RulesRing } from '@/components/RulesRing';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { attempt } from '@/components/together';
import { Button, Card, SectionLabel } from '@/components/ui';
import { checkIn, countdown, daysOf, joinChallenge, leaveChallenge, money, todayKey, useChallenge, type ChallengeView } from '@/lib/community';
import { useWhopAccount } from '@/lib/whop';
import { enterAt, gutter, radius, roomAccent, shadow, space, tint, useTheme } from '@/theme';

const QUESTION: Record<string, string> = {
  no_added_sugar: 'No added sugar today?',
  under_sodium_limit: 'Under your salt limit today?',
  cook_at_home: 'Cooked at home today?',
};

const SHARES: Record<number, number[]> = { 1: [100], 2: [70, 30], 3: [60, 30, 10] };

export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ch = useChallenge(id);
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { account } = useWhopAccount();
  const [busy, setBusy] = useState(false);
  if (!ch) return null;
  const accent = roomAccent[ch.room] ?? c.text;

  const share = () => Share.share({ message: `Join my “${ch.title}” challenge on Fit: fitscanner://challenge/${ch.id}` });
  const join = async () => {
    setBusy(true);
    await attempt(joinChallenge(ch.id, account?.name ?? 'You'));
    setBusy(false);
  };
  const leave = () =>
    Alert.alert('Leave challenge?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => void attempt(leaveChallenge(ch.id)) },
    ]);
  const score = ch.me?.score ?? 0;
  const shares = SHARES[ch.prizes.length] ?? [100];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingHorizontal: gutter, paddingBottom: insets.bottom + (ch.joined ? space.huge : 120), gap: space.xl }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <BackButton />
          <Tap accessibilityRole="button" accessibilityLabel="Share challenge" feedback="tap" hitSlop={8} onPress={share} style={[styles.round, { backgroundColor: c.card }, shadow('card', dark)]}>
            <Icon name="share" size={16} color={c.text} />
          </Tap>
        </View>

        <Animated.View entering={enterAt(0, reduced)} style={[styles.hero, { backgroundColor: c.primary }, shadow('floating', dark)]}>
          <View style={{ flex: 1, gap: space.sm }}>
            <View style={[styles.tag, { backgroundColor: tint(accent, 0.25) }]}>
              <T variant="caption" color={accent}>
                {ch.roomTitle}
              </T>
            </View>
            <T variant="title" color={c.onPrimary}>
              {ch.title}
            </T>
            <T variant="display" color={c.onPrimary}>
              {ch.entryCents ? money(ch.potCents) : 'Free'}
            </T>
            <T variant="caption" color={tint(c.onPrimary, 0.6)}>
              {ch.players.length} in · {countdown(ch)}
            </T>
          </View>
          {ch.joined ? (
            <RulesRing
              size={92}
              stroke={10}
              segments={[
                { value: score, color: accent },
                { value: Math.max(0.0001, ch.max - score), color: tint(c.onPrimary, 0.15) },
              ]}
              center={
                <View style={{ alignItems: 'center' }}>
                  <T variant="headline" color={c.onPrimary}>
                    {score}
                  </T>
                  <T variant="caption" color={tint(c.onPrimary, 0.5)}>
                    /{ch.max}
                  </T>
                </View>
              }
            />
          ) : null}
        </Animated.View>

        {ch.joined && ch.status === 'live' ? <Today ch={ch} accent={accent} /> : null}
        {ch.joined && ch.status !== 'upcoming' ? <DayStrip ch={ch} accent={accent} /> : null}

        <Animated.View entering={enterAt(2, reduced)} style={{ gap: space.md }}>
          <SectionLabel>{ch.status === 'upcoming' ? 'Players' : 'Leaderboard'}</SectionLabel>
          <Card style={{ padding: 0, paddingVertical: space.xs }}>
            {ch.standings.map((p, n) => {
              const prize = ch.entryCents && ch.status !== 'upcoming' ? ch.prizes[p.rank - 1] : 0;
              const medal = ch.status !== 'upcoming' && p.rank <= ch.prizes.length;
              return (
                <View key={p.id}>
                  {n ? <View style={[styles.divider, { backgroundColor: c.hairline }]} /> : null}
                  <View style={[styles.standing, p.me ? { backgroundColor: tint(accent, dark ? 0.16 : 0.08) } : null]}>
                    <View style={[styles.rank, medal ? { backgroundColor: accent } : null]}>
                      <T variant="caption" color={medal ? '#FFFFFF' : c.textTertiary}>
                        {ch.status === 'upcoming' ? '' : p.rank}
                      </T>
                    </View>
                    <Avatar name={p.name} url={p.avatarUrl ?? (p.me ? account?.avatarUrl : undefined)} size={32} />
                    <T variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                      {p.me ? 'You' : p.name}
                    </T>
                    {prize ? (
                      <T variant="caption" tone="secondary">
                        {money(prize)}
                      </T>
                    ) : null}
                    {ch.status !== 'upcoming' ? (
                      <T variant="bodyStrong" style={{ fontVariant: ['tabular-nums'], minWidth: 24, textAlign: 'right' }}>
                        {p.score}
                      </T>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </Card>
        </Animated.View>

        <View style={{ gap: space.sm }}>
          <Rule icon="trophy" text={ch.entryCents ? `Top ${shares.length}: ${shares.map((s) => `${s}%`).join(' / ')}` : 'Top score wins'} />
          <Rule icon="checkCircle" text={`${ch.needed} points to place`} />
          {ch.entryCents ? <Rule icon="retry" text="Nobody places? Everyone’s refunded" /> : null}
        </View>

        {ch.joined && ch.status !== 'ended' ? (
          <Tap accessibilityRole="button" accessibilityLabel="Leave challenge" onPress={leave} style={styles.leave} feedback="tap">
            <T variant="caption" tone="tertiary">
              Leave challenge
            </T>
          </Tap>
        ) : null}
      </ScrollView>

      {!ch.joined && ch.status !== 'ended' ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md, backgroundColor: c.bg, borderTopColor: c.hairline }]}>
          <Button label={ch.entryCents ? `Join for ${money(ch.entryCents)}` : 'Join'} onPress={join} loading={busy} />
        </View>
      ) : null}
    </View>
  );
}

function Rule({ icon, text }: { icon: 'trophy' | 'checkCircle' | 'retry'; text: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.rule}>
      <Icon name={icon} size={13} color={c.textTertiary} />
      <T variant="caption" tone="secondary">
        {text}
      </T>
    </View>
  );
}

/** Today's job: a check-in, or how many scans have counted so far. */
function Today({ ch, accent }: { ch: ChallengeView; accent: string }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const day = todayKey(ch);
  const points = ch.me?.perDay[day] ?? 0;

  if (ch.t.proof === 'scans') {
    const done = points >= ch.t.perDayMax;
    return (
      <Animated.View entering={enterAt(1, reduced)}>
        <Card style={styles.today}>
          <T variant="headline" style={{ flex: 1 }}>
            {done ? 'Done for today' : `${points}/${ch.t.perDayMax} today`}
          </T>
          {done ? (
            <Icon name="checkCircle" size={26} color={accent} />
          ) : (
            <Tap accessibilityRole="button" accessibilityLabel="Scan now" feedback="tap" onPress={() => router.push('/scan')} style={[styles.smallBtn, { backgroundColor: c.primary }]}>
              <Icon name="camera" size={14} color={c.onPrimary} />
              <T variant="bodyStrong" color={c.onPrimary}>
                Scan
              </T>
            </Tap>
          )}
        </Card>
      </Animated.View>
    );
  }

  const answered = points ? 'yes' : undefined;
  return (
    <Animated.View entering={enterAt(1, reduced)}>
      <Card style={{ gap: space.lg }}>
        <T variant="headline">{QUESTION[ch.template] ?? 'Done today?'}</T>
        <View style={styles.answers}>
          {(['yes', 'no'] as const).map((v) => {
            const on = answered === v;
            return (
              <Tap
                key={v}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={v === 'yes' ? 'Yes' : 'Not today'}
                feedback="select"
                onPress={() => void attempt(checkIn(ch.id, day, v))}
                style={[styles.answer, { backgroundColor: on ? accent : c.cardMuted }]}>
                <T variant="bodyStrong" color={on ? '#FFFFFF' : c.text}>
                  {v === 'yes' ? 'Yes' : 'Not today'}
                </T>
              </Tap>
            );
          })}
        </View>
      </Card>
    </Animated.View>
  );
}

function DayStrip({ ch, accent }: { ch: ChallengeView; accent: string }) {
  const { c } = useTheme();
  const today = todayKey(ch);
  const days = daysOf(ch);
  return (
    <View style={styles.strip} accessibilityLabel={`${ch.me?.score ?? 0} points so far`}>
      {days.map((d) => {
        const got = (ch.me?.perDay[d] ?? 0) > 0;
        const future = d > today;
        return (
          <View
            key={d}
            style={[
              styles.dot,
              { backgroundColor: got ? accent : future ? 'transparent' : c.cardMuted, borderColor: d === today ? accent : future ? c.hairline : 'transparent' },
              days.length > 14 ? { height: 8 } : null,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.lg, borderRadius: radius.card, padding: space.xl },
  tag: { alignSelf: 'flex-start', paddingHorizontal: space.sm + 2, paddingVertical: 4, borderRadius: radius.chip },
  today: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  smallBtn: { flexDirection: 'row', gap: space.xs, height: 40, paddingHorizontal: space.lg, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
  answers: { flexDirection: 'row', gap: space.sm },
  answer: { flex: 1, height: 48, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  strip: { flexDirection: 'row', gap: 4 },
  dot: { flex: 1, height: 10, borderRadius: 5, borderWidth: 1.5 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 100 },
  standing: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  rank: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rule: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  leave: { height: 44, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: gutter, paddingTop: space.md, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
});

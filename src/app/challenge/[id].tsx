import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Fit } from '@engine/types';
import { DayStrip, FitLegend, MealDot, Rank } from '@/components/challenge';
import { Avatar, BackButton } from '@/components/community';
import { Icon } from '@/components/Icon';
import { RulesRing } from '@/components/RulesRing';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { attempt } from '@/components/together';
import { Button, Card, SectionLabel } from '@/components/ui';
import { celebrate } from '@/lib/celebrate';
import { countdown, joinChallenge, leaveChallenge, PREVIEW, useChallenge, type ChallengeView, type Standing } from '@/lib/community';
import { enterAt, gutter, radius, shadow, space, useTheme } from '@/theme';

/** Challenges whose "you won" moment has already been shown in this session. */
const cheered = new Set<string>();

export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ch = useChallenge(id);
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState(false);

  const won = ch?.status === 'ended' && ch.me?.rank === 1 && ch.me.qualified && ch.standings.length > 1;
  const wonScore = ch?.me?.score;
  useEffect(() => {
    if (!won || cheered.has(id)) return;
    cheered.add(id);
    celebrate({ title: 'You won!', subtitle: `${wonScore}% fit`, tone: 'great' });
  }, [won, id, wonScore]);

  if (!ch) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + space.sm, paddingHorizontal: gutter }}>
        <BackButton />
      </View>
    );
  }

  const invite = () => Share.share({ message: `Join my ${ch.days}-day “Eat what fits” challenge on Fit: fitscanner://challenge/${ch.id}` });
  const join = async () => {
    setBusy(true);
    const ok = await attempt(joinChallenge(ch.id));
    setBusy(false);
    if (ok) celebrate({ title: 'You’re in!', subtitle: 'Order what fits you', tone: 'great' });
  };
  const leave = () =>
    Alert.alert('Leave this challenge?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => void attempt(leaveChallenge(ch.id)).then((ok) => ok && router.back()) },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingHorizontal: gutter, paddingBottom: insets.bottom + 150, gap: space.xl }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <BackButton />
          {ch.status !== 'ended' ? (
            <Tap
              accessibilityRole="button"
              accessibilityLabel="Invite friends"
              feedback="tap"
              hitSlop={8}
              onPress={invite}
              style={[styles.round, { backgroundColor: c.card }, shadow('card', dark)]}>
              <Icon name="share" size={16} color={c.text} />
            </Tap>
          ) : null}
        </View>

        <View style={{ gap: space.xs }}>
          <T variant="micro" tone="secondary">
            {ch.days}-day challenge · {countdown(ch)}
          </T>
          <T variant="display">{ch.title}</T>
        </View>

        <Animated.View entering={enterAt(0, reduced)}>
          <Hero ch={ch} />
        </Animated.View>

        {ch.me && ch.status !== 'upcoming' ? (
          <Animated.View entering={enterAt(1, reduced)} style={{ gap: space.md }}>
            <SectionLabel>Your meals</SectionLabel>
            <DayStrip ch={ch} perDay={ch.me.perDay} />
          </Animated.View>
        ) : null}

        {ch.status === 'ended' && ch.standings.length > 1 ? <Podium standings={ch.standings} /> : null}

        <Animated.View entering={enterAt(2, reduced)} style={{ gap: space.md }}>
          <SectionLabel>{ch.status === 'ended' ? 'Final' : 'Leaderboard'}</SectionLabel>
          <Card style={{ padding: 0, paddingVertical: space.xs }}>
            {ch.standings.map((p, n) => (
              <View key={p.id}>
                {n ? <View style={[styles.divider, { backgroundColor: c.hairline }]} /> : null}
                <PlayerRow p={p} needed={ch.needed} />
              </View>
            ))}
            {ch.standings.length <= 1 && ch.status !== 'ended' ? (
              <Tap accessibilityRole="button" accessibilityLabel="Invite a friend" onPress={invite} style={styles.inviteRow} feedback="tap">
                <View style={[styles.invitePlus, { borderColor: c.rule }]}>
                  <Icon name="plus" size={14} color={c.textSecondary} weight="bold" />
                </View>
                <T variant="bodyStrong" tone="secondary">
                  Invite a friend to compete
                </T>
              </Tap>
            ) : null}
          </Card>
        </Animated.View>

        {ch.joined && ch.status !== 'ended' ? (
          <Tap accessibilityRole="button" accessibilityLabel="Leave challenge" onPress={leave} style={styles.leave} feedback="tap">
            <T variant="caption" tone="tertiary">
              Leave challenge
            </T>
          </Tap>
        ) : null}
      </ScrollView>

      {ch.status !== 'ended' ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md, backgroundColor: c.bg, borderTopColor: c.hairline }]}>
          {ch.joined ? (
            <View style={styles.actions}>
              <Button label="Invite" icon="share" variant="secondary" onPress={invite} style={{ flex: 1 }} />
              <Button label="Scan a menu" icon="camera" onPress={() => router.push('/scan')} style={{ flex: 1.4 }} />
            </View>
          ) : (
            <Button label="Join challenge" onPress={join} loading={busy} />
          )}
          {PREVIEW ? (
            <T variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
              Friends can join once Together is live.
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** The big picture: your fit %, or the countdown before it starts, and how scoring works. */
function Hero({ ch }: { ch: ChallengeView }) {
  const { c } = useTheme();
  const me = ch.me;

  if (ch.status === 'upcoming') {
    return (
      <Card style={styles.hero}>
        <Icon name="clock" size={26} color={c.textSecondary} />
        <T variant="display">{countdown(ch).replace('Starts in ', '')}</T>
        <T tone="secondary">until it starts</T>
        <FitLegend />
      </Card>
    );
  }

  const score = me?.score ?? null;
  const sub = !me
    ? `${ch.standings.length} playing`
    : !me.qualified
      ? `${me.meals}/${ch.needed} meals to qualify`
      : ch.standings.length > 1
        ? `#${me.rank} of ${ch.standings.length}`
        : `${me.meals} meals logged`;
  return (
    <Card style={styles.hero}>
      <RulesRing
        size={168}
        stroke={14}
        segments={[
          { value: score ?? 0, color: c.good },
          { value: Math.max(0.0001, 100 - (score ?? 0)), color: c.cardMuted },
        ]}
        center={
          <View style={{ alignItems: 'center' }}>
            <T variant="display" style={{ fontSize: 44, lineHeight: 50 }}>
              {score != null ? `${score}%` : '–'}
            </T>
            <T variant="caption" tone="secondary">
              fit
            </T>
          </View>
        }
      />
      <T variant="headline" color={me && !me.qualified ? c.okay : c.text}>
        {sub}
      </T>
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <FitLegend />
        <T variant="caption" tone="tertiary">
          Tap what you ordered after each scan
        </T>
      </View>
    </Card>
  );
}

function PlayerRow({ p, needed }: { p: Standing; needed: number }) {
  const { c } = useTheme();
  const dots: Fit[] = [...Array<Fit>(p.good).fill('good'), ...Array<Fit>(p.okay).fill('okay'), ...Array<Fit>(p.notFit).fill('not_fit')].slice(0, 10);
  return (
    <View style={[styles.player, p.me ? { backgroundColor: c.cardMuted } : null, !p.qualified ? { opacity: 0.6 } : null]}>
      <Rank rank={p.rank} />
      <Avatar name={p.name} url={p.avatarUrl} size={34} />
      <View style={{ flex: 1, gap: 4 }}>
        <T variant="bodyStrong" numberOfLines={1}>
          {p.me ? 'You' : p.name}
        </T>
        {p.qualified ? (
          <View style={styles.dots}>
            {dots.map((f, i) => (
              <MealDot key={i} fit={f} size={7} />
            ))}
          </View>
        ) : (
          <T variant="caption" tone="secondary">
            {p.meals}/{needed} meals
          </T>
        )}
      </View>
      <T variant="headline" style={{ fontVariant: ['tabular-nums'] }}>
        {p.score != null ? `${p.score}%` : '–'}
      </T>
    </View>
  );
}

/** The top three on steps once the challenge is over. */
function Podium({ standings }: { standings: Standing[] }) {
  const { c } = useTheme();
  const top = standings.filter((s) => s.qualified).slice(0, 3);
  if (!top.length) return null;
  const order = [top[1], top[0], top[2]].filter(Boolean) as Standing[];
  const height = (rank: number) => (rank === 1 ? 92 : rank === 2 ? 68 : 52);
  return (
    <View style={styles.podium}>
      {order.map((p) => (
        <View key={p.id} style={{ flex: 1, alignItems: 'center', gap: space.sm }}>
          <Avatar name={p.name} url={p.avatarUrl} size={p.rank === 1 ? 52 : 42} />
          <T variant="caption" numberOfLines={1}>
            {p.me ? 'You' : p.name}
          </T>
          <View style={[styles.step, { height: height(p.rank), backgroundColor: p.rank === 1 ? c.goodSoft : c.cardMuted }]}>
            <Rank rank={p.rank} />
            <T variant="bodyStrong">{p.score}%</T>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', gap: space.lg, paddingVertical: space.xxl },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 96 },
  player: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  dots: { flexDirection: 'row', gap: 3 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  invitePlus: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', marginLeft: 40 },
  leave: { height: 44, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: gutter, paddingTop: space.md, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', gap: space.sm },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  step: { width: '100%', borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 2 },
});

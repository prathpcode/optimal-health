import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Fit } from '@engine/types';
import { DayStrip, FitLegend, FitMeter, MealDot, ordinalShort, Rank } from '@/components/challenge';
import { Avatar } from '@/components/community';
import { GlassButton, GlassSurface } from '@/components/Glass';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { attempt, GlassAction, SectionTitle } from '@/components/together';
import { celebrate } from '@/lib/celebrate';
import { countdown, joinChallenge, leaveChallenge, PREVIEW, useChallenge, type ChallengeView, type Standing } from '@/lib/community';
import { goBack } from '@/lib/nav';
import { enterAt, gutter, radius, space, useTheme } from '@/theme';

/** Challenges whose "you won" moment has already been shown in this session. */
const cheered = new Set<string>();

export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ch = useChallenge(id);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState(false);

  const won = ch?.status === 'ended' && ch.me?.rank === 1 && ch.me.qualified && ch.standings.length > 1;
  const wonScore = ch?.me?.score;
  useEffect(() => {
    if (!won || cheered.has(id)) return;
    cheered.add(id);
    celebrate({ title: 'You won', subtitle: `${wonScore}% fit`, tone: 'great' });
  }, [won, id, wonScore]);

  if (!ch) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + space.md, paddingHorizontal: gutter }}>
        <GlassButton tone="theme" icon="back" label="Back" onPress={goBack} />
      </View>
    );
  }

  const invite = () => Share.share({ message: `Eat what fits with me on Fit, ${ch.days} days: fitscanner://challenge/${ch.id}` });
  const join = async () => {
    setBusy(true);
    const ok = await attempt(joinChallenge(ch.id));
    setBusy(false);
    if (ok) celebrate({ title: 'You’re in', subtitle: 'Order what fits you', tone: 'great' });
  };
  const leave = () =>
    Alert.alert('Leave this challenge?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => void attempt(leaveChallenge(ch.id)).then((ok) => ok && goBack()) },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + space.md, paddingHorizontal: gutter, paddingBottom: insets.bottom + 62 + space.huge, gap: space.xxxl }}
        showsVerticalScrollIndicator={false}>
        <View style={{ gap: space.xl }}>
          <View style={styles.topBar}>
            <GlassButton tone="theme" icon="back" label="Back" onPress={goBack} />
            {ch.status !== 'ended' ? <GlassButton tone="theme" icon="share" label="Invite friends" onPress={invite} /> : null}
          </View>
          <View style={{ gap: space.xs }}>
            <T variant="heroBold">{ch.title}</T>
            <T variant="bodyStrong" tone="secondary">
              {ch.days} days · {countdown(ch)}
            </T>
          </View>
        </View>

        <Animated.View entering={enterAt(0, reduced)}>
          <Hero ch={ch} />
        </Animated.View>

        <Animated.View entering={enterAt(1, reduced)}>
          <SectionTitle title="How to win" />
          <GlassSurface tone="theme" style={styles.how}>
            <T variant="bodyStrong">Log what you order after each scan.</T>
            <FitLegend />
            <T variant="caption" tone="secondary">
              Highest fit % wins · {ch.needed} meals to qualify
            </T>
          </GlassSurface>
        </Animated.View>

        {ch.me && ch.status !== 'upcoming' ? (
          <Animated.View entering={enterAt(2, reduced)}>
            <SectionTitle title="Your meals" />
            <DayStrip ch={ch} perDay={ch.me.perDay} />
          </Animated.View>
        ) : null}

        <Animated.View entering={enterAt(3, reduced)}>
          <SectionTitle title={ch.status === 'ended' ? 'Final' : 'Standings'} />
          {ch.status === 'ended' && ch.standings.length > 1 ? <Podium standings={ch.standings} /> : null}
          <View style={{ gap: space.sm }}>
            {ch.standings.map((p) => (
              <PlayerRow key={p.id} p={p} needed={ch.needed} />
            ))}
            {ch.standings.length <= 1 && ch.status !== 'ended' ? (
              <Tap accessibilityRole="button" accessibilityLabel="Invite a friend" onPress={invite} scaleTo={0.98}>
                <View style={[styles.invite, { borderColor: c.hairline }]}>
                  <T variant="bodyStrong" tone="secondary">
                    {PREVIEW ? 'Invites open when Together goes live' : 'Invite a friend to play'}
                  </T>
                </View>
              </Tap>
            ) : null}
          </View>
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
        <View style={[styles.cta, { bottom: insets.bottom + space.md }]}>
          {ch.joined ? (
            <GlassAction label="Scan a menu" icon="camera" onPress={() => router.push('/scan')} />
          ) : (
            <GlassAction label="Join challenge" icon="trophy" onPress={join} loading={busy} />
          )}
        </View>
      ) : null}
    </View>
  );
}

/** Your fit % front and centre, or the countdown before it starts. */
function Hero({ ch }: { ch: ChallengeView }) {
  const { c } = useTheme();
  const me = ch.me;
  if (ch.status === 'upcoming') {
    return (
      <View style={{ gap: space.xs }}>
        <T variant="heroBold" style={{ fontSize: 56, lineHeight: 62 }}>
          {countdown(ch).replace('Starts in ', '')}
        </T>
        <T variant="bodyStrong" tone="secondary">
          to go
        </T>
      </View>
    );
  }
  const line = !me
    ? `${ch.standings.length} playing`
    : !me.qualified
      ? `${me.meals} of ${ch.needed} meals to qualify`
      : ch.standings.length > 1
        ? `${ordinalShort(me.rank)} of ${ch.standings.length}`
        : `${me.meals} meals logged`;
  return (
    <View style={{ gap: space.md }}>
      <FitMeter score={me?.score ?? null} />
      <T variant="bodyStrong" color={me && !me.qualified ? c.okay : c.textSecondary}>
        {line}
      </T>
    </View>
  );
}

function PlayerRow({ p, needed }: { p: Standing; needed: number }) {
  const dots: Fit[] = [...Array<Fit>(p.good).fill('good'), ...Array<Fit>(p.okay).fill('okay'), ...Array<Fit>(p.notFit).fill('not_fit')].slice(0, 12);
  return (
    <GlassSurface tone="theme" style={[styles.player, !p.qualified ? { opacity: 0.6 } : null]}>
      <Rank rank={p.rank} />
      <Avatar name={p.name} url={p.avatarUrl} size={36} />
      <View style={{ flex: 1, gap: 4 }}>
        <T variant="headline" numberOfLines={1}>
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
            {p.meals} of {needed} meals
          </T>
        )}
      </View>
      <T variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
        {p.score != null ? `${p.score}%` : '–'}
      </T>
    </GlassSurface>
  );
}

/** The top three on steps once it's over. */
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
  how: { borderRadius: radius.card, padding: space.lg, gap: space.md },
  player: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingRight: space.lg, borderRadius: radius.card },
  dots: { flexDirection: 'row', gap: 3 },
  invite: { height: 56, borderRadius: radius.card, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  leave: { height: 44, alignItems: 'center', justifyContent: 'center' },
  cta: { position: 'absolute', left: gutter, right: gutter },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginBottom: space.md },
  step: { width: '100%', borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 2 },
});

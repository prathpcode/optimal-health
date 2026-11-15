import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirmLeave, HowToWin, inviteToChallenge, ordinalShort, PlayFeed, RaceBoard } from '@/components/challenge';
import { GlassButton } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { Podium } from '@/components/Podium';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { attempt, GlassAction, SectionTitle } from '@/components/together';
import { celebrate } from '@/lib/celebrate';
import { countdown, joinChallenge, PREVIEW, useChallenge, type ChallengeView } from '@/lib/community';
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

  const won = ch?.status === 'ended' && ch.me?.rank === 1 && (ch.me.points ?? 0) > 0 && ch.standings.length > 1;
  const wonPoints = ch?.me?.points;
  useEffect(() => {
    if (!won || cheered.has(id)) return;
    cheered.add(id);
    celebrate({ title: 'You won', subtitle: `${wonPoints} points`, tone: 'great', icon: 'trophy' });
  }, [won, id, wonPoints]);

  if (!ch) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + space.md, paddingHorizontal: gutter }}>
        <GlassButton tone="theme" icon="back" label="Back" onPress={goBack} />
      </View>
    );
  }

  const invite = () => void inviteToChallenge(ch);
  const join = async () => {
    setBusy(true);
    const ok = await attempt(joinChallenge(ch.id));
    setBusy(false);
    if (ok) celebrate({ title: 'You’re in', subtitle: 'Every dish that fits scores', tone: 'great' });
  };
  const canLeave = ch.joined && ch.status !== 'ended';
  const options = () =>
    Alert.alert(`${ch.days}-day ${ch.title.toLowerCase()}`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave race', style: 'destructive', onPress: () => confirmLeave(ch, goBack) },
    ]);

  const sub = ch.status === 'live' ? `Day ${ch.dayNumber} of ${ch.days} · ${countdown(ch)}` : countdown(ch);
  const alone = ch.standings.length <= 1 && ch.status !== 'ended';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + space.md, paddingHorizontal: gutter, paddingBottom: insets.bottom + 62 + space.huge, gap: space.xxxl }}
        showsVerticalScrollIndicator={false}>
        <View style={{ gap: space.xl }}>
          <View style={styles.topBar}>
            <GlassButton tone="theme" icon="back" label="Back" onPress={goBack} />
            <View style={styles.topActions}>
              {ch.status !== 'ended' ? <GlassButton tone="theme" icon="share" label="Invite friends" onPress={invite} /> : null}
              {canLeave ? <GlassButton tone="theme" icon="more" label="Race options" onPress={options} /> : null}
            </View>
          </View>
          <View style={{ gap: space.xs }}>
            <T variant="heroBold">
              {ch.days}-day {ch.title.toLowerCase()}
            </T>
            <T variant="bodyStrong" tone="secondary">
              {sub}
            </T>
          </View>
        </View>

        <Animated.View entering={enterAt(0, reduced)} style={{ gap: space.lg }}>
          <Total ch={ch} />
          <View>
            <SectionTitle title="How to win" />
            <HowToWin ch={ch} />
          </View>
        </Animated.View>

        <Animated.View entering={enterAt(1, reduced)}>
          <SectionTitle title={ch.status === 'ended' ? 'Final standings' : 'Standings'} />
          <View style={{ gap: space.sm }}>
            {ch.status !== 'upcoming' && ch.standings.length ? <Podium standings={ch.standings} /> : null}
            <RaceBoard ch={ch} />
            {alone ? (
              <Tap accessibilityRole="button" accessibilityLabel="Invite a friend" onPress={invite} scaleTo={0.98}>
                <View style={[styles.invite, { borderColor: c.hairline }]}>
                  <Icon name="plus" size={16} color={c.textSecondary} weight="bold" />
                  <T variant="bodyStrong" tone="secondary">
                    {PREVIEW ? 'Invites open when Together goes live' : 'Invite a friend to race'}
                  </T>
                </View>
              </Tap>
            ) : null}
          </View>
        </Animated.View>

        {ch.status !== 'upcoming' ? (
          <Animated.View entering={enterAt(2, reduced)}>
            <SectionTitle title="What everyone ordered" />
            <PlayFeed ch={ch} />
          </Animated.View>
        ) : null}

      </ScrollView>

      {ch.status !== 'ended' ? (
        <View style={[styles.cta, { bottom: insets.bottom + space.md }]}>
          {ch.joined ? (
            <GlassAction label="Scan a menu" icon="camera" onPress={() => router.push('/scan')} />
          ) : (
            <GlassAction label="Join the race" icon="trophy" onPress={join} loading={busy} />
          )}
        </View>
      ) : null}
    </View>
  );
}

/** Your points, big, with where they put you. Before the start, the countdown. */
function Total({ ch }: { ch: ChallengeView }) {
  const me = ch.me;
  if (ch.status === 'upcoming') {
    return (
      <View style={styles.totalRow}>
        <T variant="heroBold" style={styles.big}>
          {countdown(ch).replace('Starts in ', '')}
        </T>
        <T variant="hero" tone="secondary" style={styles.unit}>
          to go
        </T>
      </View>
    );
  }
  const place = me && ch.standings.length > 1 ? `${ordinalShort(me.rank)} of ${ch.standings.length}` : null;
  return (
    <View style={{ gap: space.xs }} accessibilityLabel={me ? `${me.points} points${place ? `, ${place}` : ''}` : `${ch.standings.length} racing`}>
      <View style={styles.totalRow}>
        <T variant="heroBold" style={styles.big}>
          {me ? me.points : ch.standings.length}
        </T>
        <T variant="hero" tone="secondary" style={styles.unit}>
          {me ? (me.points === 1 ? 'point' : 'points') : 'racing'}
        </T>
      </View>
      {place ? (
        <T variant="bodyStrong" tone="secondary">
          {place}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  topActions: { flexDirection: 'row', gap: space.sm },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  big: { fontSize: 72, lineHeight: 78, letterSpacing: -2, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 28, lineHeight: 34 },
  invite: { flexDirection: 'row', gap: space.sm, height: 56, borderRadius: radius.card, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  leave: { height: 44, alignItems: 'center', justifyContent: 'center' },
  cta: { position: 'absolute', left: gutter, right: gutter },
});

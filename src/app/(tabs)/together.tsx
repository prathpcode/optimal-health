import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/community';
import { Icon, type IconName } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { AddTile, attempt, ChallengeHero, ChallengeRow, Orbit, RoomTile } from '@/components/together';
import { Button, SectionLabel, Skeleton } from '@/components/ui';
import { PREVIEW, setAutoPlace, useTogether, type RoomView } from '@/lib/community';
import { signInWithWhop, signOutOfWhop, useWhopAccount } from '@/lib/whop';
import { enterAt, gutter, radius, roomAccent, space, tint, useTheme } from '@/theme';

export default function TogetherScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = Platform.OS === 'ios' ? insets.bottom : 0;
  const { ready, account } = useWhopAccount();

  const accountMenu = () =>
    Alert.alert(account ? `@${account.username}` : 'Whop', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOutOfWhop() },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: bottom + space.huge }}
        showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { paddingHorizontal: gutter }]}>
          <View style={styles.brand}>
            <View style={[styles.logo, { backgroundColor: c.primary }]}>
              <Icon name="people" size={15} color={c.onPrimary} />
            </View>
            <T variant="title">Together</T>
            {PREVIEW && account ? (
              <View style={[styles.preview, { backgroundColor: c.cardMuted }]}>
                <T variant="micro" tone="secondary">
                  Preview
                </T>
              </View>
            ) : null}
          </View>
          {account ? (
            <Tap accessibilityRole="button" accessibilityLabel="Account" feedback="tap" onPress={accountMenu} hitSlop={8}>
              <Avatar name={account.name} url={account.avatarUrl} size={40} />
            </Tap>
          ) : null}
        </View>
        {!ready ? null : account ? <SignedIn /> : <SignedOut />}
      </ScrollView>
    </View>
  );
}

function SignedOut() {
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    const r = await signInWithWhop();
    setBusy(false);
    if (!r.ok && !r.cancelled) Alert.alert('Couldn’t sign in', r.message ?? 'Try again in a moment.');
  };

  return (
    <View style={{ paddingHorizontal: gutter, gap: space.xxl, marginTop: space.xl }}>
      <Animated.View entering={enterAt(0, reduced)}>
        <Orbit />
      </Animated.View>
      <Animated.View entering={enterAt(1, reduced)} style={{ gap: space.sm, alignItems: 'center' }}>
        <T variant="display" style={{ textAlign: 'center' }}>
          Find your people
        </T>
        <T tone="secondary" style={{ textAlign: 'center' }}>
          Rooms and challenges with people who eat like you.
        </T>
      </Animated.View>
      <Animated.View entering={enterAt(2, reduced)}>
        <Button label="Continue with Whop" onPress={signIn} loading={busy} />
      </Animated.View>
    </View>
  );
}

function SignedIn() {
  const { autoPlace, matched, mine, challenges, loading } = useTogether();
  const reduced = useReducedMotion();
  const hero = challenges.find((ch) => ch.joined);
  const rows = challenges.filter((ch) => ch !== hero).slice(0, 2);
  const asking = autoPlace === null && matched.length > 0;

  if (loading) {
    return (
      <View style={{ paddingHorizontal: gutter, gap: space.md }}>
        <Skeleton width={90} height={11} />
        <View style={{ flexDirection: 'row', gap: space.md }}>
          {[0, 1].map((i) => (
            <Skeleton key={i} width={150} height={168} style={{ borderRadius: radius.card }} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: space.xxxl }}>
      {asking ? <Placement rooms={matched} /> : null}

      {!asking ? (
        <Animated.View entering={enterAt(0, reduced)} style={{ gap: space.md }}>
          <SectionLabel style={{ paddingHorizontal: gutter }}>Your rooms</SectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
            {mine.map((r, i) => (
              <Animated.View key={r.slug} entering={enterAt(i + 1, reduced)}>
                <RoomTile room={r} index={i} />
              </Animated.View>
            ))}
            <Animated.View entering={enterAt(mine.length + 1, reduced)}>
              <AddTile width={mine.length ? 96 : 150} />
            </Animated.View>
          </ScrollView>
        </Animated.View>
      ) : null}

      {!asking && (hero || rows.length) ? (
        <Animated.View entering={enterAt(2, reduced)} style={{ gap: space.md, paddingHorizontal: gutter }}>
          <SectionLabel>Challenges</SectionLabel>
          {hero ? <ChallengeHero ch={hero} /> : null}
          {rows.map((ch) => (
            <ChallengeRow key={ch.id} ch={ch} />
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

/** One question, once: join the rooms your conditions match. */
function Placement({ rooms }: { rooms: RoomView[] }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const answer = async (on: boolean) => {
    setBusy(true);
    await attempt(setAutoPlace(on));
    setBusy(false);
  };
  return (
    <View style={{ gap: space.xl }}>
      <Animated.View entering={enterAt(0, reduced)} style={{ paddingHorizontal: gutter, gap: space.xs }}>
        <T variant="display">{rooms.length === 1 ? 'Your room' : `${rooms.length} rooms for you`}</T>
        <T tone="secondary">Matched to your conditions.</T>
      </Animated.View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
        {rooms.map((r, i) => (
          <Animated.View key={r.slug} entering={enterAt(i + 1, reduced)}>
            <MatchTile room={r} index={i} />
          </Animated.View>
        ))}
      </ScrollView>
      <Animated.View entering={enterAt(rooms.length + 1, reduced)} style={{ paddingHorizontal: gutter, gap: space.sm }}>
        <Button label={rooms.length === 1 ? 'Join' : 'Join all'} onPress={() => void answer(true)} loading={busy} />
        <Tap accessibilityRole="button" accessibilityLabel="Not now" onPress={() => void answer(false)} disabled={busy} style={styles.notNow} feedback="tap">
          <T variant="bodyStrong" tone="secondary">
            Not now
          </T>
        </Tap>
        <View style={styles.privacy}>
          <Icon name="lock" size={12} color={c.textTertiary} />
          <T variant="caption" tone="tertiary">
            Your profile stays private.
          </T>
        </View>
      </Animated.View>
    </View>
  );
}

/** A matched room in the placement prompt: the room tile plus why it matched. */
function MatchTile({ room, index }: { room: RoomView; index: number }) {
  const { c, dark } = useTheme();
  const accent = roomAccent[room.slug] ?? c.text;
  return (
    <View style={{ gap: space.sm, width: 150 }}>
      <RoomTile room={room} index={index} />
      <View style={[styles.reason, { backgroundColor: tint(accent, dark ? 0.22 : 0.12) }]}>
        <Icon name={room.icon as IconName} size={11} color={accent} />
        <T variant="caption" color={accent} numberOfLines={1} style={{ flexShrink: 1 }}>
          {room.reasons[0]}
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xl, minHeight: 40 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  logo: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  preview: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.chip, marginLeft: space.xs },
  carousel: { paddingHorizontal: gutter, gap: space.md },
  notNow: { height: 44, alignItems: 'center', justifyContent: 'center' },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  reason: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', paddingHorizontal: space.sm + 2, paddingVertical: 4, borderRadius: radius.chip, maxWidth: 150 },
});

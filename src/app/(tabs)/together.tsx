import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChallengeRow, FitLegend } from '@/components/challenge';
import { Avatar } from '@/components/community';
import { Icon, type IconName } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { AddTile, Orbit, RoomTile } from '@/components/together';
import { Button, Card, SectionLabel, Skeleton } from '@/components/ui';
import { PREVIEW, useTogether, useTopRoom } from '@/lib/community';
import { signInWithWhop, signOutOfWhop, useWhopAccount } from '@/lib/whop';
import { enterAt, gutter, radius, roomAccent, shadow, space, tint, useTheme } from '@/theme';

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
              <Avatar name={account.name} url={account.avatarUrl} size={36} />
            </Tap>
          ) : null}
        </View>
        {!ready ? null : account ? <SignedIn /> : <SignedOut />}
      </ScrollView>
    </View>
  );
}

function SignedOut() {
  const { c, dark } = useTheme();
  const reduced = useReducedMotion();
  const room = useTopRoom();
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    const r = await signInWithWhop();
    setBusy(false);
    if (!r.ok && !r.cancelled) Alert.alert('Couldn’t sign in', r.message ?? 'Try again in a moment.');
  };

  const accent = room ? (roomAccent[room.slug] ?? c.text) : c.text;
  return (
    <Animated.View entering={enterAt(0, reduced)} style={{ paddingHorizontal: gutter, gap: space.xxl }}>
      {room ? (
        <View style={[styles.lead, { backgroundColor: tint(accent, dark ? 0.2 : 0.12) }]}>
          <View style={[styles.leadIcon, { backgroundColor: accent }, shadow('floating', dark)]}>
            <Icon name={room.icon as IconName} size={34} color="#FFFFFF" />
          </View>
          <View style={{ gap: space.xs, alignItems: 'center' }}>
            <T variant="micro" color={accent}>
              Your room
            </T>
            <T variant="display" style={{ textAlign: 'center' }}>
              {room.title}
            </T>
            <T tone="secondary" style={{ textAlign: 'center' }}>
              {room.reasons[0] ? `People with ${room.reasons[0].toLowerCase()}, like you` : 'People who eat like you'}
            </T>
          </View>
        </View>
      ) : (
        <View style={{ alignItems: 'center', gap: space.lg }}>
          <Orbit />
          <View style={{ gap: space.xs, alignItems: 'center' }}>
            <T variant="display">Find your people</T>
            <T tone="secondary" style={{ textAlign: 'center' }}>
              Rooms for your conditions and challenges with friends.
            </T>
          </View>
        </View>
      )}
      <View style={{ gap: space.md }}>
        <Button label="Continue with Whop" onPress={signIn} loading={busy} />
        <View style={styles.privacy}>
          <Icon name="lock" size={12} color={c.textTertiary} />
          <T variant="caption" tone="tertiary" style={{ textAlign: 'center', flexShrink: 1 }}>
            Signing in puts you in rooms for your conditions. Your profile stays private.
          </T>
        </View>
      </View>
    </Animated.View>
  );
}

function SignedIn() {
  const { mine, challenges, loading } = useTogether();
  const reduced = useReducedMotion();

  if (loading) {
    return (
      <View style={{ paddingHorizontal: gutter, gap: space.md }}>
        <Skeleton width={100} />
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Skeleton width={148} height={150} />
          <Skeleton width={148} height={150} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: space.xxxl }}>
      <Animated.View entering={enterAt(0, reduced)} style={{ gap: space.md }}>
        <SectionLabel style={{ paddingHorizontal: gutter }}>Your rooms</SectionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: space.md }}>
          {mine.map((r) => (
            <RoomTile key={r.slug} room={r} />
          ))}
          <AddTile />
        </ScrollView>
      </Animated.View>

      <Animated.View entering={enterAt(1, reduced)} style={{ paddingHorizontal: gutter, gap: space.md }}>
        <View style={styles.sectionHead}>
          <SectionLabel>Challenges</SectionLabel>
          {challenges.length ? <NewChallengeLink /> : null}
        </View>
        {challenges.length ? (
          challenges.map((ch, i) => (
            <Animated.View key={ch.id} entering={enterAt(i + 2, reduced)}>
              <ChallengeRow ch={ch} />
            </Animated.View>
          ))
        ) : (
          <StartCard />
        )}
      </Animated.View>
    </View>
  );
}

function NewChallengeLink() {
  return (
    <Tap accessibilityRole="button" accessibilityLabel="New challenge" feedback="tap" hitSlop={8} onPress={() => router.push('/challenge/new')}>
      <T variant="bodyStrong">+ New</T>
    </Tap>
  );
}

/** No challenges yet: what the game is, in one picture, and the button. */
function StartCard() {
  const { c } = useTheme();
  return (
    <Card style={{ gap: space.xl }}>
      <View style={styles.startTop}>
        <View style={[styles.trophy, { backgroundColor: c.goodSoft }]}>
          <Icon name="trophy" size={22} color={c.good} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline">Eat what fits</T>
          <T variant="caption" tone="secondary">
            Order what fits you. Best score wins.
          </T>
        </View>
      </View>
      <FitLegend />
      <Button label="New challenge" icon="plus" onPress={() => router.push('/challenge/new')} />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xl, minHeight: 36 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  logo: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  preview: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.chip },
  lead: { alignItems: 'center', gap: space.xl, paddingVertical: space.xxxl, paddingHorizontal: space.xl, borderRadius: radius.card },
  leadIcon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingHorizontal: space.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  startTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  trophy: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});

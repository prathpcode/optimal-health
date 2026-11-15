import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChallengeRow, FitLegend } from '@/components/challenge';
import { RoomIcon, RoomRow } from '@/components/community';
import { GlassButton, GlassSurface } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { GlassAction, RoomStatus, SectionTitle } from '@/components/together';
import { Skeleton } from '@/components/ui';
import { useTogether, useTopRoom } from '@/lib/community';
import { signInWithWhop, signOutOfWhop, useWhopAccount } from '@/lib/whop';
import { enterAt, gutter, radius, space, useTheme } from '@/theme';

export default function TogetherScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = Platform.OS === 'ios' ? insets.bottom : 0;
  const { ready, account } = useWhopAccount();

  const accountMenu = () =>
    Alert.alert(account ? `@${account.username}` : 'Whop', 'Signed in with Whop', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOutOfWhop() },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingTop: insets.top + space.md, paddingHorizontal: gutter, paddingBottom: bottom + 62 + space.huge }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <T variant="heroBold" accessibilityRole="header">
            Together
          </T>
          {account ? <GlassButton tone="theme" icon="person" label="Account" onPress={accountMenu} /> : null}
        </View>
        {!ready ? null : account ? <SignedIn /> : <SignedOut />}
      </ScrollView>
      {ready && account ? (
        <View style={[styles.cta, { bottom: bottom + space.md }]}>
          <GlassAction label="New challenge" icon="trophy" onPress={() => router.push('/challenge/new')} />
        </View>
      ) : null}
    </View>
  );
}

function SignedOut() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const room = useTopRoom();
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    const r = await signInWithWhop();
    setBusy(false);
    if (!r.ok && !r.cancelled) Alert.alert('Couldn’t sign in', r.message ?? 'Try again in a moment.');
  };

  return (
    <Animated.View entering={enterAt(0, reduced)} style={{ gap: space.xxl, minHeight: 420 + insets.top }}>
      <T variant="hero">
        Eat healthier with people <T variant="heroBold">like you</T>
      </T>
      {room ? (
        <GlassSurface tone="theme" style={styles.lead}>
          <RoomIcon icon={room.icon} slug={room.slug} />
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="headline">{room.title}</T>
            <T variant="caption" tone="secondary">
              {room.reasons[0] ? `Your room for ${room.reasons[0].toLowerCase()}` : 'Your room'}
            </T>
          </View>
        </GlassSurface>
      ) : null}
      <View style={{ gap: space.md }}>
        <GlassAction label="Continue with Whop" onPress={signIn} loading={busy} />
        <View style={styles.privacy}>
          <Icon name="lock" size={12} color={c.textTertiary} />
          <T variant="caption" tone="tertiary">
            Your profile, medicines and scans stay private.
          </T>
        </View>
      </View>
    </Animated.View>
  );
}

function SignedIn() {
  const { c } = useTheme();
  const { mine, challenges, loading } = useTogether();
  const reduced = useReducedMotion();

  if (loading) {
    return (
      <View style={{ gap: space.sm + 2 }}>
        <Skeleton width="100%" height={76} />
        <Skeleton width="100%" height={76} />
      </View>
    );
  }

  return (
    <View style={{ gap: space.xxxl }}>
      <Animated.View entering={enterAt(0, reduced)}>
        <SectionTitle title="Your rooms" />
        <View style={{ gap: space.sm + 2 }}>
          {mine.map((r) => (
            <RoomRow key={r.slug} room={r} detail={<RoomStatus room={r} />} />
          ))}
          <Tap accessibilityRole="button" accessibilityLabel="More rooms" onPress={() => router.push('/rooms')} scaleTo={0.98}>
            <View style={[styles.more, { borderColor: c.hairline }]}>
              <Icon name="plus" size={16} color={c.textSecondary} weight="bold" />
              <T variant="bodyStrong" tone="secondary">
                More rooms
              </T>
            </View>
          </Tap>
        </View>
      </Animated.View>

      <Animated.View entering={enterAt(1, reduced)}>
        <SectionTitle title="Challenges" />
        {challenges.length ? (
          <View style={{ gap: space.sm + 2 }}>
            {challenges.map((ch) => (
              <ChallengeRow key={ch.id} ch={ch} />
            ))}
          </View>
        ) : (
          <GlassSurface tone="theme" style={styles.empty}>
            <T variant="headline">Eat what fits, with friends</T>
            <T variant="caption" tone="secondary">
              Log what you order. Highest fit % wins.
            </T>
            <FitLegend />
          </GlassSurface>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xxl, minHeight: 44 },
  lead: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingRight: space.lg, borderRadius: radius.card },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, height: 52, borderRadius: radius.card, borderWidth: 1.5, borderStyle: 'dashed' },
  empty: { borderRadius: radius.card, padding: space.lg, gap: space.sm },
  cta: { position: 'absolute', left: gutter, right: gutter },
});

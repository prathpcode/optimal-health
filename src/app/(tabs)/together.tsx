import { router } from 'expo-router';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChallengeRow, PointsKey } from '@/components/challenge';
import { RoomRow } from '@/components/community';
import { GlassButton, GlassSurface } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { GlassAction, RoomStatus, SectionTitle, useSignedIn } from '@/components/together';
import { Skeleton } from '@/components/ui';
import { useTogether } from '@/lib/community';
import { useLatestPosts } from '@/lib/whopForum';
import { PostCard } from '@/components/post';
import { signOutOfWhop, useWhopAccount } from '@/lib/whop';
import { enterAt, gutter, radius, space, titleTop, topBar, useTheme } from '@/theme';

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
        contentContainerStyle={{ paddingTop: insets.top + titleTop, paddingHorizontal: gutter, paddingBottom: bottom + 62 + space.huge }}
        showsVerticalScrollIndicator={false}>
        <T variant="heroBold" accessibilityRole="header" style={styles.title}>
          Together
        </T>
        {!ready ? null : account ? <SignedIn /> : <SignedOut />}
      </ScrollView>
      {account ? (
        <View style={{ position: 'absolute', top: insets.top + topBar, right: gutter }}>
          <GlassButton tone="theme" icon="person" label="Account" onPress={accountMenu} />
        </View>
      ) : null}
      {ready && account ? (
        <View style={[styles.cta, { bottom: bottom + space.md }]}>
          <GlassAction label="New challenge" icon="trophy" onPress={() => router.push('/challenge/new')} />
        </View>
      ) : null}
    </View>
  );
}

/** Signed out: everything is visible, and tapping anything asks you to sign in with Whop, then opens it. */
function SignedOut() {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const { all, matched } = useTogether();
  const signedIn = useSignedIn();
  const rooms = [...matched, ...all.filter((r) => !matched.some((m) => m.slug === r.slug))];
  const open = (slug: string) => signedIn(() => router.push({ pathname: '/community/[slug]', params: { slug } }));

  return (
    <View style={{ gap: space.xxxl }}>
      <Animated.View entering={enterAt(0, reduced)}>
        <T variant="hero" style={styles.lede}>
          Eat healthier with people <T variant="heroBold">like you</T> 🍽️
        </T>
      </Animated.View>

      <Animated.View entering={enterAt(1, reduced)}>
        <SectionTitle title="Rooms" />
        <View style={{ gap: space.sm + 2 }}>
          {rooms.map((r) => (
            <RoomRow key={r.slug} room={r} detail={<RoomStatus room={r} />} onPress={() => open(r.slug)} />
          ))}
        </View>
        <View style={[styles.privacy, { marginTop: space.lg }]}>
          <Icon name="lock" size={12} color={c.textTertiary} />
          <T variant="caption" tone="tertiary">
            Tap a room to sign in with Whop. Your profile stays private.
          </T>
        </View>
      </Animated.View>

      <Animated.View entering={enterAt(2, reduced)}>
        <SectionTitle title="Challenges" />
        <Tap accessibilityRole="button" accessibilityLabel="Start a challenge" onPress={() => signedIn(() => router.push('/challenge/new'))} scaleTo={0.98}>
          <GlassSurface tone="theme" interactive style={styles.empty}>
            <T variant="headline">Race your friends</T>
            <T variant="caption" tone="secondary">
              Every dish you order scores by how well it fits you. Most points wins.
            </T>
            <PointsKey />
          </GlassSurface>
        </Tap>
      </Animated.View>
    </View>
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
      <LatestPosts slugs={mine.map((r) => r.slug)} />

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
            <T variant="headline">Race your friends</T>
            <T variant="caption" tone="secondary">
              Every dish you order scores by how well it fits you. Most points wins.
            </T>
            <PointsKey />
          </GlassSurface>
        )}
      </Animated.View>
    </View>
  );
}

/** The newest real posts from your rooms on Whop. Hidden until there are some; never filled in. */
function LatestPosts({ slugs }: { slugs: string[] }) {
  const { items } = useLatestPosts(slugs, 5);
  const reduced = useReducedMotion();
  if (!items.length) return null;
  return (
    <Animated.View entering={enterAt(0, reduced)}>
      <SectionTitle title="Latest" />
      <View style={{ gap: space.md }}>
        {items.map((p) => (
          <PostCard key={p.id} post={p} slug={p.room} />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  title: { textAlign: 'center', marginBottom: space.xxl },
  lede: { textAlign: 'center' },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, height: 52, borderRadius: radius.card, borderWidth: 1.5, borderStyle: 'dashed' },
  empty: { borderRadius: radius.card, padding: space.lg, gap: space.sm },
  cta: { position: 'absolute', left: gutter, right: gutter },
});

import { router } from 'expo-router';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChallengeRow, PointsKey } from '@/components/challenge';
import { RoomIcon } from '@/components/community';
import { JoinBar, joinRooms, RoomChecklist, usePickedRooms } from '@/components/RoomPicker';
import { GlassButton, GlassSurface } from '@/components/Glass';
import { Icon, type IconName } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { RoomStatus, SectionTitle, useSignedIn } from '@/components/together';
import { Skeleton } from '@/components/ui';
import { useTogether, type RoomView } from '@/lib/community';
import { useLatestPosts } from '@/lib/whopForum';
import { PostCard } from '@/components/post';
import { signOutOfWhop, useWhopAccount } from '@/lib/whop';
import { enterAt, gutter, radius, shadow, space, titleTop, topBar, useTheme } from '@/theme';

export default function TogetherScreen() {
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = Platform.OS === 'ios' ? insets.bottom : 0;
  const { ready, account } = useWhopAccount();
  const together = useTogether();
  const signedIn = useSignedIn();
  const { all, mine } = together;
  // The rooms you can tick on this page: signed out, every room (matches first); signed in with no rooms, the same;
  // otherwise any matching room you're not in yet.
  const recommended = (r: RoomView) => r.reasons.length > 0;
  const pickable = (!account || !mine.length ? all.filter((r) => !account || !r.joined) : all.filter((r) => recommended(r) && !r.joined))
    // Recommended rooms (matching an allergy, condition or diet) first, best match first.
    .sort((a, b) => b.reasons.length - a.reasons.length);
  const pick = usePickedRooms(pickable, pickable.filter(recommended).map((r) => r.slug));

  const accountMenu = () =>
    Alert.alert(account ? `@${account.username}` : 'Whop', 'Signed in with Whop', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOutOfWhop() },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingTop: insets.top + titleTop, paddingHorizontal: gutter, paddingBottom: bottom + space.huge + 62 }}
        showsVerticalScrollIndicator={false}>
        {account ? (
          <T variant="heroBold" accessibilityRole="header" style={styles.title}>
            Together
          </T>
        ) : null}
        {!ready ? null : account ? <SignedIn pickable={pickable} pick={pick} /> : <SignedOut pickable={pickable} pick={pick} />}
      </ScrollView>
      {account ? (
        <View style={{ position: 'absolute', top: insets.top + topBar, right: gutter }}>
          <GlassButton tone="theme" icon="person" label="Account" onPress={accountMenu} />
        </View>
      ) : null}
      {account && mine.length && !pick.picked.length ? (
        <Tap
          accessibilityRole="button"
          accessibilityLabel="Make a post"
          feedback="tap"
          scaleTo={0.9}
          onPress={() => router.push({ pathname: '/compose/[slug]', params: { slug: mine[0].slug } })}
          style={[styles.fab, { backgroundColor: c.primary, bottom: bottom + space.md }, shadow('floating', dark)]}>
          <Icon name="plus" size={26} color={c.onPrimary} weight="bold" />
        </Tap>
      ) : null}
      {ready ? (
        <JoinBar
          picked={pick.picked}
          hideWhenEmpty
          verb={account ? 'Join' : 'Sign in and join'}
          bottom={bottom + space.md}
          onJoin={(slugs) =>
            signedIn(async () => {
              await joinRooms(slugs);
            })
          }
        />
      ) : null}
    </View>
  );
}

/** Signed out: everything is visible, and tapping anything asks you to sign in with Whop, then opens it. */
type Pick = ReturnType<typeof usePickedRooms>;

function SignedOut({ pickable, pick }: { pickable: RoomView[]; pick: Pick }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const signedIn = useSignedIn();

  return (
    <View style={{ gap: space.xxxl }}>
      <Animated.View entering={enterAt(0, reduced)}>
        <T variant="hero" style={styles.lede}>
          Eat healthier with people <T variant="heroBold">like you</T> 🍽️
        </T>
      </Animated.View>

      <Animated.View entering={enterAt(1, reduced)}>
        <SectionTitle title="Pick your rooms" />
        <RoomChecklist rooms={pickable} picked={pick.picked} onToggle={pick.toggle} />
      </Animated.View>

      <Animated.View entering={enterAt(2, reduced)}>
        <SectionTitle title="Challenges" />
        <Tap accessibilityRole="button" accessibilityLabel="Start a challenge" onPress={() => signedIn(() => router.push('/challenge/new'))} scaleTo={0.98}>
          <GlassSurface tone="theme" interactive style={styles.empty}>
            <T variant="headline">Race your friends</T>
            <T variant="caption" tone="secondary">
              Compete with your friends and see who can eat the healthiest!
            </T>
            <PointsKey />
          </GlassSurface>
        </Tap>
      </Animated.View>
    </View>
  );
}

/**
 * Signed in, in the order people use it: the two things you can do, your rooms, what people shared, your races.
 */
function SignedIn({ pickable, pick }: { pickable: RoomView[]; pick: Pick }) {
  const { c } = useTheme();
  const { mine, challenges, loading } = useTogether();
  const reduced = useReducedMotion();
  const top = mine[0]?.slug;

  if (loading) {
    return (
      <View style={{ gap: space.sm + 2 }}>
        <Skeleton width="100%" height={96} />
        <Skeleton width="100%" height={76} />
      </View>
    );
  }

  return (
    <View style={{ gap: space.xxxl }}>
      <Animated.View entering={enterAt(0, reduced)} style={styles.actions}>
        {top ? <BigAction icon="fork" label="Share a meal" onPress={() => router.push({ pathname: '/compose/[slug]', params: { slug: top } })} /> : null}
        <BigAction icon="trophy" label="Start a race" onPress={() => router.push('/challenge/new')} />
      </Animated.View>

      {mine.length ? (
        <Animated.View entering={enterAt(1, reduced)}>
          <SectionTitle title="Your rooms" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roomStrip} style={styles.stripBleed}>
            {mine.map((r) => (
              <Tap key={r.slug} accessibilityRole="button" accessibilityLabel={r.title} scaleTo={0.96} onPress={() => router.push({ pathname: '/community/[slug]', params: { slug: r.slug } })}>
                <GlassSurface tone="theme" interactive style={styles.roomChip}>
                  <RoomIcon icon={r.icon} slug={r.slug} size={32} />
                  <View>
                    <T variant="bodyStrong" numberOfLines={1}>
                      {r.title}
                    </T>
                    <RoomStatus room={r} />
                  </View>
                </GlassSurface>
              </Tap>
            ))}
            <Tap accessibilityRole="button" accessibilityLabel="Find more rooms" scaleTo={0.96} onPress={() => router.push('/rooms')}>
              <View style={[styles.moreChip, { borderColor: c.hairline }]}>
                <Icon name="plus" size={16} color={c.textSecondary} weight="bold" />
                <T variant="bodyStrong" tone="secondary">
                  More
                </T>
              </View>
            </Tap>
          </ScrollView>
        </Animated.View>
      ) : null}

      {pickable.length ? (
        <Animated.View entering={enterAt(2, reduced)}>
          <SectionTitle title={mine.length ? 'Rooms for you' : 'Pick your rooms'} />
          <RoomChecklist rooms={pickable} picked={pick.picked} onToggle={pick.toggle} />
        </Animated.View>
      ) : null}

      <LatestPosts slugs={mine.map((r) => r.slug)} />

      {challenges.length ? (
        <Animated.View entering={enterAt(3, reduced)}>
          <SectionTitle title="Your races" />
          <View style={{ gap: space.sm + 2 }}>
            {challenges.map((ch) => (
              <ChallengeRow key={ch.id} ch={ch} />
            ))}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** One of the page's two main actions: a big glass tile with an icon and a word or two. */
function BigAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} feedback="tap" scaleTo={0.96} onPress={onPress} style={{ flex: 1 }}>
      <GlassSurface tone="theme" interactive style={styles.bigAction}>
        <View style={[styles.bigIcon, { backgroundColor: c.primary }]}>
          <Icon name={icon} size={20} color={c.onPrimary} />
        </View>
        <T variant="heading">{label}</T>
      </GlassSurface>
    </Tap>
  );
}

/** The newest real posts from your rooms on Whop. Hidden until there are some; never filled in. */
function LatestPosts({ slugs }: { slugs: string[] }) {
  const { items, loaded } = useLatestPosts(slugs, 5);
  const reduced = useReducedMotion();
  if (!loaded || !items.length) return null;
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
  fab: { position: 'absolute', right: gutter, width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: space.sm + 2 },
  bigAction: { borderRadius: radius.card, padding: space.lg, gap: space.md, minHeight: 112, justifyContent: 'space-between' },
  bigIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stripBleed: { marginHorizontal: -gutter },
  roomStrip: { paddingHorizontal: gutter, gap: space.sm },
  roomChip: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2, paddingVertical: space.sm + 2, paddingLeft: space.sm + 2, paddingRight: space.lg, borderRadius: radius.chip },
  moreChip: { flexDirection: 'row', alignItems: 'center', gap: space.xs, height: 52, paddingHorizontal: space.lg, borderRadius: radius.chip, borderWidth: 1.5, borderStyle: 'dashed' },
  title: { textAlign: 'center', marginBottom: space.xxl },
  lede: { textAlign: 'center' },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  empty: { borderRadius: radius.card, padding: space.lg, gap: space.sm },
});

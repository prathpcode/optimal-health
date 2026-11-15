import { router } from 'expo-router';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChallengeRow, FitLegend } from '@/components/challenge';
import { RoomIcon, RoomRow } from '@/components/community';
import { GlassButton, GlassSurface } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { GlassAction, REACTION_LABEL, RoomStatus, SectionTitle, useSignedIn } from '@/components/together';
import { Skeleton } from '@/components/ui';
import { useTogether, type SharedDish } from '@/lib/community';
import { dishEmoji, REACTION_EMOJI } from '@/lib/emoji';
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

/** Examples of what people share, shown before signing in. Labelled as examples; they are not real posts. */
const EXAMPLES: { room: string; dish: SharedDish; note: string }[] = [
  { room: 'heart-health', dish: { name: 'Grilled salmon bowl', reaction: 'loved' }, note: 'Asked for the sauce on the side. Still full of flavour.' },
  { room: 'gluten-free', dish: { name: 'Corn tortilla tacos', reaction: 'loved' }, note: 'They fry the chips separately, so no cross-contact.' },
  { room: 'diabetes', dish: { name: 'Burrito bowl, no rice', reaction: 'okay' }, note: 'Swapped the rice for extra beans and fajita veg.' },
];

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
          Eat healthier with people <T variant="heroBold">like you</T>
        </T>
      </Animated.View>

      <Animated.View entering={enterAt(1, reduced)}>
        <SectionTitle title="What people share" />
        <View style={{ gap: space.sm + 2 }}>
          {EXAMPLES.map((ex) => {
            const room = all.find((r) => r.slug === ex.room)!;
            return (
              <Tap key={ex.dish.name} accessibilityRole="button" accessibilityLabel={`Example post in ${room.title}: ${ex.dish.name}`} onPress={() => open(ex.room)} scaleTo={0.98}>
                <GlassSurface tone="theme" interactive style={styles.example}>
                  <View style={styles.exampleTop}>
                    <RoomIcon icon={room.icon} slug={room.slug} size={28} />
                    <T variant="caption" tone="secondary" style={{ flex: 1 }} numberOfLines={1}>
                      {room.title}
                    </T>
                    <View style={[styles.examplePill, { backgroundColor: c.cardMuted }]}>
                      <T variant="caption" tone="tertiary">
                        Example
                      </T>
                    </View>
                  </View>
                  <View style={styles.exampleDish}>
                    <T style={styles.exampleEmoji}>{dishEmoji(ex.dish.name)}</T>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T variant="headline">{ex.dish.name}</T>
                      <T variant="caption" tone="secondary">
                        {REACTION_EMOJI[ex.dish.reaction]} {REACTION_LABEL[ex.dish.reaction]}
                      </T>
                    </View>
                  </View>
                  <T tone="secondary" numberOfLines={2}>
                    {ex.note}
                  </T>
                </GlassSurface>
              </Tap>
            );
          })}
        </View>
      </Animated.View>

      <Animated.View entering={enterAt(2, reduced)}>
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
  title: { textAlign: 'center', marginBottom: space.xxl },
  lede: { textAlign: 'center' },
  example: { borderRadius: radius.card, padding: space.lg, gap: space.md },
  exampleTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  examplePill: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.chip },
  exampleDish: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  exampleEmoji: { fontSize: 30, lineHeight: 36 },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, height: 52, borderRadius: radius.card, borderWidth: 1.5, borderStyle: 'dashed' },
  empty: { borderRadius: radius.card, padding: space.lg, gap: space.sm },
  cta: { position: 'absolute', left: gutter, right: gutter },
});

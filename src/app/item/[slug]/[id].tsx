import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/community';
import { GlassButton } from '@/components/Glass';
import { ItemFacts } from '@/components/ItemFacts';
import { PostPhoto } from '@/components/post';
import { T } from '@/components/T';
import { REACTION_LABEL } from '@/components/together';
import { useRoom } from '@/lib/community';
import { dishEmoji, REACTION_EMOJI } from '@/lib/emoji';
import { usePost } from '@/lib/whopForum';
import { enterAt, gutter, roomAccent, space, tint, topBar, useTheme } from '@/theme';

const KIND: Record<string, string> = { dish: 'Dish', product: 'Grocery item', supplement: 'Supplement', otc: 'Over the counter' };

/**
 * A dish or product someone shared, in full: the photo, what it is and where, who shared it and how it went, then
 * the same facts as after a scan (what's in it, the numbers). Only facts about the food: never the poster's verdict,
 * reasons or rules, and nothing from the viewer's own profile either.
 */
export default function SharedItemScreen() {
  const { slug, id } = useLocalSearchParams<{ slug: string; id: string }>();
  const post = usePost(slug, id);
  const { room } = useRoom(slug);
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const bottom = Platform.OS === 'ios' ? insets.bottom : space.md;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/together'));
  const dish = post?.dish;
  const item = dish?.item;
  const accent = roomAccent[slug] ?? c.text;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: bottom + space.huge }} showsVerticalScrollIndicator={false}>
        {post?.photos[0] ? (
          <Image source={{ uri: post.photos[0].url }} style={styles.hero} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
        ) : (
          <View style={{ height: insets.top + 64 }} />
        )}

        {post && dish ? (
          <View style={{ paddingHorizontal: gutter, paddingTop: space.xl, gap: space.xxl }}>
            <Animated.View entering={enterAt(0, reduced)} style={{ gap: space.sm }}>
              <T variant="micro" tone="secondary">
                {[item ? KIND[item.kind] : 'Dish', room?.title].filter(Boolean).join(' · ')}
              </T>
              <T variant="heroBold">
                {dishEmoji(dish.name)} {dish.name}
              </T>
              {dish.place ? (
                <T variant="bodyStrong" tone="secondary">
                  {dish.place}
                </T>
              ) : null}
              {item?.description ? <T tone="secondary">{item.description}</T> : null}
            </Animated.View>

            <Animated.View entering={enterAt(1, reduced)} style={[styles.shared, { backgroundColor: tint(accent, dark ? 0.18 : 0.09) }]}>
              <Avatar name={post.author} url={post.avatarUrl} size={36} />
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="bodyStrong">
                  {post.author} · {REACTION_EMOJI[dish.reaction]} {REACTION_LABEL[dish.reaction]}
                </T>
                {post.text ? <T tone="secondary">{post.text}</T> : null}
              </View>
            </Animated.View>

            {item ? <ItemFacts ingredients={item.ingredients} nutrients={item.nutrients} at={2} /> : null}

            {post.photos.slice(1).map((p) => (
              <PostPhoto key={p.url} photo={p} />
            ))}
          </View>
        ) : (
          <View style={{ padding: gutter, gap: space.md }}>
            <T tone="secondary">{post ? 'This post isn’t a shared dish.' : 'Loading…'}</T>
          </View>
        )}
      </ScrollView>
      <View style={{ position: 'absolute', top: insets.top + topBar, left: gutter }}>
        <GlassButton tone="theme" icon="back" label="Back" onPress={back} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', aspectRatio: 1 },
  shared: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.lg, borderRadius: 16 },
});

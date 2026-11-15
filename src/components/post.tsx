import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { likePost, type Photo, type Post } from '@/lib/whopForum';
import { radius, roomAccent, space, spring, tint, useTheme } from '@/theme';
import { Avatar } from './community';
import { GlassSurface } from './Glass';
import { Icon } from './Icon';
import { T } from './T';
import { Tap } from './Tap';
import { attempt, REACTION_LABEL } from './together';

export function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** A photo at its own aspect ratio (4:3 when Whop doesn't say), rounded. */
export function PostPhoto({ photo, maxRatio = 1.25 }: { photo: Photo; maxRatio?: number }) {
  const { c } = useTheme();
  const ratio = photo.width && photo.height ? Math.min(maxRatio, photo.height / photo.width) : 0.75;
  return (
    <View style={[styles.photo, { aspectRatio: 1 / ratio, backgroundColor: c.cardMuted }]}>
      <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
    </View>
  );
}

/** A shared dish: the name, where, and how it went. Never a verdict. */
export function DishCard({ post, slug }: { post: Post; slug: string }) {
  const { c, dark } = useTheme();
  const accent = roomAccent[slug] ?? c.text;
  const dish = post.dish!;
  return (
    <View style={[styles.dish, { backgroundColor: tint(accent, dark ? 0.18 : 0.09) }]}>
      <View style={[styles.dishIcon, { backgroundColor: accent }]}>
        <Icon name="fork" size={16} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="headline" numberOfLines={2}>
          {dish.name}
        </T>
        {dish.place ? (
          <T variant="caption" tone="secondary" numberOfLines={1}>
            {dish.place}
          </T>
        ) : null}
      </View>
      <View style={[styles.reaction, { backgroundColor: dish.reaction === 'loved' ? accent : c.cardMuted }]}>
        <T variant="caption" color={dish.reaction === 'loved' ? '#FFFFFF' : c.text}>
          {REACTION_LABEL[dish.reaction]}
        </T>
      </View>
    </View>
  );
}

function Like({ post, slug }: { post: Post; slug: string }) {
  const { c } = useTheme();
  const pop = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const like = () => {
    if (post.liked || post.pending) return;
    haptic.tap();
    pop.set(withSequence(withSpring(1.35, spring.pop), withSpring(1, spring.snappy)));
    void attempt(likePost(slug, post.id));
  };
  return (
    <Tap accessibilityRole="button" accessibilityLabel={post.liked ? `Liked, ${post.likes}` : `Like, ${post.likes}`} accessibilityState={{ selected: post.liked }} onPress={like} hitSlop={8} style={styles.stat}>
      <Animated.View style={style}>
        <Icon name="heart" size={17} color={post.liked ? c.notFit : c.textSecondary} />
      </Animated.View>
      {post.likes > 0 ? (
        <T variant="caption" color={post.liked ? c.notFit : c.textSecondary}>
          {post.likes}
        </T>
      ) : null}
    </Tap>
  );
}

/** A post in a room: who, when, the words, the photos or dish, then likes and replies. */
export function PostCard({ post, slug, full }: { post: Post; slug: string; full?: boolean }) {
  const { c } = useTheme();
  const open = () => router.push({ pathname: '/post/[slug]/[id]', params: { slug, id: post.id } });
  const body = (
    <GlassSurface tone="theme" style={[styles.card, post.pending ? { opacity: 0.55 } : null]}>
      <View style={styles.author}>
        <Avatar name={post.author} url={post.avatarUrl} size={36} />
        <View style={{ flex: 1 }}>
          <T variant="bodyStrong" numberOfLines={1}>
            {post.mine ? 'You' : post.author}
          </T>
          <T variant="caption" tone="tertiary">
            {post.pending ? 'Posting…' : timeAgo(post.at)}
          </T>
        </View>
        {post.pinned ? <Icon name="note" size={14} color={c.textTertiary} /> : null}
      </View>
      {post.title ? <T variant="heading">{post.title}</T> : null}
      {post.dish ? <DishCard post={post} slug={slug} /> : null}
      {post.text ? <T numberOfLines={full ? undefined : 6}>{post.text}</T> : null}
      {post.photos.length ? (
        <View style={{ gap: space.sm }}>
          {(full ? post.photos : post.photos.slice(0, 1)).map((p, i) => (
            <PostPhoto key={i} photo={p} maxRatio={full ? 1.6 : 1.25} />
          ))}
        </View>
      ) : null}
      <View style={styles.footer}>
        <Like post={post} slug={slug} />
        <View style={styles.stat}>
          <Icon name="chat" size={16} color={c.textSecondary} />
          {post.comments > 0 ? (
            <T variant="caption" tone="secondary">
              {post.comments}
            </T>
          ) : null}
        </View>
      </View>
    </GlassSurface>
  );
  if (full || post.pending) return body;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`${post.author}: ${post.dish?.name ?? post.title ?? post.text}`} onPress={open} scaleTo={0.99}>
      {body}
    </Tap>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, padding: space.lg, gap: space.md },
  author: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  photo: { width: '100%', borderRadius: radius.md, overflow: 'hidden' },
  dish: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md },
  dishIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  reaction: { paddingHorizontal: space.sm + 2, paddingVertical: 4, borderRadius: radius.chip },
  footer: { flexDirection: 'row', gap: space.xl, marginTop: space.xs },
  stat: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, minHeight: 24 },
});

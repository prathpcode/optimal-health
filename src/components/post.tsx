import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { goBack } from '@/lib/nav';
import { deletePost, toggleLike, useLike, type Photo, type Post } from '@/lib/whopForum';
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

/** A shared dish: the name, then how it went and where. Never a verdict. `opens` adds the chevron that says it leads somewhere. */
export function DishCard({ post, slug, opens }: { post: Post; slug: string; opens?: boolean }) {
  const { c, dark } = useTheme();
  const accent = roomAccent[slug] ?? c.text;
  const dish = post.dish!;
  return (
    <View style={[styles.dish, { backgroundColor: tint(accent, dark ? 0.18 : 0.09) }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="headline" numberOfLines={2}>
          {dish.name}
        </T>
        <T variant="caption" tone="secondary" numberOfLines={1}>
          {[REACTION_LABEL[dish.reaction], dish.place].filter(Boolean).join(' · ')}
        </T>
      </View>
      {opens ? <Icon name="chevron" size={14} color={c.textTertiary} /> : null}
    </View>
  );
}

function Like({ post }: { post: Post }) {
  const { c } = useTheme();
  const { liked, likes } = useLike(post);
  const pop = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const press = () => {
    if (post.pending) return;
    haptic.tap();
    if (!liked) pop.set(withSequence(withSpring(1.35, spring.pop), withSpring(1, spring.snappy)));
    void attempt(toggleLike(post.id));
  };
  const color = liked ? c.notFit : c.textSecondary;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={liked ? `Liked, ${likes}. Tap to unlike` : `Like, ${likes}`} accessibilityState={{ selected: liked }} onPress={press} hitSlop={14} style={styles.stat}>
      <Animated.View style={style}>
        <Icon name={liked ? 'liked' : 'like'} size={17} color={color} />
      </Animated.View>
      {likes > 0 ? (
        <T variant="caption" color={color}>
          {likes}
        </T>
      ) : null}
    </Tap>
  );
}

/** The "more" button on your own post or reply: for now, Delete (after asking). `after` runs once it is gone. */
export function PostMenu({ post, slug, after }: { post: Post; slug: string; after?: () => void }) {
  const { c } = useTheme();
  if (!post.mine || post.pending) return null;
  const reply = !post.title && !post.dish && !post.photos.length && post.comments === 0;
  const ask = () =>
    Alert.alert('Delete this?', reply ? 'It will be removed for everyone.' : 'The post will be removed for everyone. Replies to it go with it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void attempt(deletePost(slug, post)).then((ok) => ok && after?.()) },
    ]);
  return (
    <Tap accessibilityRole="button" accessibilityLabel="More" onPress={ask} hitSlop={14} feedback="select" style={styles.more}>
      <Icon name="more" size={16} color={c.textTertiary} />
    </Tap>
  );
}

/** A post in a room: who, when, the words, the photos or dish, then likes and replies. */
export function PostCard({ post, slug, full }: { post: Post; slug: string; full?: boolean }) {
  const { c } = useTheme();
  const open = () => router.push({ pathname: '/post/[slug]/[id]', params: { slug, id: post.id } });
  // A shared dish or product with its facts opens in full, from its card or its photo.
  // Only on the post's own page: in a feed the whole card opens the post.
  const openItem = full && post.dish?.item && !post.pending ? () => router.push({ pathname: '/item/[slug]/[id]', params: { slug, id: post.id } }) : undefined;
  const item = (child: ReactNode) =>
    openItem ? (
      <Tap accessibilityRole="button" accessibilityLabel={`Open ${post.dish!.name}`} scaleTo={0.98} onPress={openItem}>
        {child}
      </Tap>
    ) : (
      child
    );
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
        {post.pinned ? <Icon name="pin" size={13} color={c.textTertiary} /> : null}
        <PostMenu post={post} slug={slug} after={full ? goBack : undefined} />
      </View>
      {post.title ? <T variant="heading">{post.title}</T> : null}
      {post.dish ? item(<DishCard post={post} slug={slug} opens={Boolean(openItem)} />) : null}
      {post.text ? <T numberOfLines={full ? undefined : 6}>{post.text}</T> : null}
      {post.photos.length ? (
        <View style={{ gap: space.sm }}>
          {(full ? post.photos : post.photos.slice(0, 1)).map((p, i) => (
            <View key={i}>{item(<PostPhoto photo={p} maxRatio={full ? 1.6 : 1.25} />)}</View>
          ))}
        </View>
      ) : null}
      <View style={styles.footer}>
        <Like post={post} />
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
  dish: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.md },
  footer: { flexDirection: 'row', gap: space.xl, marginTop: space.xs },
  more: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, minHeight: 24 },
});

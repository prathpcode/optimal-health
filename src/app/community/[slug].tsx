import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoomIcon } from '@/components/community';
import { GlassButton } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { PostCard } from '@/components/post';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { attempt, GlassAction, GlassTabs, RoomStatus } from '@/components/together';
import { joinRoom, leaveRoom, useRoom, type RoomView } from '@/lib/community';
import { goBack } from '@/lib/nav';
import { useWhopAccount } from '@/lib/whop';
import { useRoomFeed, useRoomPhotos } from '@/lib/whopForum';
import { enterAt, gutter, radius, roomAccent, space, tint, useTheme } from '@/theme';

type Tab = 'posts' | 'photos';

export default function RoomScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { room } = useRoom(slug);
  const { account } = useWhopAccount();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('posts');
  if (!room) return null;

  const options = () =>
    Alert.alert(room.title, undefined, [
      { text: 'Cancel', style: 'cancel' },
      room.joined
        ? { text: 'Leave room', style: 'destructive', onPress: async () => void ((await attempt(leaveRoom(room.slug))) && goBack()) }
        : { text: 'Add to my rooms', onPress: () => void attempt(joinRoom(room.slug)) },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: gutter, gap: space.lg, paddingBottom: space.md }}>
        <View style={styles.topBar}>
          <GlassButton tone="theme" icon="back" label="Back" onPress={goBack} />
          <GlassButton tone="theme" icon="more" label="Room options" onPress={options} />
        </View>
        <View style={styles.titleRow}>
          <RoomIcon icon={room.icon} slug={room.slug} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="heroBold" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 28, lineHeight: 34 }}>
              {room.title}
            </T>
            <RoomStatus room={room} />
          </View>
        </View>
        <GlassTabs<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'posts', label: 'Posts' },
            { value: 'photos', label: 'Photos' },
          ]}
        />
      </View>
      {!account ? <SignedOut /> : tab === 'posts' ? <Posts room={room} /> : <Photos room={room} />}
    </View>
  );
}

function SignedOut() {
  return (
    <View style={styles.center}>
      <T variant="heading" style={{ textAlign: 'center' }}>
        Sign in to see posts
      </T>
      <T tone="secondary" style={{ textAlign: 'center' }}>
        Rooms live on Whop.
      </T>
      <View style={{ alignSelf: 'stretch', marginTop: space.lg }}>
        <GlassAction label="Go to Together" onPress={() => router.navigate('/together')} />
      </View>
    </View>
  );
}

function EmptyRoom({ room, photos }: { room: RoomView; photos?: boolean }) {
  const { c, dark } = useTheme();
  const accent = roomAccent[room.slug] ?? c.text;
  const who = room.reasons[0] ? `people with ${room.reasons[0].toLowerCase()}` : `the ${room.title} room`;
  return (
    <View style={styles.center}>
      <View style={[styles.emptyIcon, { backgroundColor: tint(accent, dark ? 0.22 : 0.12) }]}>
        <Icon name={photos ? 'photos' : 'fork'} size={26} color={accent} />
      </View>
      <T variant="heading" style={{ textAlign: 'center' }}>
        {photos ? 'No photos yet' : `Be the first to share a meal with ${who}`}
      </T>
      {photos ? (
        <T tone="secondary" style={{ textAlign: 'center' }}>
          Photos people post show up here.
        </T>
      ) : null}
    </View>
  );
}

function Posts({ room }: { room: RoomView }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { items, loaded, error } = useRoomFeed(room.slug);

  return (
    <View style={{ flex: 1 }}>
      {!loaded ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.textSecondary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          renderItem={({ item, index }) => (
            <Animated.View entering={enterAt(index, reduced)}>
              <PostCard post={item} slug={room.slug} />
            </Animated.View>
          )}
          ItemSeparatorComponent={Gap}
          ListHeaderComponent={
            error ? (
              <T variant="caption" tone="secondary" style={{ textAlign: 'center', marginBottom: space.md }}>
                Couldn’t reach Whop. Retrying…
              </T>
            ) : undefined
          }
          ListEmptyComponent={<EmptyRoom room={room} />}
          contentContainerStyle={[{ paddingHorizontal: gutter, paddingTop: space.sm, paddingBottom: insets.bottom + 62 + space.xxxl }, items.length ? null : { flexGrow: 1 }]}
          showsVerticalScrollIndicator={false}
        />
      )}
      <View style={[styles.cta, { bottom: insets.bottom + space.md }]}>
        <GlassAction label="New post" icon="plus" onPress={() => router.push({ pathname: '/compose/[slug]', params: { slug: room.slug } })} />
      </View>
    </View>
  );
}

function Gap() {
  return <View style={{ height: space.md }} />;
}

function SmallGap() {
  return <View style={{ height: space.sm }} />;
}

/** The inspiration board: every photo people shared, two to a row. Tap one to open its post. */
function Photos({ room }: { room: RoomView }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const photos = useRoomPhotos(room.slug);
  const size = (width - gutter * 2 - space.sm) / 2;
  return (
    <FlatList
      data={photos}
      numColumns={2}
      keyExtractor={(p, i) => `${p.post.id}_${i}`}
      columnWrapperStyle={{ gap: space.sm }}
      ItemSeparatorComponent={SmallGap}
      renderItem={({ item }) => (
        <Tap
          accessibilityRole="button"
          accessibilityLabel={item.post.dish?.name ?? item.post.title ?? `Photo from ${item.post.author}`}
          scaleTo={0.97}
          onPress={() => router.push({ pathname: '/post/[slug]/[id]', params: { slug: room.slug, id: item.post.id } })}>
          <View style={[styles.tile, { width: size, height: size * 1.2 }]}>
            <Image source={{ uri: item.photo.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
            <View style={styles.tileLabel}>
              <T variant="caption" color="#FFFFFF" numberOfLines={1}>
                {item.post.dish?.name ?? item.post.title ?? item.post.author}
              </T>
            </View>
          </View>
        </Tap>
      )}
      ListEmptyComponent={<EmptyRoom room={room} photos />}
      contentContainerStyle={[{ paddingHorizontal: gutter, paddingTop: space.sm, paddingBottom: insets.bottom + space.xxxl }, photos.length ? null : { flexGrow: 1 }]}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: gutter, paddingBottom: space.huge },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  cta: { position: 'absolute', left: gutter, right: gutter },
  tile: { borderRadius: radius.md, overflow: 'hidden' },
  tileLabel: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.sm + 2, paddingVertical: space.sm, backgroundColor: 'rgba(0,0,0,0.35)' },
});

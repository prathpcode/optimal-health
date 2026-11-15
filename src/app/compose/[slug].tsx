import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoomIcon } from '@/components/community';
import { GlassButton } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { GlassAction, pickPhoto, postWithWhop } from '@/components/together';
import { createPost, useRoom } from '@/lib/community';
import { radius, space, type as typeScale, useTheme } from '@/theme';

/** Write a post for a room: an optional title, words, and a photo of your meal. */
export default function ComposeSheet() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { room } = useRoom(slug);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = Boolean(text.trim() || photo);

  const post = async () => {
    setBusy(true);
    const ok = await postWithWhop(() => createPost(slug, { title: title.trim() || undefined, text, photoUri: photo ?? undefined }));
    setBusy(false);
    if (ok) router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.xxxl, gap: space.xl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.head}>
        {room ? <RoomIcon icon={room.icon} slug={room.slug} size={36} /> : null}
        <T variant="heading" style={{ flex: 1 }} numberOfLines={1}>
          {room?.title ?? 'New post'}
        </T>
      </View>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Title (optional)"
        placeholderTextColor={c.textTertiary}
        style={[typeScale.heading, styles.title, { color: c.text }]}
        maxLength={120}
        accessibilityLabel="Title"
      />
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="What did you eat? What worked?"
        placeholderTextColor={c.textTertiary}
        style={[typeScale.body, styles.body, { color: c.text, backgroundColor: c.cardMuted }]}
        multiline
        maxLength={2000}
        autoFocus
        accessibilityLabel="Post"
      />
      {photo ? (
        <View style={styles.photo}>
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.remove}>
            <GlassButton icon="close" label="Remove photo" size={36} onPress={() => setPhoto(null)} />
          </View>
        </View>
      ) : (
        <Tap accessibilityRole="button" accessibilityLabel="Add a photo of your meal" feedback="tap" onPress={async () => setPhoto((await pickPhoto()) ?? photo)} scaleTo={0.98}>
          <View style={[styles.add, { borderColor: c.hairline }]}>
            <Icon name="camera" size={18} color={c.textSecondary} />
            <T variant="bodyStrong" tone="secondary">
              Add a photo of your meal
            </T>
          </View>
        </Tap>
      )}
      <GlassAction label="Post" icon="send" onPress={post} loading={busy} disabled={!ready} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { paddingVertical: space.xs },
  body: { minHeight: 120, maxHeight: 240, borderRadius: radius.md, padding: space.lg, textAlignVertical: 'top' },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, overflow: 'hidden' },
  remove: { position: 'absolute', top: space.sm, right: space.sm },
  add: { height: 56, borderRadius: radius.card, borderWidth: 1.5, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
});

import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/community';
import { GlassButton, GlassSurface } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { PostCard, timeAgo } from '@/components/post';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { postWithWhop } from '@/components/together';
import { reply } from '@/lib/community';
import { goBack } from '@/lib/nav';
import { useComments, usePost, type Post } from '@/lib/whopForum';
import { gutter, radius, space, type as typeScale, useTheme } from '@/theme';

/** One post in full, its replies, and a reply box at the bottom. */
export default function PostScreen() {
  const { slug, id } = useLocalSearchParams<{ slug: string; id: string }>();
  const post = usePost(slug, id);
  const { items: comments, loaded } = useComments(slug, id);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const ok = await postWithWhop(() => reply(slug, id, text));
    if (!ok) setDraft(text);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: gutter, paddingBottom: space.md }}>
        <View style={{ alignSelf: 'flex-start' }}>
          <GlassButton tone="theme" icon="back" label="Back" onPress={goBack} />
        </View>
      </View>
      <FlatList
        data={comments}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <View style={{ gap: space.xl, marginBottom: space.lg }}>
            {post ? <PostCard post={post} slug={slug} full /> : <ActivityIndicator color={c.textSecondary} />}
            <T variant="heading">{comments.length ? `${comments.length} ${comments.length === 1 ? 'reply' : 'replies'}` : loaded ? 'No replies yet' : 'Replies'}</T>
          </View>
        }
        renderItem={({ item }) => <Comment p={item} />}
        ItemSeparatorComponent={Gap}
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: space.xl }}
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      />
      <View style={[styles.composerWrap, { paddingBottom: insets.bottom + space.sm }]}>
        <GlassSurface tone="theme" style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Reply"
            placeholderTextColor={c.textTertiary}
            style={[typeScale.body, styles.input, { color: c.text }]}
            multiline
            maxLength={1000}
            accessibilityLabel="Reply"
          />
          <Tap accessibilityRole="button" accessibilityLabel="Send reply" feedback="tap" disabled={!draft.trim()} onPress={() => void send()} style={[styles.send, { backgroundColor: c.primary }]}>
            <Icon name="send" size={16} color={c.onPrimary} weight="bold" />
          </Tap>
        </GlassSurface>
      </View>
    </KeyboardAvoidingView>
  );
}

function Gap() {
  return <View style={{ height: space.md }} />;
}

function Comment({ p }: { p: Post }) {
  return (
    <View style={[styles.comment, p.pending ? { opacity: 0.55 } : null]}>
      <Avatar name={p.author} url={p.avatarUrl} size={30} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.meta}>
          <T variant="bodyStrong">{p.mine ? 'You' : p.author}</T>
          <T variant="caption" tone="tertiary">
            {p.pending ? 'Sending…' : timeAgo(p.at)}
          </T>
        </View>
        <T>{p.text}</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composerWrap: { paddingHorizontal: gutter, paddingTop: space.sm },
  composer: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: radius.card, paddingLeft: space.lg, padding: 6, gap: space.sm },
  input: { flex: 1, maxHeight: 120, paddingTop: 8, paddingBottom: 8 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  comment: { flexDirection: 'row', gap: space.md },
  meta: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
});

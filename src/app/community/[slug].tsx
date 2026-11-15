import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, BackButton, RoomIcon } from '@/components/community';
import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { attempt, REACTION_LABEL, RoomStatus } from '@/components/together';
import { Button } from '@/components/ui';
import { leaveRoom, sendMessage, useRoom, type Message, type RoomView } from '@/lib/community';
import { useWhopAccount } from '@/lib/whop';
import { gutter, radius, roomAccent, space, tint, type as typeScale, useTheme } from '@/theme';

export default function RoomScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { room, messages } = useRoom(slug);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  if (!room) return null;

  const more = () =>
    Alert.alert(room.title, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave room',
        style: 'destructive',
        onPress: async () => {
          if (await attempt(leaveRoom(room.slug))) router.back();
        },
      },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: gutter, gap: space.lg, paddingBottom: space.md }}>
        <View style={styles.topBar}>
          <BackButton />
          {room.joined ? (
            <Tap accessibilityRole="button" accessibilityLabel="Room options" onPress={more} hitSlop={8} style={styles.moreBtn}>
              <Icon name="more" size={20} color={c.textSecondary} />
            </Tap>
          ) : null}
        </View>
        <View style={styles.titleRow}>
          <RoomIcon icon={room.icon} slug={room.slug} size={52} />
          <View style={{ flex: 1, gap: 4 }}>
            <T variant="title" numberOfLines={1}>
              {room.title}
            </T>
            <RoomStatus room={room} />
          </View>
        </View>
      </View>
      <Chat room={room} messages={messages} />
    </KeyboardAvoidingView>
  );
}

function Chat({ room, messages }: { room: RoomView; messages: Message[] }) {
  const { slug, title, joined } = room;
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { account } = useWhopAccount();
  const [draft, setDraft] = useState('');
  const rows = [...messages].reverse();

  const send = () => {
    void attempt(sendMessage(slug, draft));
    setDraft('');
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        inverted
        data={rows}
        keyExtractor={(m) => m.id}
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const older = rows[index + 1];
          const first = !older || older.author !== item.author || item.at - older.at > 10 * 60_000;
          return <Bubble m={item} first={first} slug={slug} />;
        }}
        ListEmptyComponent={<EmptyRoom room={room} />}
        contentContainerStyle={rows.length ? { paddingHorizontal: gutter, paddingVertical: space.lg } : { flexGrow: 1, paddingHorizontal: gutter }}
      />
      <View style={[styles.composerWrap, { paddingBottom: insets.bottom + space.sm, borderTopColor: c.hairline, backgroundColor: c.bg }]}>
        {joined ? (
          <View style={[styles.composer, { backgroundColor: c.card, borderColor: c.hairline }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={`Message ${title}`}
              placeholderTextColor={c.textTertiary}
              style={[typeScale.body, styles.input, { color: c.text }]}
              multiline
              maxLength={1000}
              accessibilityLabel="Message"
            />
            <Tap accessibilityRole="button" accessibilityLabel="Send" feedback="tap" disabled={!draft.trim()} onPress={send} style={[styles.send, { backgroundColor: c.primary }]}>
              <Icon name="send" size={16} color={c.onPrimary} weight="bold" />
            </Tap>
          </View>
        ) : (
          <Button label="Join to chat" onPress={() => router.push({ pathname: '/join/[slug]', params: { slug } })} />
        )}
      </View>
    </View>
  );
}

/** A shared dish inside a chat bubble: the dish, where, and how it went. */
function DishCard({ m, slug, onDark }: { m: Message; slug: string; onDark?: boolean }) {
  const { c, dark } = useTheme();
  const accent = roomAccent[slug] ?? c.text;
  const dish = m.dish!;
  const fg = onDark ? c.onPrimary : c.text;
  return (
    <View style={[styles.dish, { backgroundColor: onDark ? tint(c.onPrimary, 0.1) : tint(accent, dark ? 0.18 : 0.1) }]}>
      <View style={[styles.dishIcon, { backgroundColor: accent }]}>
        <Icon name="fork" size={14} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong" color={fg} numberOfLines={2}>
          {dish.name}
        </T>
        {dish.place ? (
          <T variant="caption" color={onDark ? tint(c.onPrimary, 0.7) : c.textSecondary} numberOfLines={1}>
            {dish.place}
          </T>
        ) : null}
        <View style={[styles.reaction, { backgroundColor: dish.reaction === 'loved' ? accent : onDark ? tint(c.onPrimary, 0.16) : c.cardMuted }]}>
          <T variant="caption" color={dish.reaction === 'loved' ? '#FFFFFF' : fg}>
            {REACTION_LABEL[dish.reaction]}
          </T>
        </View>
      </View>
    </View>
  );
}

function Bubble({ m, first, slug }: { m: Message; first: boolean; slug: string }) {
  const { c } = useTheme();
  const time = new Date(m.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (m.mine) {
    return (
      <View style={[styles.mineRow, { marginTop: first ? space.lg : space.xs }]}>
        <View style={[styles.bubble, styles.bubbleMine, { backgroundColor: c.primary, gap: space.sm }]}>
          {m.dish ? <DishCard m={m} slug={slug} onDark /> : null}
          {m.text ? <T color={c.onPrimary}>{m.text}</T> : null}
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.theirsRow, { marginTop: first ? space.lg : space.xs }]}>
      <View style={{ width: 32 }}>{first ? <Avatar name={m.author} url={m.avatarUrl} size={32} /> : null}</View>
      <View style={{ flex: 1, gap: space.xs, alignItems: 'flex-start' }}>
        {first ? (
          <View style={styles.meta}>
            <T variant="caption">{m.author}</T>
            <T variant="caption" tone="tertiary">
              {time}
            </T>
          </View>
        ) : null}
        <View style={[styles.bubble, styles.bubbleTheirs, { backgroundColor: c.card, gap: space.sm }]}>
          {m.dish ? <DishCard m={m} slug={slug} /> : null}
          {m.text ? <T>{m.text}</T> : null}
        </View>
      </View>
    </View>
  );
}

/** No messages yet: a friendly first line, in the room's colour. The list is inverted, so flip it back upright. */
function EmptyRoom({ room }: { room: RoomView }) {
  const { c, dark } = useTheme();
  const accent = roomAccent[room.slug] ?? c.text;
  return (
    <View style={[styles.empty, { transform: [{ scaleY: -1 }] }]}>
      <View style={[styles.wave, { backgroundColor: tint(accent, dark ? 0.22 : 0.12) }]}>
        <Icon name="chat" size={26} color={accent} />
      </View>
      <T variant="headline" style={{ textAlign: 'center' }}>
        {room.reasons[0] ? `Say hi to people with ${room.reasons[0].toLowerCase()}` : `Say hi to ${room.title}`}
      </T>
      <T tone="secondary" style={{ textAlign: 'center' }}>
        Ask what they order, or share a dish after a scan.
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  moreBtn: { height: 38, paddingHorizontal: space.sm, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingHorizontal: space.xl, paddingVertical: space.huge },
  wave: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  composerWrap: { paddingHorizontal: gutter, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  composer: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: 22, borderWidth: 1, paddingLeft: space.lg, padding: 5, gap: space.sm },
  input: { flex: 1, maxHeight: 120, paddingTop: 8, paddingBottom: 8 },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  mineRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingLeft: 56 },
  theirsRow: { flexDirection: 'row', gap: space.sm, paddingRight: 40 },
  meta: { flexDirection: 'row', gap: space.sm, alignItems: 'baseline' },
  bubble: { paddingHorizontal: space.md + 2, paddingVertical: space.sm + 1, borderRadius: radius.md, maxWidth: '100%' },
  bubbleMine: { borderBottomRightRadius: 6 },
  bubbleTheirs: { borderTopLeftRadius: 6 },
  dish: { flexDirection: 'row', gap: space.sm, padding: space.sm + 2, borderRadius: radius.sm + 2, minWidth: 200 },
  dishIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  reaction: { alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.chip, marginTop: space.xs },
});

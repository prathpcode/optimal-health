import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassButton } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { GlassAction, pickPhoto, postWithWhop, REACTION_LABEL } from '@/components/together';
import { Chip } from '@/components/ui';
import { shareDish, useMyRooms, type Reaction } from '@/lib/community';
import { useScan } from '@/lib/scan';
import { radius, roomAccent, space, tint, type as typeScale, useTheme } from '@/theme';

const REACTIONS: { value: Reaction; icon: 'heart' | 'check' | 'close' }[] = [
  { value: 'loved', icon: 'heart' },
  { value: 'okay', icon: 'check' },
  { value: 'nope', icon: 'close' },
];

/** Tell a room how a dish went: the dish, the place, how it went, a note and a photo. Never a verdict or a rule. */
export default function ShareSheet() {
  const { scanId, room: initialRoom } = useLocalSearchParams<{ scanId: string; room?: string }>();
  const { view } = useScan(scanId);
  const rooms = useMyRooms();
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();

  const dishes = (() => {
    if (!view) return [];
    const byId = new Map(view.items.map((i) => [i.id, i.name]));
    const ranked = view.ranking.map((r) => byId.get(r.itemId)).filter((n): n is string => Boolean(n));
    return [...new Set(ranked.length ? ranked : view.items.map((i) => i.name))].slice(0, 8);
  })();

  const [dish, setDish] = useState<string | null>(null);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [room, setRoom] = useState(initialRoom ?? rooms[0]?.slug);
  const picked = dish ?? dishes[0];
  const accent = (room && roomAccent[room]) || c.text;

  const post = async () => {
    if (!room || !picked || !reaction) return;
    setBusy(true);
    const ok = await postWithWhop(() => shareDish(room, { name: picked, place: view?.restaurant || undefined, reaction }, note, photo ?? undefined));
    setBusy(false);
    if (ok) router.replace({ pathname: '/community/[slug]', params: { slug: room } });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.xxxl, gap: space.xl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={{ gap: space.xs }}>
        <T variant="heroBold">How was it?</T>
        {view?.restaurant ? (
          <T variant="bodyStrong" tone="secondary">
            {view.restaurant}
          </T>
        ) : null}
      </View>

      {dishes.length > 1 ? (
        <View style={styles.chips}>
          {dishes.map((d) => (
            <Chip key={d} label={d} selected={picked === d} onPress={() => setDish(d)} />
          ))}
        </View>
      ) : picked ? (
        <T variant="heading">{picked}</T>
      ) : null}

      <View style={styles.reactions}>
        {REACTIONS.map((r) => {
          const on = reaction === r.value;
          return (
            <Tap
              key={r.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={REACTION_LABEL[r.value]}
              feedback="select"
              scaleTo={0.94}
              onPress={() => setReaction(r.value)}
              style={[styles.reaction, { backgroundColor: on ? accent : dark ? c.cardMuted : tint(accent, 0.08) }]}>
              <Icon name={r.icon} size={22} color={on ? '#FFFFFF' : accent} />
              <T variant="caption" color={on ? '#FFFFFF' : c.text} style={{ textAlign: 'center' }}>
                {REACTION_LABEL[r.value]}
              </T>
            </Tap>
          );
        })}
      </View>

      {photo ? (
        <View style={styles.photo}>
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.remove}>
            <GlassButton icon="close" label="Remove photo" size={36} onPress={() => setPhoto(null)} />
          </View>
        </View>
      ) : (
        <Tap accessibilityRole="button" accessibilityLabel="Add a photo of your meal" feedback="tap" scaleTo={0.98} onPress={async () => setPhoto((await pickPhoto()) ?? photo)}>
          <View style={[styles.add, { borderColor: c.hairline }]}>
            <Icon name="camera" size={18} color={c.textSecondary} />
            <T variant="bodyStrong" tone="secondary">
              Add a photo of your meal
            </T>
          </View>
        </Tap>
      )}

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Add a note"
        placeholderTextColor={c.textTertiary}
        style={[typeScale.body, styles.note, { color: c.text, backgroundColor: c.cardMuted }]}
        maxLength={500}
        multiline
        accessibilityLabel="Note"
      />

      {rooms.length > 1 ? (
        <View style={styles.chips}>
          {rooms.map((r) => (
            <Chip key={r.slug} label={r.title} selected={room === r.slug} onPress={() => setRoom(r.slug)} />
          ))}
        </View>
      ) : null}

      <GlassAction label="Share" icon="send" onPress={post} loading={busy} disabled={!reaction || !picked || !room} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  reactions: { flexDirection: 'row', gap: space.sm },
  reaction: { flex: 1, height: 96, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.sm },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, overflow: 'hidden' },
  remove: { position: 'absolute', top: space.sm, right: space.sm },
  add: { height: 56, borderRadius: radius.card, borderWidth: 1.5, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  note: { minHeight: 52, maxHeight: 120, borderRadius: radius.md, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md },
});

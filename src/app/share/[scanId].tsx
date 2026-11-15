import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassButton } from '@/components/Glass';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { PLAIN_FIT } from '@/components/challenge';
import { ReactionPicker } from '@/components/ReactionPicker';
import { attempt, GlassAction, pickPhoto, postWithWhop } from '@/components/together';
import { Icon } from '@/components/Icon';
import { RoomSelect } from '@/components/RoomSelect';
import { Chip } from '@/components/ui';
import { MEAL_POINTS } from '@engine/challenge';
import type { Fit, Item } from '@engine/types';
import { celebrate } from '@/lib/celebrate';
import { shareDish, useActiveChallenges, useLogMeal, useMealForScan, useMyRooms, type Reaction } from '@/lib/community';
import { dishEmoji } from '@/lib/emoji';
import { useRecentScans, useScan } from '@/lib/scan';
import { toSharedItem } from '@/lib/sharedItem';
import { useWhopAccount } from '@/lib/whop';
import { radius, roomAccent, space, type as typeScale, useTheme } from '@/theme';

/**
 * The one place a dish is logged and shared: pick what you ordered, and it counts toward your challenges. Say how it
 * went as well and the same button posts it to a room, with the scan's own photo so people see what you ate. Never a
 * verdict or a rule. Works without signing in (then it only logs).
 */
export default function ShareSheet() {
  // `room`: started from a room, so this is a post and "how was it" is required. `fixed`: the room can't be changed.
  const { scanId, room: fromRoom, fixed } = useLocalSearchParams<{ scanId: string; room?: string; fixed?: string }>();
  const { view } = useScan(scanId);
  const rooms = useMyRooms();
  const { account } = useWhopAccount();
  const logged = useMealForScan(scanId);
  const log = useLogMeal();
  const active = useActiveChallenges();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();

  // Everything the scan found, in the order it is printed. This screen only enumerates what was on the menu; how
  // each dish fits is the result screen's job.
  const dishes = useMemo(() => [...new Map((view?.items ?? []).map((i) => [i.name, i])).values()], [view?.items]);

  // What was ordered, by item id: a table often orders several things, so this is a multiple choice.
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [note, setNote] = useState('');
  // Every post carries a photo: the scan's own (bundled sample photos, which are numbers, are never shared), or, when
  // the scan has none (a barcode-only product), one you add.
  const recent = useRecentScans();
  const fromList = recent?.find((r) => r.id === scanId)?.photo;
  const source = view?.photo ?? fromList;
  const scanPhoto = source && typeof source === 'object' ? source.uri : null;
  const [added, setAdded] = useState<string | null>(null);
  const photo = added ?? scanPhoto;
  const addPhoto = async () => setAdded((await pickPhoto()) ?? added);
  const [busy, setBusy] = useState(false);
  const [chosenRoom, setRoom] = useState(fromRoom);
  const room = chosenRoom ?? rooms[0]?.slug;
  // Nothing is assumed: dishes are only preselected from what you logged before, or when the scan found one thing.
  const ids = chosen ?? (logged?.length ? logged.map((m) => m.itemId) : dishes.length === 1 ? [dishes[0].id] : []);
  const picked = ids.map((id) => dishes.find((d) => d.id === id)).filter((d): d is Item => Boolean(d));
  const toggle = (id: string) => setChosen(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const accent = (room && roomAccent[room]) || c.text;

  // Still reading the photo: the dishes land before the verdicts do, so this screen is usable long before the result is.
  const reading = view === undefined || (dishes.length === 0 && view !== null && view.status !== 'failed' && view.status !== 'done');

  const canShare = Boolean(fromRoom) || (Boolean(account) && rooms.length > 0);
  const sharing = canShare && Boolean(reaction);
  const ready = picked.length > 0 && (fromRoom ? sharing : true) && (!sharing || Boolean(room && photo));

  const submit = async () => {
    if (!picked.length) return;
    setBusy(true);
    let fits: Fit[] = picked.map((p) => view?.verdicts[p.id]?.fit ?? 'cant_tell');
    const counted = await attempt(
      log(scanId, picked.map((p, i) => ({ itemId: p.id, dishName: p.name, fit: fits[i] }))).then((f) => (fits = f)),
    );
    if (!counted) return setBusy(false);
    const names = picked.map((p) => p.name).join(' + ');
    let posted = false;
    if (sharing && room && reaction && photo) {
      // The dishes' facts go with the post (never your verdict or rules), so others can open them in full.
      const item = toSharedItem(picked[0], view?.restaurant || undefined);
      posted = await postWithWhop(() => shareDish(room, { name: names, place: view?.restaurant || undefined, reaction, item }, note, photo));
      // Logged but not posted: stay here so the post can be tried again.
      if (!posted) return setBusy(false);
    }
    setBusy(false);
    const points = fits.reduce((a, f) => a + MEAL_POINTS[f], 0);
    const best: Fit = fits.includes('good') ? 'good' : fits.includes('okay') ? 'okay' : fits.includes('not_fit') ? 'not_fit' : 'cant_tell';
    celebrate(
      points > 0
        ? { title: `+${points}`, subtitle: active.length ? 'in your points race' : PLAIN_FIT[best === 'good' ? 'good' : 'okay'], tone: best === 'good' ? 'great' : 'good' }
        : {
            title: posted ? 'Shared' : 'Logged',
            subtitle: view?.status !== 'done' ? 'Still checking how it fits' : best === 'not_fit' ? 'Doesn’t fit your diet this time' : 'We couldn’t tell for this one',
            tone: 'neutral',
          },
    );
    if (posted && room) router.replace({ pathname: '/community/[slug]', params: { slug: room } });
    else router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.xxxl, gap: space.xl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={{ gap: space.xs }}>
        <T variant="heroBold">What did you order?</T>
        {view?.restaurant ? (
          <T variant="bodyStrong" tone="secondary">
            {view.restaurant}
          </T>
        ) : null}
      </View>

      {reading ? (
        <View style={styles.waiting}>
          <ActivityIndicator color={c.textSecondary} />
          <T tone="secondary">Reading your scan…</T>
        </View>
      ) : dishes.length ? (
        <View style={{ gap: space.sm }}>
          {dishes.length > 1 ? (
            <T variant="caption" tone="secondary">
              Pick everything you ordered.
            </T>
          ) : null}
          <View style={styles.chips}>
            {dishes.map((d) => (
              <Chip key={d.id} label={`${dishEmoji(d.name)} ${d.name}`} selected={ids.includes(d.id)} onPress={() => toggle(d.id)} />
            ))}
          </View>
        </View>
      ) : (
        <T tone="secondary">We couldn’t read anything to order from this scan.</T>
      )}

      {canShare ? (
        <View style={{ gap: space.md }}>
          <View style={{ gap: 2 }}>
            <T variant="heading">How was it?</T>
            {fromRoom ? null : (
              <T variant="caption" tone="secondary">
                Optional. Pick one to share it with a room too.
              </T>
            )}
          </View>
          {/* Tapping the picked one again takes it back, unless this started as a post. */}
          <ReactionPicker value={reaction} onChange={(r) => setReaction(r === reaction && !fromRoom ? null : r)} accent={accent} />
        </View>
      ) : null}

      {sharing || fromRoom ? (
        <>
          <RoomSelect rooms={rooms} value={room} onChange={setRoom} locked={Boolean(fixed)} />
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

        {photo ? (
          <View style={styles.photo}>
            <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
            {added ? (
              <View style={styles.remove}>
                <GlassButton icon="close" label="Remove photo" size={36} onPress={() => setAdded(null)} />
              </View>
            ) : null}
          </View>
        ) : (
          <Tap accessibilityRole="button" accessibilityLabel="Add a photo" feedback="tap" scaleTo={0.98} onPress={addPhoto}>
            <View style={[styles.add, { borderColor: c.hairline }]}>
              <Icon name="camera" size={18} color={c.textSecondary} />
              <T variant="bodyStrong" tone="secondary">
                Add a photo to post
              </T>
            </View>
          </Tap>
        )}
        </>
      ) : null}

      <GlassAction label={sharing ? 'Log and share' : fromRoom ? 'Share' : 'Log it'} icon={sharing || fromRoom ? 'send' : 'check'} onPress={submit} loading={busy} disabled={!ready} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, overflow: 'hidden' },
  remove: { position: 'absolute', top: space.sm, right: space.sm },
  add: { height: 56, borderRadius: radius.card, borderWidth: 1.5, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  note: { minHeight: 52, maxHeight: 120, borderRadius: radius.md, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md },
});

import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DURATION_OPTIONS_DAYS, MEALS_PER_DAY } from '@engine/challenge';
import { inviteToChallenge, PointsKey } from '@/components/challenge';
import { T } from '@/components/T';
import { attempt, GlassAction } from '@/components/together';
import { Chip } from '@/components/ui';
import { celebrate } from '@/lib/celebrate';
import { createChallenge } from '@/lib/community';
import { space } from '@/theme';

const DAY = 86_400_000;
const LENGTH_LABEL: Record<number, string> = { 3: '3 days', 7: '1 week', 14: '2 weeks' };

function midnight(offsetDays: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.getTime();
}

/** Start a points race: how it scores, how long, when; then straight to inviting friends. */
export default function NewChallenge() {
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState<number>(7);
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);

  const startsAt = midnight(later ? 1 : 0);
  const ends = new Date(startsAt + days * DAY - 1).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const start = async () => {
    setBusy(true);
    let id = '';
    const ok = await attempt(createChallenge(days, startsAt).then((x) => (id = x)));
    setBusy(false);
    if (!ok || !id) return;
    celebrate({ title: 'Race on', subtitle: 'Now invite your friends', tone: 'great' });
    router.replace({ pathname: '/challenge/[id]', params: { id } });
    setTimeout(() => void inviteToChallenge({ id, days }), 600);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.xl, gap: space.xxl }} showsVerticalScrollIndicator={false}>
      <View style={{ gap: space.sm }}>
        <T variant="heroBold">Start a points race</T>
        <T variant="bodyStrong" tone="secondary">
          Scan the menu, then tap what you ordered. Dishes that fit your diet score points. Most points wins.
        </T>
      </View>

      <PointsKey />

      <View style={{ gap: space.md }}>
        <T variant="heading">How long</T>
        <View style={styles.chips}>
          {DURATION_OPTIONS_DAYS.map((d) => (
            <Chip key={d} label={LENGTH_LABEL[d] ?? `${d} days`} selected={days === d} onPress={() => setDays(d)} />
          ))}
        </View>
      </View>

      <View style={{ gap: space.md }}>
        <T variant="heading">Starts</T>
        <View style={styles.chips}>
          <Chip label="Today" selected={!later} onPress={() => setLater(false)} />
          <Chip label="Tomorrow" selected={later} onPress={() => setLater(true)} />
        </View>
      </View>

      <View style={{ gap: space.md }}>
        <T variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
          Ends {ends} · up to {MEALS_PER_DAY} dishes a day count
        </T>
        <GlassAction label="Start and invite friends" icon="trophy" onPress={start} loading={busy} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});

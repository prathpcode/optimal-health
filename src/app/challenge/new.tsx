import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DURATION_OPTIONS_DAYS } from '@engine/challenge';
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

/** Start a challenge: how it scores, how long, when; then straight to inviting friends. */
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
    celebrate({ title: 'Challenge on', subtitle: 'Invite your friends', tone: 'great', icon: 'trophy' });
    router.replace({ pathname: '/challenge/[id]', params: { id } });
    setTimeout(() => void inviteToChallenge({ id, days }), 600);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.xl, gap: space.xxl }} showsVerticalScrollIndicator={false}>
      <View style={{ gap: space.sm }}>
        <T variant="heroBold">Start a challenge</T>
        <T variant="bodyStrong" tone="secondary">
          Compete with your friends and see 
        </T>
      </View>

      <PointsKey />

      <View style={styles.chips}>
        {DURATION_OPTIONS_DAYS.map((d) => (
          <Chip key={d} label={LENGTH_LABEL[d] ?? `${d} days`} selected={days === d} onPress={() => setDays(d)} />
        ))}
      </View>

      <View style={styles.chips}>
        <Chip label="Today" selected={!later} onPress={() => setLater(false)} />
        <Chip label="Tomorrow" selected={later} onPress={() => setLater(true)} />
      </View>

      <View style={{ gap: space.md }}>
        <GlassAction label="Start and invite" icon="trophy" onPress={start} loading={busy} />
        <T variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
          Ends {ends}
        </T>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});

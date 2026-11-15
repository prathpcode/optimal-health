import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DURATION_OPTIONS_DAYS } from '@engine/challenge';
import { inviteToChallenge } from '@/components/challenge';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { attempt, GlassAction } from '@/components/together';
import { Chip } from '@/components/ui';
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

/** Start a challenge: how long, when; then send it to friends, or start without. */
export default function NewChallenge() {
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState<number>(7);
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState<'invite' | 'solo' | null>(null);

  const startsAt = midnight(later ? 1 : 0);
  const ends = new Date(startsAt + days * DAY - 1).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const start = async (invite: boolean) => {
    setBusy(invite ? 'invite' : 'solo');
    let id = '';
    const ok = await attempt(createChallenge(days, startsAt).then((x) => (id = x)));
    setBusy(null);
    if (!ok || !id) return;
    router.replace({ pathname: '/challenge/[id]', params: { id } });
    if (invite) setTimeout(() => void inviteToChallenge({ id, days }), 600);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.xl, gap: space.xxl }} showsVerticalScrollIndicator={false}>
      <View style={{ gap: space.sm }}>
        <T variant="heroBold">Start a challenge</T>
        <T variant="bodyStrong" tone="secondary">
          Compete with your friends and see who eats the healthiest!
        </T>
      </View>

      <View style={{ gap: space.md }}>
        <T variant="bodyStrong" tone="secondary">
          How long
        </T>
        <View style={styles.chips}>
          {DURATION_OPTIONS_DAYS.map((d) => (
            <Chip key={d} label={LENGTH_LABEL[d] ?? `${d} days`} selected={days === d} onPress={() => setDays(d)} />
          ))}
        </View>
      </View>

      <View style={{ gap: space.md }}>
        <T variant="bodyStrong" tone="secondary">
          When it starts
        </T>
        <View style={styles.chips}>
          <Chip label="Today" selected={!later} onPress={() => setLater(false)} />
          <Chip label="Tomorrow" selected={later} onPress={() => setLater(true)} />
        </View>
        <T variant="caption" tone="secondary">
          Ends {ends}
        </T>
      </View>

      <View style={{ gap: space.sm }}>
        <GlassAction label="Start and invite friends" icon="share" onPress={() => start(true)} loading={busy === 'invite'} disabled={busy !== null} />
        <Tap accessibilityRole="button" accessibilityLabel="Start without inviting" onPress={() => start(false)} disabled={busy !== null} style={styles.plain}>
          <T variant="bodyStrong" tone="secondary">
            {busy === 'solo' ? 'Starting…' : 'Start without inviting'}
          </T>
        </Tap>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  plain: { height: 44, alignItems: 'center', justifyContent: 'center' },
});

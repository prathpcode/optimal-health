import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHALLENGE_NAME, DURATION_OPTIONS_DAYS, minMeals } from '@engine/challenge';
import { FitLegend } from '@/components/challenge';
import { T } from '@/components/T';
import { attempt, GlassAction } from '@/components/together';
import { Chip } from '@/components/ui';
import { celebrate } from '@/lib/celebrate';
import { createChallenge } from '@/lib/community';
import { space } from '@/theme';

function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Start an "Eat what fits" challenge: pick a length, then invite friends from the challenge. */
export default function NewChallenge() {
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState<number>(7);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    let id = '';
    const ok = await attempt(createChallenge(days, todayMidnight()).then((x) => (id = x)));
    setBusy(false);
    if (!ok || !id) return;
    celebrate({ title: 'Game on', subtitle: 'Now invite your friends', tone: 'great' });
    router.replace({ pathname: '/challenge/[id]', params: { id } });
  };

  return (
    <View style={{ padding: space.xxl, paddingBottom: insets.bottom + space.xl, gap: space.xxl }}>
      <View style={{ gap: space.sm }}>
        <T variant="heroBold">{CHALLENGE_NAME}</T>
        <T variant="bodyStrong" tone="secondary">
          Log what you order after each scan.
        </T>
      </View>
      <View style={{ gap: space.md }}>
        <FitLegend />
        <T variant="caption" tone="secondary">
          Highest fit % wins · {minMeals(days)} meals to qualify
        </T>
      </View>
      <View style={styles.chips}>
        {DURATION_OPTIONS_DAYS.map((d) => (
          <Chip key={d} label={`${d} days`} selected={days === d} onPress={() => setDays(d)} />
        ))}
      </View>
      <GlassAction label="Start" icon="trophy" onPress={start} loading={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: space.sm },
});

import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MEALS_PER_DAY } from '@engine/challenge';
import { HowToWin, PointsKey } from '@/components/challenge';
import { T } from '@/components/T';
import { useChallenge } from '@/lib/community';
import { space, useTheme } from '@/theme';

const STEPS = [
  { title: 'Scan a menu', body: 'Take a photo of the menu you are looking at.' },
  { title: 'Tap what you ordered', body: 'Pick the dishes you actually ordered.' },
  { title: `Only the first ${MEALS_PER_DAY} count`, body: `Only the first ${MEALS_PER_DAY} dishes a day count toward your score.` },
];

/** How a race is scored, opened from the info button on the race screen. */
export default function HowToWinSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ch = useChallenge(id);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const ends = ch ? new Date(ch.endsAt - 1).toLocaleDateString(undefined, { weekday: 'long' }) : null;

  return (
    <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.xl, gap: space.xxl }} showsVerticalScrollIndicator={false}>
      <View style={{ gap: space.sm }}>
        <T variant="heroBold">How challenges work</T>
      </View>

      {ch ? <HowToWin ch={ch} /> : <PointsKey />}

      <View style={{ gap: space.lg }}>
        {STEPS.map((s, i) => (
          <View key={s.title} style={styles.step}>
            <View style={[styles.num, { backgroundColor: c.cardMuted }]}>
              <T variant="bodyStrong" tone="secondary">
                {i + 1}
              </T>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="headline">{s.title}</T>
              <T variant="body" tone="secondary">
                {s.body}
              </T>
            </View>
          </View>
        ))}
      </View>

      {ends ? (
        <T variant="caption" tone="secondary">
          Most points when the race ends on {ends} wins.
        </T>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: space.md },
  num: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});

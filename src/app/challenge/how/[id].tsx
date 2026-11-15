import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MoneyRules, PointsKey } from '@/components/challenge';
import { T } from '@/components/T';
import { useChallenge } from '@/lib/community';
import { space } from '@/theme';

/** How a race is scored, opened from the info button on the race screen: the points table, one line on winning, and the money rules if there is a pool. */
export default function HowToWinSheet() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ch = useChallenge(id);
  return (
    <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.xl, gap: space.xxl }} showsVerticalScrollIndicator={false}>
      <T variant="heroBold">How challenges work</T>
      <PointsKey />
      <T variant="bodyStrong" tone="secondary">
        Your score is your average points per meal. The highest average wins.
      </T>
      {ch && ch.entryCents > 0 ? (
        <View style={{ gap: space.md }}>
          <T variant="heading">The pool</T>
          <MoneyRules />
        </View>
      ) : null}
    </ScrollView>
  );
}

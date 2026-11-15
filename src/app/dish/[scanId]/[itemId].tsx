import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnswerButtons } from '@/components/AnswerButtons';
import { FindingList } from '@/components/Findings';
import { ItemFacts } from '@/components/ItemFacts';
import { T } from '@/components/T';
import { SectionLabel, Skeleton, VerdictPill } from '@/components/ui';
import { useScan } from '@/lib/scan';
import { duration, enterAt, space } from '@/theme';


export default function DishSheet() {
  const { scanId, itemId } = useLocalSearchParams<{ scanId: string; itemId: string }>();
  const { view, answer } = useScan(scanId);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const item = view?.items.find((i) => i.id === itemId);
  const verdict = view?.verdicts[itemId];
  const questions = view?.questions.filter((q) => q.itemId === itemId) ?? [];
  const explanation = view?.explanations[itemId];

  if (!item) {
    return (
      <View style={{ padding: space.xxl, gap: space.md }}>
        <Skeleton width="60%" height={22} />
        <Skeleton width="40%" />
      </View>
    );
  }


  return (
    <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.lg, gap: space.xl }} showsVerticalScrollIndicator={false}>
      <View style={{ gap: space.sm }}>
        <T variant="title">{item.name}</T>
        {item.description ? <T tone="secondary">{item.description}</T> : null}
        {verdict ? (
          <Animated.View entering={FadeIn.duration(duration.base)} style={{ marginTop: space.xs }}>
            <VerdictPill fit={verdict.fit} large />
          </Animated.View>
        ) : null}
      </View>

      {explanation ? (
        <Animated.View entering={enterAt(0, reduced)}>
          <T style={{ lineHeight: 23 }}>{explanation}</T>
        </Animated.View>
      ) : null}

      {verdict && verdict.findings.length > 0 ? (
        <Animated.View entering={enterAt(1, reduced)} style={{ gap: space.sm }}>
          <SectionLabel>Why</SectionLabel>
          <FindingList findings={verdict.findings} rules={view?.rules ?? []} compact />
        </Animated.View>
      ) : null}

      {questions.length > 0 ? (
        <Animated.View entering={enterAt(2, reduced)} style={{ gap: space.md }}>
          <SectionLabel>Ask your server</SectionLabel>
          {questions.map((q) => (
            <View key={q.id} style={{ gap: space.md }}>
              <T variant="bodyStrong">“{q.text}”</T>
              <AnswerButtons value={q.answer} onChange={(v) => answer(q.id, v)} question={q.text} />
            </View>
          ))}
        </Animated.View>
      ) : null}

      <ItemFacts ingredients={item.ingredients.map((i) => (i.origin === 'inferred' ? { name: i.name, guess: true } : { name: i.name }))} nutrients={item.nutrients} />

    </ScrollView>
  );
}


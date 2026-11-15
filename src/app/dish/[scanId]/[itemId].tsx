import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnswerButtons } from '@/components/AnswerButtons';
import { FindingList } from '@/components/Findings';
import { T } from '@/components/T';
import { SectionLabel, Skeleton, VerdictPill } from '@/components/ui';
import { useScan } from '@/lib/scan';
import { duration, enterAt, radius, space, useTheme } from '@/theme';


export default function DishSheet() {
  const { scanId, itemId } = useLocalSearchParams<{ scanId: string; itemId: string }>();
  const { view, answer } = useScan(scanId);
  const { c } = useTheme();
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

  const stated = item.ingredients.filter((i) => i.origin !== 'inferred');
  const guessed = item.ingredients.filter((i) => i.origin === 'inferred');

  return (
    <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.xxxl, gap: space.xxl }} showsVerticalScrollIndicator={false}>
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
          <FindingList findings={verdict.findings} rules={view?.rules ?? []} />
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

      {item.ingredients.length > 0 ? (
        <Animated.View entering={enterAt(3, reduced)} style={{ gap: space.sm }}>
          <SectionLabel>What’s in it</SectionLabel>
          <View style={styles.ingredients}>
            {stated.map((i) => (
              <View key={`s-${i.name}`} style={[styles.ingredient, { backgroundColor: c.cardMuted }]}>
                <T variant="caption">{i.name}</T>
              </View>
            ))}
            {guessed.map((i) => (
              <View key={`g-${i.name}`} style={[styles.ingredient, styles.guessed, { borderColor: c.textTertiary }]}>
                <T variant="caption" tone="secondary">
                  {i.name}
                </T>
              </View>
            ))}
          </View>
          {guessed.length > 0 ? (
            <T variant="caption" tone="tertiary">
              Dashed items are guesses from the dish name. The menu does not list them.
            </T>
          ) : null}
        </Animated.View>
      ) : null}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ingredients: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  ingredient: { borderRadius: radius.chip, paddingHorizontal: space.md, paddingVertical: 6 },
  guessed: { borderWidth: 1.2, borderStyle: 'dashed' },
});

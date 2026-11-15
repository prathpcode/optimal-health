import { useLocalSearchParams } from 'expo-router';
import { useAction } from 'convex/react';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { AnswerButtons } from '@/components/AnswerButtons';
import { FindingList } from '@/components/Findings';
import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { SectionLabel, Skeleton, VerdictPill } from '@/components/ui';
import { Tap } from '@/components/Tap';
import { HAS_BACKEND } from '@/lib/backend';
import { SAMPLE_ID, useScan } from '@/lib/scan';
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

      {scanId !== SAMPLE_ID && HAS_BACKEND ? <FollowUp scanId={scanId} itemId={itemId} /> : null}
    </ScrollView>
  );
}

/** "What if I skip the sauce?": answered from this dish, the person's rules and the verdict only (followups.ask). */
function FollowUpLive({ scanId, itemId }: { scanId: string; itemId: string }) {
  const { c } = useTheme();
  const ask = useAction(api.followups.ask);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<{ q: string; a: string }[]>([]);

  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setText('');
    try {
      const a = await ask({ scanId: scanId as Id<'scans'>, itemId, text: q });
      setThread((t) => [...t, { q, a }]);
    } catch {
      setThread((t) => [...t, { q, a: 'Couldn’t get an answer right now. Try again in a moment.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.md }}>
      <SectionLabel>Ask about this dish</SectionLabel>
      {thread.map((m, i) => (
        <Animated.View key={i} entering={FadeIn.duration(duration.base)} style={{ gap: space.sm }}>
          <View style={[styles.bubble, styles.mine, { backgroundColor: c.primary }]}>
            <T color={c.onPrimary}>{m.q}</T>
          </View>
          <View style={[styles.bubble, { backgroundColor: c.cardMuted }]}>
            <T>{m.a}</T>
          </View>
        </Animated.View>
      ))}
      <View style={[styles.askBox, { backgroundColor: c.cardMuted }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          placeholder="What if I skip the sauce?"
          placeholderTextColor={c.textTertiary}
          returnKeyType="send"
          editable={!busy}
          style={[styles.askInput, { color: c.text }]}
          accessibilityLabel="Ask a question about this dish"
        />
        {busy ? (
          <ActivityIndicator color={c.textSecondary} />
        ) : (
          <Tap accessibilityRole="button" accessibilityLabel="Send" feedback="tap" onPress={send} disabled={!text.trim()} style={[styles.send, { backgroundColor: c.primary }]}>
            <Icon name="chevron" size={13} color={c.onPrimary} weight="bold" />
          </Tap>
        )}
      </View>
    </View>
  );
}

const FollowUp: (p: { scanId: string; itemId: string }) => React.ReactNode = HAS_BACKEND ? FollowUpLive : () => null;

const styles = StyleSheet.create({
  ingredients: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  ingredient: { borderRadius: radius.chip, paddingHorizontal: space.md, paddingVertical: 6 },
  guessed: { borderWidth: 1.2, borderStyle: 'dashed' },
  bubble: { borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, maxWidth: '88%', alignSelf: 'flex-start' },
  mine: { alignSelf: 'flex-end' },
  askBox: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.button, paddingLeft: space.lg, paddingRight: 6, height: 50 },
  askInput: { flex: 1, fontSize: 16, height: '100%' },
  send: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});

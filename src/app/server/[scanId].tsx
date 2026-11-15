import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T } from '@/components/T';
import { Button, Perforation, Rule } from '@/components/ui';
import { useScan } from '@/lib/scan';
import { space, useTheme } from '@/theme';

/**
 * The stub you show your server: each open question in large type, with the dish it is about. Answers are still
 * recorded on the result screen; this screen is only for reading across the table.
 */
export default function ServerStub() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const { view } = useScan(scanId);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const names = new Map((view?.items ?? []).map((i) => [i.id, i.name]));
  const open = (view?.questions ?? []).filter((q) => !q.answer);
  const questions = open.length ? open : (view?.questions ?? []);

  return (
    <ScrollView style={{ backgroundColor: c.card }} contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + space.xl }]}>
      <Perforation color={c.bg} />
      <View style={styles.head}>
        <T variant="micro" color={c.check}>
          For your server
        </T>
        <T variant="title">{view?.restaurant ? `Questions about ${view.restaurant}’s menu` : 'A few questions about the menu'}</T>
        <T variant="body" tone="secondary">
          I have food restrictions. Could you check these for me?
        </T>
      </View>
      {questions.map((q, i) => (
        <View key={q.id}>
          {i > 0 ? <Rule strong /> : null}
          <View style={styles.q}>
            <T variant="caption" tone="secondary">
              {names.get(q.itemId) ?? 'Dish'}
            </T>
            <T variant="stub">
              {q.text}
            </T>
          </View>
        </View>
      ))}
      <Button label="Done" onPress={() => router.back()} style={{ marginTop: space.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.xl, paddingTop: space.xl },
  head: { gap: space.sm, paddingTop: space.xl, paddingBottom: space.lg },
  q: { gap: space.xs, paddingVertical: space.lg },
});

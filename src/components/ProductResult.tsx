import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import type { Item, Nutrients } from '@engine/types';
import type { Answer, ScanView } from '@/lib/scan';
import { duration, enterAt, radius, space, useTheme } from '@/theme';
import { AnswerButtons } from './AnswerButtons';
import { FindingList } from './Findings';
import { Icon, type IconName } from './Icon';
import { T } from './T';
import { Card, SectionLabel, Skeleton, VerdictPill } from './ui';

const KIND_LABEL: Record<Item['kind'], string> = {
  product: 'Grocery item',
  supplement: 'Supplement',
  otc: 'Medicine (over the counter)',
  dish: 'Dish',
};

/**
 * The result for a single scanned product (barcode or label photo): the verdict front and centre, the reasons with
 * their sources (including lines from the package's own label), the numbers, and what to check on the package.
 */
export function ProductResult({ view, onAnswer }: { view: ScanView; onAnswer: (questionId: string, value: Answer) => void }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const item = view.items[0];
  if (!item) {
    return (
      <Card style={{ gap: space.md, marginTop: space.lg }}>
        <Skeleton width="40%" height={11} />
        <Skeleton width="75%" height={22} />
        <Skeleton width="30%" height={26} />
      </Card>
    );
  }
  const verdict = view.verdicts[item.id];
  const explanation = view.explanations[item.id];
  const findings = verdict?.findings ?? [];
  // "Confirm" findings are standing reminders: for a barcode, the database can say an allergen is there, not that it is not.
  const checks = findings.filter((f) => f.outcome === 'confirm' && f.question);

  return (
    <View style={{ gap: space.xl, marginTop: space.lg }}>
      <Animated.View entering={enterAt(0, reduced)}>
        <Card style={{ gap: space.md }}>
          <View style={styles.kindRow}>
            <View style={[styles.kindIcon, { backgroundColor: c.cardMuted }]}>
              <Icon name={item.kind === 'otc' || item.kind === 'supplement' ? 'pill' : 'box'} size={15} color={c.textSecondary} />
            </View>
            <T variant="micro" tone="secondary">
              {KIND_LABEL[item.kind]}
            </T>
          </View>
          <T variant="title">{item.name}</T>
          {verdict ? (
            <Animated.View key={verdict.fit} entering={FadeIn.duration(duration.base)} style={styles.verdictRow}>
              <VerdictPill fit={verdict.fit} large />
              {view.provisional ? (
                <T variant="caption" tone="tertiary">
                  checking…
                </T>
              ) : null}
            </Animated.View>
          ) : (
            <Skeleton width={120} height={32} />
          )}
          {explanation ? (
            <Animated.View entering={FadeIn.duration(duration.slow)}>
              <T style={{ lineHeight: 22 }}>{explanation}</T>
            </Animated.View>
          ) : null}
        </Card>
      </Animated.View>

      {item.incomplete ? (
        <View style={[styles.banner, { backgroundColor: c.okaySoft }]}>
          <Icon name="warning" size={16} color={c.okay} />
          <T variant="caption" color={c.okay} style={{ flex: 1 }}>
            Part of the label couldn’t be read, so “nothing found” doesn’t prove anything here.
          </T>
        </View>
      ) : null}

      {findings.length > 0 ? (
        <Animated.View entering={enterAt(1, reduced)} layout={reduced ? undefined : LinearTransition.springify().damping(22)} style={{ gap: space.sm }}>
          <SectionLabel>Why</SectionLabel>
          <FindingList findings={findings.filter((f) => f.outcome !== 'confirm')} rules={view.rules} muted={false} />
        </Animated.View>
      ) : null}

      {item.nutrients ? <NutritionTiles nutrients={item.nutrients} /> : null}

      {checks.length > 0 || view.questions.length > 0 ? (
        <Animated.View entering={enterAt(3, reduced)} style={{ gap: space.sm }}>
          <View style={styles.headerRow}>
            <Icon name="box" size={15} color={c.textSecondary} />
            <SectionLabel>Check the package</SectionLabel>
          </View>
          <Card style={{ gap: space.lg }}>
            {checks.map((f, i) => (
              <View key={`c-${i}`} style={styles.checkRow}>
                <Icon name="checkCircle" size={16} color={c.okay} />
                <T style={{ flex: 1 }}>{f.question}</T>
              </View>
            ))}
            {view.questions.map((q) => (
              <View key={q.id} style={{ gap: space.md }}>
                <T variant="bodyStrong">{q.text}</T>
                <AnswerButtons value={q.answer} onChange={(v) => onAnswer(q.id, v)} question={q.text} skipLabel="Not sure" />
              </View>
            ))}
          </Card>
        </Animated.View>
      ) : null}
    </View>
  );
}

function NutritionTiles({ nutrients }: { nutrients: Nutrients }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const sugar = nutrients.addedSugarG ?? nutrients.sugarG;
  const tiles: { icon: IconName; label: string; value?: number; unit: string; tint: string }[] = [
    { icon: 'flame', label: 'Calories', value: nutrients.kcal, unit: '', tint: c.notFit },
    { icon: 'sugar', label: nutrients.addedSugarG !== undefined ? 'Added sugar' : 'Sugar', value: sugar, unit: 'g', tint: c.okay },
    { icon: 'fat', label: 'Saturated fat', value: nutrients.satFatG, unit: 'g', tint: c.cantTell },
    { icon: 'salt', label: 'Sodium', value: nutrients.sodiumMg, unit: 'mg', tint: c.good },
  ];
  const shown = tiles.filter((t) => typeof t.value === 'number');
  if (shown.length === 0) return null;
  return (
    <Animated.View entering={enterAt(2, reduced)} style={{ gap: space.sm }}>
      <SectionLabel>{nutrients.per === 'serving' ? 'Per serving' : 'Per 100 g'}</SectionLabel>
      <View style={styles.tiles}>
        {shown.map((t) => (
          <Card key={t.label} style={styles.tile}>
            <View style={[styles.tileIcon, { backgroundColor: c.cardMuted }]}>
              <Icon name={t.icon} size={15} color={t.tint} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="caption" tone="secondary" numberOfLines={1}>
                {t.label}
              </T>
              <T variant="headline" style={{ fontVariant: ['tabular-nums'] }}>
                {Math.round((t.value as number) * 10) / 10}
                {t.unit ? ` ${t.unit}` : ''}
              </T>
            </View>
          </Card>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  kindIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, padding: space.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md + 2, flexBasis: '47%', flexGrow: 1 },
  tileIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});

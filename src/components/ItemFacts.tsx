import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import type { Nutrients } from '@engine/types';
import { enterAt, radius, space, useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';
import { T } from './T';
import { Card, SectionLabel } from './ui';

/**
 * The facts about a dish or product, the same after a scan and in a shared post: what's in it (stated ingredients,
 * and dashed guesses from the dish name) and the numbers per serving. Nothing about the person looking at it.
 */
export function ItemFacts({ ingredients, nutrients, at = 3 }: { ingredients: { name: string; guess?: boolean }[]; nutrients?: Nutrients; at?: number }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const stated = ingredients.filter((i) => !i.guess);
  const guessed = ingredients.filter((i) => i.guess);
  return (
    <>
      {ingredients.length > 0 ? (
        <Animated.View entering={enterAt(at, reduced)} style={{ gap: space.sm }}>
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
      {nutrients ? <NutritionTiles nutrients={nutrients} at={at + 1} /> : null}
    </>
  );
}

export function NutritionTiles({ nutrients, at = 2 }: { nutrients: Nutrients; at?: number }) {
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
    <Animated.View entering={enterAt(at, reduced)} style={{ gap: space.sm }}>
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
  ingredients: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  ingredient: { borderRadius: radius.chip, paddingHorizontal: space.md, paddingVertical: 6 },
  guessed: { borderWidth: 1.2, borderStyle: 'dashed' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md + 2, flexBasis: '47%', flexGrow: 1 },
  tileIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});

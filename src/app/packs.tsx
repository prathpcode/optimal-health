import { router } from 'expo-router';
import { Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassButton } from '@/components/Glass';
import { PackCard } from '@/components/PackCard';
import { T } from '@/components/T';
import { usePacks } from '@/lib/packs';
import { gutter, space, titleTop, topBar, useTheme } from '@/theme';

/**
 * The rule packs on sale, as a page of their own, opened from "Buy dietitian packages" under the rules on Manage.
 * Each pack is a card: what it is, how many rules it adds, and the way to get it.
 */
export default function PacksScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const packs = usePacks();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/me'));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + titleTop, paddingHorizontal: gutter, paddingBottom: (Platform.OS === 'ios' ? insets.bottom : 0) + space.xxxl, gap: space.xl }}>
        <View style={{ gap: space.sm }}>
          <T variant="heroBold" accessibilityRole="header" style={{ textAlign: 'center' }}>
            Dietitian packages
          </T>
          <T tone="secondary" style={{ textAlign: 'center' }}>
            Ready-made sets of rules from licensed dietitians. Buy one once and its rules are added to yours.
          </T>
        </View>
        <View style={{ gap: space.md }}>
          {packs.map((p) => (
            <PackCard key={p.id} pack={p} />
          ))}
        </View>
        {packs.length === 0 ? (
          <T tone="secondary" style={{ textAlign: 'center' }}>
            No packages are on sale right now.
          </T>
        ) : null}
      </ScrollView>
      <View style={{ position: 'absolute', top: insets.top + topBar, left: gutter }}>
        <GlassButton tone="theme" icon="back" label="Back" onPress={back} />
      </View>
    </View>
  );
}

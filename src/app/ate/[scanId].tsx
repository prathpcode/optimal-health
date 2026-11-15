import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Fit } from '@engine/types';
import { CelebrationLayer } from '@/components/Celebration';
import { Icon, type IconName } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { attempt } from '@/components/together';
import { Button, VerdictDot } from '@/components/ui';
import { celebrate } from '@/lib/celebrate';
import { useActiveChallenges, useLogMeal, useMealForScan, useMyRooms } from '@/lib/community';
import { useScan } from '@/lib/scan';
import { useWhopAccount } from '@/lib/whop';
import { enterAt, radius, roomAccent, space, tint, useTheme } from '@/theme';

const CHEER: Record<Fit, { title: string; subtitle: string; tone: 'great' | 'good' | 'neutral' }> = {
  good: { title: '+2', subtitle: 'Good fit', tone: 'great' },
  okay: { title: '+1', subtitle: 'Okay, with notes', tone: 'good' },
  not_fit: { title: 'Logged', subtitle: 'Not a fit this time', tone: 'neutral' },
  cant_tell: { title: 'Logged', subtitle: 'We couldn’t tell for this one', tone: 'neutral' },
};

/** "What did you order?": pick the dish, see it count. Works without signing in. */
export default function AteSheet() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const { view } = useScan(scanId);
  const logged = useMealForScan(scanId);
  const log = useLogMeal();
  const active = useActiveChallenges();
  const rooms = useMyRooms();
  const { account } = useWhopAccount();
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const dishes = (() => {
    if (!view) return [];
    const byId = new Map(view.items.map((i) => [i.id, i]));
    const ranked = view.ranking.map((r) => byId.get(r.itemId)).filter((i): i is NonNullable<typeof i> => Boolean(i));
    const rest = view.items.filter((i) => !ranked.includes(i));
    return [...ranked, ...rest];
  })();

  const pick = async (itemId: string, name: string) => {
    const fit = view?.verdicts[itemId]?.fit ?? 'cant_tell';
    setBusy(itemId);
    let actual: Fit = fit;
    const ok = await attempt(log(scanId, itemId, name, fit).then((f) => (actual = f)));
    setBusy(null);
    if (!ok) return;
    const cheer = CHEER[actual];
    celebrate({ ...cheer, subtitle: active.length ? `${cheer.subtitle} · counts toward Eat what fits` : cheer.subtitle });
    setDone(itemId);
  };

  const room = account ? rooms[0] : undefined;
  const chosen = done ?? logged?.itemId;

  return (
    <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.xxxl, gap: space.xl }} showsVerticalScrollIndicator={false}>
      <View style={{ gap: space.xs }}>
        <T variant="title">What did you order?</T>
        {view?.restaurant ? <T tone="secondary">{view.restaurant}</T> : null}
      </View>

      <View style={{ gap: space.sm }}>
        {dishes.map((d, i) => {
          const fit = view?.verdicts[d.id]?.fit ?? null;
          const on = chosen === d.id;
          return (
            <Animated.View key={d.id} entering={enterAt(i, reduced)}>
              <Tap
                accessibilityRole="radio"
                accessibilityState={{ selected: on, busy: busy === d.id }}
                accessibilityLabel={d.name}
                feedback="select"
                scaleTo={0.98}
                disabled={busy !== null}
                onPress={() => void pick(d.id, d.name)}
                style={[styles.dish, { backgroundColor: on ? c.primary : c.cardMuted }]}>
                <VerdictDot fit={fit} size={10} />
                <T variant="bodyStrong" color={on ? c.onPrimary : c.text} style={{ flex: 1 }} numberOfLines={2}>
                  {d.name}
                </T>
                {on ? <Icon name="check" size={16} color={c.onPrimary} weight="bold" /> : null}
              </Tap>
            </Animated.View>
          );
        })}
      </View>

      {done ? (
        <Animated.View entering={FadeIn.delay(400)} style={{ gap: space.sm }}>
          {room ? (
            <Tap
              accessibilityRole="button"
              accessibilityLabel={`Tell ${room.title}`}
              feedback="tap"
              onPress={() => router.replace({ pathname: '/share/[scanId]', params: { scanId, room: room.slug } })}
              style={[styles.tell, { backgroundColor: tint(roomAccent[room.slug] ?? c.text, dark ? 0.2 : 0.11) }]}>
              <View style={[styles.tellIcon, { backgroundColor: roomAccent[room.slug] ?? c.text }]}>
                <Icon name={room.icon as IconName} size={15} color="#FFFFFF" />
              </View>
              <T variant="bodyStrong" style={{ flex: 1 }}>
                Tell {room.title} how it was
              </T>
              <Icon name="chevron" size={14} color={c.textTertiary} />
            </Tap>
          ) : null}
          <Button label="Done" onPress={() => router.back()} />
        </Animated.View>
      ) : null}
    </ScrollView>
    <CelebrationLayer local />
    </View>
  );
}

const styles = StyleSheet.create({
  dish: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md + 2, borderRadius: radius.md },
  tell: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md },
  tellIcon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});

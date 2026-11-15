import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { DURATION_OPTIONS_DAYS, ENTRY_OPTIONS_CENTS } from '@engine/challenge';
import { usd } from '@/components/challenge';
import { Icon, type IconName } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { attempt, GlassAction } from '@/components/together';
import { Button } from '@/components/ui';
import { createChallenge, payEntry } from '@/lib/community';
import { haptic } from '@/lib/haptics';
import { radius, space, useTheme } from '@/theme';

const DAY = 86_400_000;
const LENGTH_LABEL: Record<number, string> = { 3: '3 days', 7: '1 week', 14: '2 weeks' };
const STEPS = ['Select a prize', 'How long?', 'Check it over'] as const;
/** A race holds up to 50 players (convex/together.ts); the pool preview follows a count you choose. */
const MAX_PLAYERS = 50;

function midnight(offsetDays: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.getTime();
}

const shortDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/**
 * Start a race in three steps: the prize (what each player pays in; the winner takes the pool), how long it lasts,
 * then a summary to check. A race always starts tomorrow: never today, so everyone can pay in before the first dish
 * counts, and one fixed start keeps the only choice here the length. The race is created and then paid for in Whop's checkout; nobody is in it, you included, until
 * their payment is confirmed. Afterwards the invite sheet opens over the new race.
 */
export default function NewChallenge() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [stop, setStop] = useState<number>(ENTRY_OPTIONS_CENTS.indexOf(1000));
  const [players, setPlayers] = useState(4);
  const [days, setDays] = useState<number>(7);
  const [busy, setBusy] = useState(false);

  const entry = ENTRY_OPTIONS_CENTS[stop];
  const startsAt = midnight(1);
  const endsAt = startsAt + days * DAY - 1;

  const start = async () => {
    setBusy(true);
    let id = '';
    const ok = await attempt(
      createChallenge(days, startsAt, entry).then(async (x) => {
        id = x;
        // The race exists from here on. If paying fails or is abandoned, its screen offers to pay again.
        await payEntry(id);
      }),
    );
    setBusy(false);
    if (!id) return;
    router.replace({ pathname: '/challenge/[id]', params: { id } });
    // Paid or not, the next thing to do is get friends in: open the invite sheet over the new race.
    if (ok) setTimeout(() => router.push({ pathname: '/challenge/invite/[id]', params: { id } }), 600);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.xl, gap: space.xxl }} showsVerticalScrollIndicator={false}>
      <View style={{ gap: space.md }}>
        <View style={styles.progress} accessibilityLabel={`Step ${step + 1} of ${STEPS.length}`}>
          {step > 0 ? (
            <Tap accessibilityRole="button" accessibilityLabel="Back" onPress={() => setStep(step - 1)} disabled={busy} hitSlop={12} style={styles.back}>
              <ThemedIcon name="back" size={16} />
            </Tap>
          ) : null}
          {STEPS.map((_, i) => (
            <Dot key={i} on={i <= step} />
          ))}
        </View>
        <T variant="heroBold">{STEPS[step]}</T>
      </View>

      {step === 0 ? (
        <>
          <View style={styles.amount}>
            <T variant="display" style={styles.big}>
              {usd(entry)}
            </T>
            <T variant="bodyStrong" tone="secondary">
              per player
            </T>
          </View>
          <StopSlider stops={ENTRY_OPTIONS_CENTS} index={stop} onChange={setStop} label="Entry per player" format={usd} />
          <Pool players={players} onPlayers={setPlayers} cents={entry * players} />
          <Button label="Next" onPress={() => setStep(1)} />
        </>
      ) : null}

      {step === 1 ? (
        <>
          <View style={{ gap: space.md }}>
            {DURATION_OPTIONS_DAYS.map((d) => (
              <Length key={d} label={LENGTH_LABEL[d] ?? `${d} days`} ends={shortDay(startsAt + d * DAY - 1)} selected={days === d} onPress={() => setDays(d)} />
            ))}
          </View>
          <Button label="Next" onPress={() => setStep(2)} />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <View>
            <Row label="Entry" value={`${usd(entry)} per player`} first />
            <Row label="Winner" value="Takes the whole pool" />
            <Row label="Starts" value={`Tomorrow, ${shortDay(startsAt)}`} />
            <Row label="Ends" value={shortDay(endsAt)} />
          </View>
          <GlassAction label={`Pay ${usd(entry)} and start`} icon="lock" onPress={start} loading={busy} />
        </>
      ) : null}
    </ScrollView>
  );
}

function ThemedIcon({ name, size }: { name: IconName; size: number }) {
  const { c } = useTheme();
  return <Icon name={name} size={size} color={c.textSecondary} />;
}

function Dot({ on }: { on: boolean }) {
  const { c } = useTheme();
  return <View style={[styles.dot, { backgroundColor: on ? c.text : c.cardMuted }]} />;
}

const TRACK = 60;
const THUMB = TRACK - 8;

/**
 * A large slider that snaps to a list of stops: drag anywhere on the track, or tap a spot. The filled part ends in
 * the thumb. Each stop it passes gives a selection tick.
 */
function StopSlider({ stops, index, onChange, label, format }: { stops: readonly number[]; index: number; onChange: (i: number) => void; label: string; format: (v: number) => string }) {
  const { c } = useTheme();
  const last = stops.length - 1;
  const width = useSharedValue(0);
  const current = useSharedValue(index);

  const pick = (i: number) => {
    haptic.select();
    onChange(i);
  };
  const at = (x: number) => {
    'worklet';
    const span = Math.max(1, width.value - TRACK);
    const i = Math.round(Math.min(1, Math.max(0, (x - TRACK / 2) / span)) * last);
    if (i === current.value) return;
    current.value = i;
    scheduleOnRN(pick, i);
  };
  // Sideways drags only, so the sheet still scrolls and drags when the finger moves up or down.
  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .onStart((e) => at(e.x))
    .onUpdate((e) => at(e.x));
  const tap = Gesture.Tap().onEnd((e) => at(e.x));

  const position = useDerivedValue(() => withTiming(current.value / last, { duration: 110 }));
  const fill = useAnimatedStyle(() => ({ width: TRACK + position.value * Math.max(0, width.value - TRACK) }));

  const step = (by: number) => {
    const i = Math.min(last, Math.max(0, index + by));
    if (i === index) return;
    current.value = i;
    pick(i);
  };

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: format(stops[index]) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        onLayout={(e) => (width.value = e.nativeEvent.layout.width)}
        style={[styles.track, { backgroundColor: c.cardMuted }]}>
        <Animated.View style={[styles.fill, { backgroundColor: c.text }, fill]}>
          <View style={[styles.thumb, { backgroundColor: c.card }]} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/** The pool the winner would take with this many players paying in, and a stepper for how many. */
function Pool({ players, onPlayers, cents }: { players: number; onPlayers: (n: number) => void; cents: number }) {
  const { c } = useTheme();
  const set = (n: number) => {
    haptic.select();
    onPlayers(n);
  };
  return (
    <View style={[styles.pool, { backgroundColor: c.cardMuted }]}>
      <View style={{ flex: 1, gap: space.xxs }} accessible accessibilityLabel={`Winning pool ${usd(cents)} with ${players} players`}>
        <T variant="display">{usd(cents)}</T>
        <T variant="bodyStrong" tone="secondary">
          winning pool
        </T>
      </View>
      <View style={styles.stepper}>
        <Round label="Fewer players" icon="minus" disabled={players <= 2} onPress={() => set(players - 1)} />
        <View style={styles.count} accessible accessibilityLabel={`${players} players`}>
          <T variant="title" style={styles.num}>
            {players}
          </T>
          <T variant="caption" tone="secondary">
            players
          </T>
        </View>
        <Round label="More players" icon="plus" disabled={players >= MAX_PLAYERS} onPress={() => set(players + 1)} />
      </View>
    </View>
  );
}

function Round({ label, icon, disabled, onPress }: { label: string; icon: 'plus' | 'minus'; disabled: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} hitSlop={8}>
      <View style={[styles.round, { backgroundColor: c.card }]}>
        {icon === 'plus' ? <Icon name="plus" size={16} color={c.text} weight="bold" /> : <View style={[styles.minus, { backgroundColor: c.text }]} />}
      </View>
    </Tap>
  );
}

/** One length a race can last, as a large row: how long, and the day that makes it end. */
function Length({ label, ends, selected, onPress }: { label: string; ends: string; selected: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Tap accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${label}, ends ${ends}`} feedback="select" scaleTo={0.98} onPress={onPress}>
      <View style={[styles.length, { backgroundColor: selected ? c.primary : c.cardMuted }]}>
        <T variant="heading" color={selected ? c.onPrimary : c.text}>
          {label}
        </T>
        <T variant="bodyStrong" color={selected ? c.onPrimary : c.textSecondary}>
          Ends {ends}
        </T>
      </View>
    </Tap>
  );
}

function Row({ label, value, first }: { label: string; value: string; first?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.row, first ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline }]}>
      <T variant="body" tone="secondary">
        {label}
      </T>
      <T variant="bodyStrong" style={styles.value}>
        {value}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 24 },
  back: { marginRight: space.xs },
  dot: { width: 24, height: 4, borderRadius: 2 },
  num: { fontVariant: ['tabular-nums'] },
  amount: { alignItems: 'center', gap: space.xs },
  big: { fontSize: 72, lineHeight: 80, letterSpacing: -2 },
  track: { height: TRACK, borderRadius: TRACK / 2, overflow: 'hidden' },
  fill: { height: TRACK, borderRadius: TRACK / 2, alignItems: 'flex-end', justifyContent: 'center', paddingRight: (TRACK - THUMB) / 2 },
  thumb: { width: THUMB, height: THUMB, borderRadius: THUMB / 2 },
  pool: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.xl, borderRadius: radius.card },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  count: { alignItems: 'center', minWidth: 52 },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  minus: { width: 14, height: 2.5, borderRadius: 2 },
  length: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 68, paddingHorizontal: space.xl, borderRadius: radius.card },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg, paddingVertical: space.md },
  value: { flex: 1, textAlign: 'right' },
});

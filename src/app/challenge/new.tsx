import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { attempt } from '@/components/together';
import { Button, Chip, SectionLabel } from '@/components/ui';
import { CHALLENGE_TEMPLATES, DURATION_OPTIONS_DAYS, ENTRY_OPTIONS_CENTS, defaultShares } from '@engine/challenge';
import { createChallenge, money, MONEY_LIVE, useRoom } from '@/lib/community';
import { useWhopAccount } from '@/lib/whop';
import { radius, roomAccent, space, tint, useTheme } from '@/theme';

const DAY = 86_400_000;

function tomorrow() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() + DAY;
}

export default function NewChallenge() {
  const { room: slug } = useLocalSearchParams<{ room: string }>();
  const { room } = useRoom(slug);
  const { account } = useWhopAccount();
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const accent = roomAccent[slug] ?? c.text;

  const [template, setTemplate] = useState(CHALLENGE_TEMPLATES[0].id);
  const [days, setDays] = useState<number>(7);
  const [entry, setEntry] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    let id = '';
    const ok = await attempt(
      createChallenge({ room: slug, template, days, entryCents: entry, startsAt: tomorrow(), me: account?.name ?? 'You' }).then((x) => (id = x)),
    );
    setBusy(false);
    if (ok && id) router.replace({ pathname: '/challenge/[id]', params: { id } });
  };

  const firstPrize = Math.floor((entry * 6 * defaultShares(6)[0]) / 100);
  const summary = entry ? `Starts tomorrow · 6 players means ${money(firstPrize)} for 1st` : 'Starts tomorrow · for bragging rights';

  return (
    <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.xxxl, gap: space.xxl }} showsVerticalScrollIndicator={false}>
      <View style={{ gap: space.xs }}>
        <T variant="title">New challenge</T>
        {room ? (
          <T variant="bodyStrong" color={accent}>
            {room.title}
          </T>
        ) : null}
      </View>

      <View style={{ gap: space.sm }}>
        {CHALLENGE_TEMPLATES.map((x) => {
          const on = x.id === template;
          return (
            <Tap
              key={x.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={x.title}
              feedback="select"
              scaleTo={0.98}
              onPress={() => setTemplate(x.id)}
              style={[styles.option, { borderColor: on ? accent : c.hairline, backgroundColor: on ? tint(accent, dark ? 0.18 : 0.08) : c.card }]}>
              <View style={[styles.optIcon, { backgroundColor: on ? accent : c.cardMuted }]}>
                <Icon name={x.proof === 'scans' ? 'barcode' : 'calendar'} size={15} color={on ? '#FFFFFF' : c.textSecondary} />
              </View>
              <T variant="headline" style={{ flex: 1 }}>
                {x.title}
              </T>
              {on ? <Icon name="checkCircle" size={20} color={accent} /> : null}
            </Tap>
          );
        })}
      </View>

      <View style={{ gap: space.md }}>
        <SectionLabel>Length</SectionLabel>
        <View style={styles.chips}>
          {DURATION_OPTIONS_DAYS.map((d) => (
            <Chip key={d} label={`${d} days`} selected={days === d} onPress={() => setDays(d)} />
          ))}
        </View>
      </View>

      <View style={{ gap: space.md }}>
        <SectionLabel>Entry</SectionLabel>
        <View style={styles.chips}>
          {ENTRY_OPTIONS_CENTS.map((e) =>
            e && !MONEY_LIVE ? (
              <View key={e} style={[styles.locked, { borderColor: c.hairline }]} accessibilityLabel={`${money(e)}, coming soon`}>
                <Icon name="lock" size={11} color={c.textTertiary} />
                <T variant="bodyStrong" tone="tertiary">
                  {money(e)}
                </T>
              </View>
            ) : (
              <Chip key={e} label={money(e)} selected={entry === e} onPress={() => setEntry(e)} />
            ),
          )}
        </View>
      </View>

      <View style={{ gap: space.md }}>
        <T variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
          {summary}
        </T>
        <Button label="Create" onPress={create} loading={busy} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingRight: space.lg, borderRadius: radius.md, borderWidth: 1.5 },
  optIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  locked: { flexDirection: 'row', alignItems: 'center', gap: space.xs, height: 40, paddingHorizontal: space.lg, borderRadius: radius.chip, borderWidth: 1.5, borderStyle: 'dashed' },
});

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Rule } from '@engine/types';
import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { Button, Card } from '@/components/ui';
import { useDeviceId } from '@/lib/backend';
import { buyPack, checkPack, packPrice, type Pack } from '@/lib/packs';
import { LEVEL_LABEL } from '@/lib/verdict';
import { space, type Colors, useTheme } from '@/theme';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function levelColor(level: Rule['level'], c: Colors) {
  if (level === 'never') return { fg: c.notFit, bg: c.notFitSoft };
  if (level === 'avoid') return { fg: c.okay, bg: c.okaySoft };
  return { fg: c.textSecondary, bg: c.cantTellSoft };
}

/**
 * One pack: what it is, the rules it adds (opened on tap, before buying), and the way to get it. Buying opens
 * Whop's checkout; the card turns to "Added" only when the backend has confirmed the payment, which also puts the
 * pack's rules in the list below.
 */
export function PackCard({ pack }: { pack: Pack }) {
  const { c } = useTheme();
  const deviceId = useDeviceId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [returned, setReturned] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const owned = pack.state === 'owned';
  const count = `${pack.rules.length} ${pack.rules.length === 1 ? 'rule' : 'rules'}`;

  const buy = async () => {
    if (!deviceId || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const paid = await buyPack(deviceId, pack.id);
      if (!alive.current) return;
      setReturned(true);
      // Whop can take a few seconds to show a payment. Ask twice more, quietly; the webhook usually gets there first.
      if (!paid) for (const wait of [4000, 12000]) setTimeout(() => void checkPack(deviceId, pack.id), wait);
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <Card style={{ gap: space.md }}>
      <View style={{ gap: 2 }}>
        <T variant="headline">{pack.label}</T>
        <T variant="body" tone="secondary">
          {pack.blurb}
        </T>
      </View>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={`${open ? 'Hide' : 'Show'} the ${count} in the ${pack.label} pack`}
        accessibilityState={{ expanded: open }}
        feedback="select"
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        style={styles.packToggle}>
        <T variant="caption" tone="secondary" style={{ fontWeight: '600' }}>
          {count}
        </T>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="down" size={12} color={c.textSecondary} weight="bold" />
        </View>
      </Tap>
      {open ? (
        <View style={{ gap: space.sm }}>
          {pack.rules.map((r) => {
            const col = levelColor(r.level, c);
            return (
              <View key={r.tag} style={styles.packRule}>
                <View style={[styles.level, { backgroundColor: col.bg }]}>
                  <T variant="caption" color={col.fg} style={{ fontWeight: '600' }}>
                    {LEVEL_LABEL[r.level]}
                  </T>
                </View>
                <T variant="body" style={{ flex: 1 }}>
                  {capital(r.label)}
                </T>
              </View>
            );
          })}
          <T variant="caption" tone="tertiary">
            Source: {pack.source.title}
          </T>
        </View>
      ) : null}
      {owned ? (
        <View style={styles.packOwned} accessibilityLabel={`${pack.label} pack added. Its rules are in your list.`}>
          <Icon name="check" size={13} color={c.textSecondary} weight="bold" />
          <T variant="caption" tone="secondary" style={{ fontWeight: '600' }}>
            Added. Its rules are in your list on Manage.
          </T>
        </View>
      ) : (
        <>
          <Button label={`Get for ${packPrice(pack.priceCents)}`} onPress={buy} loading={busy} disabled={!deviceId} />
          {failed ? (
            <T variant="caption" color={c.okay}>
              The checkout could not be opened. Check your connection and try again.
            </T>
          ) : returned ? (
            <T variant="caption" tone="secondary">
              {"Waiting for Whop to confirm your payment. If you didn't finish paying, you can try again."}
            </T>
          ) : null}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  level: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, minWidth: 70, alignItems: 'center' },
  packToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  packRule: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  packOwned: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { Button, Card } from '@/components/ui';
import { useDeviceId } from '@/lib/backend';
import { buyPack, checkPack, packPrice, type Pack } from '@/lib/packs';
import { space, useTheme } from '@/theme';

/**
 * One pack: what it is, how many rules it adds, and the way to get it. The rules themselves are not shown before
 * buying (the backend does not send them): they are what is being sold. Buying opens
 * Whop's checkout; the card turns to "Added" only when the backend has confirmed the payment, which also puts the
 * pack's rules in the list below.
 */
export function PackCard({ pack }: { pack: Pack }) {
  const { c } = useTheme();
  const deviceId = useDeviceId();
  const [busy, setBusy] = useState(false);
  const [returned, setReturned] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const owned = pack.state === 'owned';
  const count = `${pack.ruleCount} ${pack.ruleCount === 1 ? 'rule' : 'rules'}`;

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
      <T variant="caption" tone="secondary" style={{ fontWeight: '600' }}>
        {count}
      </T>
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
  packOwned: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

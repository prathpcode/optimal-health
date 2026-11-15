import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GlassSurface } from '@/components/Glass';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { haptic } from '@/lib/haptics';
import { locate, locationBlocked } from '@/lib/location';
import { confirmRestaurant, useRestaurantConfirmed, type SetRestaurant } from '@/lib/scan';
import { duration, radius, space, useTheme } from '@/theme';

/**
 * Which restaurant this menu is from. The name read off the menu is confirmed once; with the phone's
 * location it identifies the place, and what its staff say about a dish is then remembered for the next scan there.
 * Without a location the answers still work, for this scan only, and the card says so.
 */
export function RestaurantCard({ scanId, name, restaurantId, setRestaurant }: { scanId: string; name?: string; restaurantId?: string; setRestaurant: SetRestaurant }) {
  const { c } = useTheme();
  const remembered = useRestaurantConfirmed(restaurantId);
  // Confirmed just now but with no location: there is no restaurant id to remember it by, so it holds for this screen.
  const [confirmedHere, setConfirmedHere] = useState(false);
  const known = remembered || confirmedHere;
  const [editing, setEditing] = useState(!name);
  const [draft, setDraft] = useState(name ?? '');
  const [busy, setBusy] = useState(false);
  // Set after a save that found no location: 'off' can be asked again, 'blocked' needs Settings.
  const [noLocation, setNoLocation] = useState<'off' | 'blocked' | null>(null);
  const [failed, setFailed] = useState(false);

  const save = async (value: string) => {
    const next = value.trim();
    if (!next || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      // The one place location is asked for: here it has an obvious purpose.
      const where = await locate({ ask: true });
      const id = await setRestaurant(scanId, next, where);
      if (id) {
        confirmRestaurant(id);
        setNoLocation(null);
        haptic.success();
      } else {
        setConfirmedHere(true);
        setNoLocation((await locationBlocked()) ? 'blocked' : 'off');
      }
      setEditing(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const startEditing = () => {
    setDraft(name ?? '');
    setEditing(true);
  };

  return (
    <Animated.View entering={FadeIn.duration(duration.base)} style={[styles.card, { backgroundColor: c.cardMuted }]}>
      <View style={styles.head}>
        {editing ? (
          <T variant="heading" style={{ flex: 1 }}>
            {name ? 'What is this restaurant called?' : 'Which restaurant is this?'}
          </T>
        ) : known ? (
          <T variant="heading" style={{ flex: 1 }} numberOfLines={1}>
            {name}
          </T>
        ) : (
          <T variant="heading" style={{ flex: 1 }} numberOfLines={2}>
            Is this {name}?
          </T>
        )}
        {busy ? <ActivityIndicator size="small" color={c.textSecondary} /> : null}
      </View>

      {editing ? (
        <View style={styles.editRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Restaurant name"
            placeholderTextColor={c.textTertiary}
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => save(draft)}
            style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.hairline }]}
            accessibilityLabel="Restaurant name"
          />
          <Tap accessibilityRole="button" accessibilityLabel="Save restaurant name" feedback="tap" disabled={!draft.trim() || busy} onPress={() => save(draft)} style={[styles.action, { backgroundColor: c.primary, opacity: draft.trim() ? 1 : 0.4 }]}>
            <T variant="bodyStrong" color={c.onPrimary}>
              Save
            </T>
          </Tap>
        </View>
      ) : known ? (
        <View style={styles.foot}>
          <T variant="caption" tone="secondary" style={{ flex: 1 }}>
            {remembered ? 'What the staff tell you here is remembered for your next visit.' : 'Your answers below apply to this scan.'}
          </T>
          <Tap accessibilityRole="button" accessibilityLabel="Change restaurant name" onPress={startEditing} hitSlop={8}>
            <T variant="caption" color={c.textSecondary} style={styles.link}>
              Change
            </T>
          </Tap>
        </View>
      ) : (
        <>
          <T variant="caption" tone="secondary">
            Confirm the name and what the staff tell you here is remembered for your next visit.
          </T>
          <View style={styles.buttons}>
            <Tap accessibilityRole="button" accessibilityLabel={`Yes, this is ${name}`} feedback="tap" disabled={busy} onPress={() => save(name ?? '')} style={[styles.action, { backgroundColor: c.primary }]}>
              <T variant="bodyStrong" color={c.onPrimary}>
                Yes
              </T>
            </Tap>
            <Tap accessibilityRole="button" accessibilityLabel="Change restaurant name" feedback="tap" disabled={busy} onPress={startEditing}>
              <GlassSurface tone="theme" interactive style={styles.action}>
                <T variant="bodyStrong">Change</T>
              </GlassSurface>
            </Tap>
          </View>
        </>
      )}

      {noLocation && !editing ? (
        <View style={styles.foot}>
          <T variant="caption" color={c.okay} style={{ flex: 1 }}>
            Location is off, so answers apply to this scan only.
          </T>
          <Tap
            accessibilityRole="button"
            accessibilityLabel={noLocation === 'blocked' ? 'Open Settings to turn on location' : 'Turn on location'}
            onPress={() => (noLocation === 'blocked' ? Linking.openSettings() : save(name ?? draft))}
            hitSlop={8}>
            <T variant="caption" color={c.textSecondary} style={styles.link}>
              {noLocation === 'blocked' ? 'Open Settings' : 'Turn on'}
            </T>
          </Tap>
        </View>
      ) : null}
      {failed ? (
        <T variant="caption" color={c.okay}>
          Couldn’t save that. Check your connection and try again.
        </T>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, padding: space.lg, gap: space.sm, marginTop: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: { flex: 1, height: 44, borderRadius: radius.button, borderWidth: 1.5, paddingHorizontal: space.lg, fontSize: 16 },
  buttons: { flexDirection: 'row', gap: space.sm },
  action: { height: 40, borderRadius: radius.chip, paddingHorizontal: space.xl, alignItems: 'center', justifyContent: 'center' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  link: { textDecorationLine: 'underline' },
});

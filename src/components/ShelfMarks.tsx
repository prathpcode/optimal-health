import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { GlassSurface } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import type { Rect } from '@/lib/layout';
import type { ShelfBox, ShelfState } from '@/lib/shelf';
import { duration, onPhoto, palette, radius, space } from '@/theme';

// Marks sit on the camera picture, so they use the light palette in both themes, like the boxes on a menu photo.
const light = palette.light;

/** What each mark says when a package is tapped. */
export const SHELF_STATE_TEXT: Record<ShelfState, string> = {
  good: 'Good fit',
  not_fit: 'Not a fit',
  cant_tell: 'Check before you buy',
  okay: 'Okay, with notes',
  unflagged: 'Nothing flagged so far',
  unknown: 'Looking it up',
};

function colour(state: ShelfState): string {
  if (state === 'good') return light.good;
  if (state === 'not_fit') return light.notFit;
  if (state === 'cant_tell') return light.cantTell;
  if (state === 'okay') return light.okay;
  return onPhoto.text;
}

/**
 * A box on each package the camera can read, laid over the live picture. Green is a good fit; red and grey break or
 * may break a rule; amber is okay with notes; a white box is a product whose careful check has not come back yet; a
 * dashed one is a package the app does not know. `rects` are the boxes already placed on the screen.
 */
export function ShelfMarks({ boxes, rects, picked, reduced, onPick }: { boxes: ShelfBox[]; rects: Rect[]; picked: ShelfBox | null; reduced: boolean; onPick: (box: ShelfBox) => void }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {boxes.map((b, i) => (
        <Mark key={`${i}-${b.key ?? 'x'}`} box={b} rect={rects[i]} reduced={reduced} picked={picked === b} onPress={() => onPick(b)} />
      ))}
    </View>
  );
}

function Mark({ box, rect, reduced, picked, onPress }: { box: ShelfBox; rect: Rect | undefined; reduced: boolean; picked: boolean; onPress: () => void }) {
  if (!rect) return null;
  const col = colour(box.state);
  const flagged = box.state === 'not_fit' || box.state === 'cant_tell';
  const unknown = box.state === 'unknown';
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(duration.fast)} style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
      <Tap accessibilityRole="button" accessibilityLabel={`${box.name ?? 'Unrecognised product'}, ${SHELF_STATE_TEXT[box.state]}`} feedback="select" hitSlop={4} scaleTo={0.97} onPress={onPress} style={StyleSheet.absoluteFill}>
        {/* A dark line outside the coloured one, so the box shows on a pale package as well as a dark one. */}
        <View style={[styles.halo, { borderRadius: radius.sm + 2 }]}>
          <View
            style={{
              flex: 1,
              borderRadius: radius.sm,
              borderColor: unknown ? 'rgba(255,255,255,0.9)' : col,
              // The picked box is marked by its heavier line alone; the others stay as they were.
              borderWidth: picked ? 7 : flagged ? 4.5 : unknown ? 2 : 3.5,
              borderStyle: (unknown || box.checking) && !picked ? 'dashed' : 'solid',
              backgroundColor: flagged ? `${col}59` : box.state === 'okay' || box.state === 'good' ? `${col}40` : unknown ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.2)',
            }}
          />
        </View>
        {flagged ? (
          <View style={[styles.badge, { backgroundColor: col }]}>
            <Icon name={box.state === 'not_fit' ? 'block' : 'question'} size={13} color={onPhoto.text} weight="bold" />
          </View>
        ) : null}
      </Tap>
    </Animated.View>
  );
}

/** What a tapped package is, why it is marked as it is, and the way through to its full result. */
export function ShelfCard({ box, opening, onOpen, onClose }: { box: ShelfBox; opening: boolean; onOpen: () => void; onClose: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(duration.base)} exiting={FadeOut.duration(duration.fast)} style={{ alignSelf: 'stretch' }}>
      <GlassSurface style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={[styles.dot, { backgroundColor: colour(box.state) }]} />
          <T variant="caption" color={onPhoto.textSecondary} style={{ flex: 1 }}>
            {SHELF_STATE_TEXT[box.state]}
            {box.checking ? (box.key ? ' · still checking' : ' · a first guess') : ''}
          </T>
          <Tap accessibilityRole="button" accessibilityLabel="Close" feedback="tap" hitSlop={12} onPress={onClose}>
            <Icon name="close" size={14} color={onPhoto.textSecondary} />
          </Tap>
        </View>
        <T variant="heading" color={onPhoto.text} numberOfLines={2}>
          {box.name ?? 'Finding out what this is'}
        </T>
        <T variant="body" color={onPhoto.textSecondary}>
          {box.reason ??
            (box.state === 'unknown'
              ? 'Keep it in view for a few seconds while it is looked up, or hold its barcode up to the camera.'
              : box.state === 'good'
                ? 'Nothing in its ingredients is against your rules.'
                : box.state === 'unflagged'
                  ? 'Nothing against your rules so far. Its ingredients are still being checked.'
                  : 'Open it for the notes.')}
        </T>
        {box.key ? (
          <Tap accessibilityRole="button" accessibilityLabel="See this product" feedback="tap" disabled={opening} onPress={onOpen} style={[styles.action, { backgroundColor: onPhoto.chip }]}>
            {opening ? (
              <ActivityIndicator color={onPhoto.chipText} />
            ) : (
              <T variant="bodyStrong" color={onPhoto.chipText}>
                See this product
              </T>
            )}
          </Tap>
        ) : null}
      </GlassSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  halo: { flex: 1, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.55)' },
  badge: { position: 'absolute', top: -9, left: -9, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: onPhoto.text },
  card: { borderRadius: radius.card, padding: space.xl, gap: space.sm },
  dot: { width: 9, height: 9, borderRadius: 5 },
  action: { height: 48, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center', marginTop: space.xs },
});

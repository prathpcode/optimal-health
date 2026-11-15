import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassButton, GlassSurface } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { useDeviceId } from '@/lib/backend';
import { haptic } from '@/lib/haptics';
import { boxToRect, coverRect, packageRects, type Rect } from '@/lib/layout';
import { goBack } from '@/lib/nav';
import { shelfStill, useShelfLook, type ShelfBox, type ShelfState } from '@/lib/shelf';
import { useStartBarcode } from '@/lib/upload';
import { duration, onPhoto, palette, radius, space } from '@/theme';

// Marks sit on the camera picture, so they use the light palette in both themes, like the boxes on a menu photo.
const light = palette.light;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What each mark says when a package is tapped. */
const STATE_TEXT: Record<ShelfState, string> = {
  good: 'Good fit',
  not_fit: 'Not a fit',
  cant_tell: 'Check before you buy',
  okay: 'Okay, with notes',
  unflagged: 'Nothing flagged so far',
  unknown: 'Not recognised yet',
};

function colour(state: ShelfState): string {
  if (state === 'good') return light.good;
  if (state === 'not_fit') return light.notFit;
  if (state === 'cant_tell') return light.cantTell;
  if (state === 'okay') return light.okay;
  return onPhoto.text;
}

/**
 * Point the camera along a shelf: stills go to the backend one after another (shelf.look) and each package it can
 * read gets a box. Green is a good fit; red and grey break or may break a rule; amber is okay with notes; a white box
 * is a product it recognises whose careful check has not come back yet; a dashed one is a package it does not know. Tapping a box
 * holds the picture and says what it is, with a way through to the full product result.
 */
export default function ShelfScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const deviceId = useDeviceId();
  const look = useShelfLook();
  const startBarcode = useStartBarcode();

  const [boxes, setBoxes] = useState<ShelfBox[]>([]);
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const [seen, setSeen] = useState(false);
  const [reading, setReading] = useState(true);
  const [failures, setFailures] = useState(0);
  const [picked, setPicked] = useState<ShelfBox | null>(null);
  const [opening, setOpening] = useState(false);

  // The loop reads these through refs, so it is started once and not torn down by every render.
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = picked !== null || opening;
  }, [picked, opening]);
  const live = ready && !!look && !!deviceId && permission?.granted === true;

  useEffect(() => {
    if (!live || !look || !deviceId) return;
    let alive = true;
    (async () => {
      while (alive) {
        if (pausedRef.current || !camera.current) {
          await sleep(200);
          continue;
        }
        try {
          const shot = await camera.current.takePictureAsync({ quality: 0.5, shutterSound: false });
          const still = await shelfStill(shot.uri);
          const answer = await look(still, deviceId);
          if (!alive) return;
          // A box was tapped while this still was on its way: keep what the person is looking at.
          if (!pausedRef.current) {
            setFrame({ width: still.width, height: still.height });
            setBoxes(answer.boxes);
          }
          setReading(answer.reading);
          setSeen(true);
          setFailures(0);
        } catch {
          if (!alive) return;
          setFailures((n) => n + 1);
          await sleep(800);
        }
        await sleep(150);
      }
    })();
    return () => {
      alive = false;
    };
  }, [live, look, deviceId]);

  // The preview fills the screen, so the still it was taken from is mapped onto the screen the same way.
  const view: Rect | null = useMemo(() => (frame ? coverRect({ width, height }, frame) : null), [frame, width, height]);
  // Each block of words, grown toward the package it is printed on (without running into its neighbours).
  const rects = useMemo(() => (view ? packageRects(boxes.map((b) => boxToRect(b.box, view))) : []), [boxes, view]);
  const counts = useMemo(() => ({ out: boxes.filter((b) => b.state === 'not_fit').length, ask: boxes.filter((b) => b.state === 'cant_tell').length, known: boxes.filter((b) => b.state !== 'unknown').length }), [boxes]);

  const pick = (box: ShelfBox) => {
    haptic.tap();
    setPicked(box);
  };

  const openProduct = async () => {
    if (!picked?.key || !startBarcode || !deviceId || opening) return;
    setOpening(true);
    try {
      const id = await startBarcode(picked.key, deviceId);
      router.push({ pathname: '/result/[id]', params: { id } });
      setPicked(null);
    } catch {
      haptic.error();
    } finally {
      setOpening(false);
    }
  };

  if (!permission) return <View style={styles.black} />;
  if (!permission.granted || !look) {
    const blocked = !permission.granted && !permission.canAskAgain;
    return (
      <View style={[styles.black, { paddingTop: insets.top + space.md, paddingHorizontal: space.xl }]}>
        <StatusBar style="light" />
        <GlassButton icon="close" label="Close" onPress={goBack} />
        <View style={styles.centre}>
          <T variant="title" color={onPhoto.text} style={{ textAlign: 'center' }}>
            {look ? 'Second Look needs the camera to look along a shelf' : 'The shelf view needs the backend'}
          </T>
          {look ? (
            <Tap accessibilityRole="button" accessibilityLabel={blocked ? 'Open Settings' : 'Allow camera'} feedback="tap" onPress={() => (blocked ? Linking.openSettings() : requestPermission())} style={styles.allow}>
              <T variant="headline" color={onPhoto.chipText}>
                {blocked ? 'Open Settings' : 'Allow camera'}
              </T>
            </Tap>
          ) : null}
        </View>
      </View>
    );
  }

  const status = !reading
    ? 'Text reading is switched off'
    : failures >= 3
      ? 'Can’t reach the backend'
      : !seen
        ? 'Looking'
        : counts.out || counts.ask
          ? [counts.out ? `${counts.out} not a fit` : null, counts.ask ? `${counts.ask} to check` : null].filter(Boolean).join(' · ')
          : counts.known
            ? 'Nothing flagged'
            : boxes.length
              ? 'No products recognised yet'
              : 'Point at a shelf';

  return (
    <View style={styles.black}>
      <StatusBar style="light" />
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} animateShutter={false} onCameraReady={() => setReady(true)} />

      {/* A box per package, laid over the live picture where the still saw it. */}
      {view ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {boxes.map((b, i) => (
            <Mark key={`${i}-${b.key ?? 'x'}`} box={b} rect={rects[i]} reduced={!!reduced} picked={picked === b} dimmed={picked !== null && picked !== b} onPress={() => pick(b)} />
          ))}
        </View>
      ) : null}

      <View style={[styles.top, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
        <GlassButton icon="close" label="Close" onPress={goBack} />
        <GlassSurface style={styles.pill}>
          {!seen && reading ? <ActivityIndicator size="small" color={onPhoto.text} /> : null}
          <Animated.View key={status} entering={FadeIn.duration(duration.base)}>
            <T variant="bodyStrong" color={onPhoto.text} numberOfLines={1}>
              {status}
            </T>
          </Animated.View>
        </GlassSurface>
        <GlassButton icon={torch ? 'flash' : 'flashOff'} label={torch ? 'Turn off light' : 'Turn on light'} onPress={() => setTorch((t) => !t)} />
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]} pointerEvents="box-none">
        {picked ? (
          <Animated.View entering={FadeIn.duration(duration.base)} exiting={FadeOut.duration(duration.fast)} style={{ alignSelf: 'stretch' }}>
            <GlassSurface style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <View style={[styles.dot, { backgroundColor: colour(picked.state) }]} />
                <T variant="caption" color={onPhoto.textSecondary} style={{ flex: 1 }}>
                  {STATE_TEXT[picked.state]}
                  {picked.checking ? ' · still checking' : ''}
                </T>
                <Tap accessibilityRole="button" accessibilityLabel="Close" feedback="tap" hitSlop={12} onPress={() => setPicked(null)}>
                  <Icon name="close" size={14} color={onPhoto.textSecondary} />
                </Tap>
              </View>
              <T variant="heading" color={onPhoto.text} numberOfLines={2}>
                {picked.name ?? 'A product Second Look doesn’t know yet'}
              </T>
              <T variant="body" color={onPhoto.textSecondary}>
                {picked.reason ??
                  (picked.state === 'unknown'
                    ? 'Scan its barcode once and it will be recognised on the shelf from then on.'
                    : picked.state === 'good'
                      ? 'Nothing in its ingredients is against your rules.'
                      : picked.state === 'unflagged'
                        ? 'Nothing against your rules so far. Its ingredients are still being checked.'
                        : 'Open it for the notes.')}
              </T>
              <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
                {picked.key ? (
                  <Tap accessibilityRole="button" accessibilityLabel="See this product" feedback="tap" disabled={opening} onPress={openProduct} style={[styles.action, { backgroundColor: onPhoto.chip }]}>
                    {opening ? <ActivityIndicator color={onPhoto.chipText} /> : <T variant="bodyStrong" color={onPhoto.chipText}>See this product</T>}
                  </Tap>
                ) : (
                  <Tap accessibilityRole="button" accessibilityLabel="Scan its barcode" feedback="tap" onPress={() => router.replace('/scan')} style={[styles.action, { backgroundColor: onPhoto.chip }]}>
                    <T variant="bodyStrong" color={onPhoto.chipText}>
                      Scan its barcode
                    </T>
                  </Tap>
                )}
              </View>
            </GlassSurface>
          </Animated.View>
        ) : (
          <>
            <GlassSurface style={styles.hintPill}>
              <T variant="caption" color={onPhoto.textSecondary} style={{ textAlign: 'center' }}>
                {seen ? 'Tap a box for the product.' : 'Stand an arm’s length from the shelf and hold steady.'}
              </T>
            </GlassSurface>
            <GlassButton icon="camera" label="Scan one item instead" onPress={() => router.replace('/scan')} size={50} />
          </>
        )}
      </View>
    </View>
  );
}

function Mark({ box, rect, reduced, picked, dimmed, onPress }: { box: ShelfBox; rect: Rect | undefined; reduced: boolean; picked: boolean; dimmed: boolean; onPress: () => void }) {
  if (!rect) return null;
  const col = colour(box.state);
  const flagged = box.state === 'not_fit' || box.state === 'cant_tell';
  const unknown = box.state === 'unknown';
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(duration.fast)} style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height, opacity: dimmed ? 0.3 : 1 }}>
      <Tap accessibilityRole="button" accessibilityLabel={`${box.name ?? 'Unrecognised product'}, ${STATE_TEXT[box.state]}`} feedback="select" hitSlop={4} scaleTo={0.97} onPress={onPress} style={StyleSheet.absoluteFill}>
        {/* A dark line outside the coloured one, so the box shows on a pale package as well as a dark one. */}
        <View style={[styles.halo, { borderRadius: radius.sm + 2 }]}>
          <View
            style={{
              flex: 1,
              borderRadius: radius.sm,
              borderColor: unknown ? 'rgba(255,255,255,0.9)' : col,
              borderWidth: picked ? 5 : flagged ? 4.5 : unknown ? 2 : 3.5,
              borderStyle: unknown || box.checking ? 'dashed' : 'solid',
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

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: onPhoto.black },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingBottom: 80 },
  allow: { backgroundColor: onPhoto.chip, borderRadius: radius.button, height: 54, paddingHorizontal: space.xxxl, alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg },
  pill: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 40, paddingHorizontal: space.lg, maxWidth: 250 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  hintPill: { paddingHorizontal: space.lg, paddingVertical: space.sm + 2, borderRadius: radius.md, maxWidth: 320 },
  card: { borderRadius: radius.card, padding: space.xl, gap: space.sm },
  dot: { width: 9, height: 9, borderRadius: 5 },
  halo: { flex: 1, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.55)' },
  badge: { position: 'absolute', top: -9, left: -9, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: onPhoto.text },

  action: { flex: 1, height: 48, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
});

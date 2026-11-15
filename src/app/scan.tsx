import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brackets } from '@/components/Brackets';
import { GlassButton, GlassSurface } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { ScanSweep } from '@/components/MenuOverlay';
import { ShelfCard, ShelfMarks } from '@/components/ShelfMarks';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { useDeviceId } from '@/lib/backend';
import { haptic } from '@/lib/haptics';
import { boxToRect, containRect, coverRect, packageRects, type Rect } from '@/lib/layout';
import { lastLocation, locate } from '@/lib/location';
import { goBack } from '@/lib/nav';
import { rememberPhoto, restartSample, SAMPLE_ID } from '@/lib/scan';
import { shelfStill, useShelfLook, type ShelfBox } from '@/lib/shelf';
import { prepareImage, useStartBarcode, useStartScan, type Prepared } from '@/lib/upload';
import { duration, onPhoto, radius, space, spring } from '@/theme';

type Phase = 'live' | 'capturing' | 'uploading' | 'error';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function ScanScreen() {
  // Started from a room's "Share a meal": the scan goes straight to picking what was ordered for that room.
  const { share } = useLocalSearchParams<{ share?: string }>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [phase, setPhase] = useState<Phase>('live');
  const [still, setStill] = useState<Prepared | null>(null);
  const [hint, setHint] = useState(true);
  const deviceId = useDeviceId();
  const startScan = useStartScan();
  const startBarcode = useStartBarcode();
  const barcodeSeen = useRef(false);
  const capturing = useRef(false);
  const flash = useSharedValue(0);
  const shutterInner = useSharedValue(1);

  // ---- Packages on a shelf. While the camera is simply open, it looks at what it is pointed at every so often
  // (shelf.look). When that is a shelf of packages, each one it can read gets a box, there and then; when it is
  // anything else, nothing is drawn and the camera is the same as it always was. Nobody has to choose a mode.
  const look = useShelfLook();
  const [shelfBoxes, setShelfBoxes] = useState<ShelfBox[]>([]);
  const [shelfFrame, setShelfFrame] = useState<{ width: number; height: number } | null>(null);
  const [picked, setPicked] = useState<ShelfBox | null>(null);
  const [opening, setOpening] = useState(false);
  // What the look loop reads without being restarted: whether to hold off, and the still it is taking (the shutter
  // waits for that one, since the camera takes one picture at a time).
  const holdRef = useRef(false);
  const lookShot = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    holdRef.current = phase !== 'live' || picked !== null || opening;
  }, [phase, picked, opening]);
  const canLook = ready && !!look && !!deviceId && permission?.granted === true;

  useEffect(() => {
    if (!canLook || !look || !deviceId) return;
    let alive = true;
    (async () => {
      // Give the person a moment to frame what they came to scan before anything else uses the camera.
      await sleep(1200);
      while (alive) {
        if (holdRef.current || capturing.current || barcodeSeen.current || !camera.current) {
          await sleep(250);
          continue;
        }
        let onShelf = false;
        try {
          const shot = camera.current.takePictureAsync({ quality: 0.5, shutterSound: false });
          lookShot.current = shot.catch(() => null);
          const still = await shelfStill((await shot).uri);
          lookShot.current = null;
          const answer = await look(still, deviceId);
          if (!alive) return;
          onShelf = answer.shelf;
          // A box was tapped, or a photo taken, while this still was on its way: leave the screen as it is.
          if (!holdRef.current) {
            setShelfFrame({ width: still.width, height: still.height });
            setShelfBoxes(answer.shelf ? answer.boxes : []);
          }
        } catch {
          lookShot.current = null;
          if (!alive) return;
          await sleep(1500);
        }
        // On a shelf, look again at once so the boxes keep up; otherwise only now and then.
        await sleep(onShelf ? 150 : 2500);
      }
    })();
    return () => {
      alive = false;
    };
  }, [canLook, look, deviceId]);

  // The preview fills the screen, so a still maps onto the screen the same way; then each block of words is grown
  // toward the package it is printed on.
  const shelfRects = useMemo(() => {
    if (!shelfFrame || !shelfBoxes.length) return [];
    const view = coverRect({ width, height }, shelfFrame);
    return packageRects(shelfBoxes.map((b) => boxToRect(b.box, view)));
  }, [shelfBoxes, shelfFrame, width, height]);
  const onShelf = shelfBoxes.length > 0 && phase === 'live';
  const shelfStatus = useMemo(() => {
    const out = shelfBoxes.filter((b) => b.state === 'not_fit').length;
    const ask = shelfBoxes.filter((b) => b.state === 'cant_tell').length;
    const good = shelfBoxes.filter((b) => b.state === 'good').length;
    if (out || ask) return [out ? `${out} not a fit` : null, ask ? `${ask} to check` : null].filter(Boolean).join(' · ');
    if (good) return `${good} good ${good === 1 ? 'fit' : 'fits'}`;
    return shelfBoxes.some((b) => b.state !== 'unknown') ? 'Checking' : 'Not recognised yet';
  }, [shelfBoxes]);

  const openPicked = async () => {
    if (!picked?.key || !startBarcode || !deviceId || opening) return;
    setOpening(true);
    try {
      const id = await startBarcode(picked.key, deviceId);
      setPicked(null);
      router.push({ pathname: '/result/[id]', params: { id, ...(share ? { share } : {}) } });
    } catch {
      haptic.error();
    } finally {
      setOpening(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 3200);
    return () => clearTimeout(t);
  }, []);

  // If location is already allowed, have it ready by the time the photo is taken. Nothing is asked here: the
  // result screen asks, at the moment it is useful (remembering what this restaurant says).
  useEffect(() => {
    locate();
  }, []);

  // The frame the brackets sit on: the target area while live, the photo's own bounds once captured.
  const liveFrame: Rect = useMemo(() => {
    const top = insets.top + 84;
    const bottom = height - insets.bottom - 200;
    return { x: space.xxl, y: top, width: width - space.xxl * 2, height: Math.max(200, bottom - top) };
  }, [width, height, insets.top, insets.bottom]);
  const stillRect = useMemo(() => (still ? containRect({ width, height }, still) : null), [still, width, height]);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const innerStyle = useAnimatedStyle(() => ({ transform: [{ scale: shutterInner.value }] }));

  const fail = () => {
    haptic.error();
    setPhase('error');
  };

  const submit = async (image: Prepared) => {
    if (!startScan) {
      // No backend in this build: show the bundled sample so the flow still demonstrates end to end.
      restartSample();
      router.replace({ pathname: '/result/[id]', params: { id: SAMPLE_ID } });
      return;
    }
    if (!deviceId) return fail();
    setPhase('uploading');
    try {
      const id = await startScan(image, deviceId, lastLocation());
      // Sharing a meal: go straight to picking what was ordered, which only needs the dish list. Otherwise the
      // result screen, with the local photo handed over so it draws before the record arrives.
      if (share) router.replace({ pathname: '/share/[scanId]', params: { scanId: id, room: share, fixed: '1' } });
      else router.replace({ pathname: '/result/[id]', params: { id, uri: image.uri, w: String(image.width), h: String(image.height) } });
    } catch {
      fail();
    }
  };

  // One camera, no mode picker (PLAN 5): a product barcode fires on its own with a haptic tap.
  const onBarcode = async ({ data }: { data: string }) => {
    if (!startBarcode || !deviceId || barcodeSeen.current || phase !== 'live' || capturing.current) return;
    barcodeSeen.current = true;
    haptic.success();
    setPhase('uploading');
    // Take a photo of the product at the same moment, so the scan has a picture (for Home and for sharing it).
    // It doesn't hold up the scan, and the scan still works from the barcode alone if the photo fails.
    const shot = camera.current
      ?.takePictureAsync({ quality: 0.7, shutterSound: false })
      .then((pic) => prepareImage(pic.uri))
      .catch(() => null);
    try {
      const id = await startBarcode(data, deviceId);
      void shot?.then((photo) => photo && rememberPhoto(id, photo));
      if (share) router.replace({ pathname: '/share/[scanId]', params: { scanId: id, room: share, fixed: '1' } });
      else router.replace({ pathname: '/result/[id]', params: { id } });
    } catch {
      barcodeSeen.current = false;
      fail();
    }
  };

  const capture = async () => {
    // A ref, not state: two taps in the same frame must not take two photos.
    if (!camera.current || !ready || phase !== 'live' || capturing.current) return;
    capturing.current = true;
    haptic.shutter();
    setPhase('capturing');
    shutterInner.set(withSequence(withTiming(0.86, { duration: 90 }), withSpring(1, spring.snappy)));
    flash.set(withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 260 })));
    setPicked(null);
    setShelfBoxes([]);
    try {
      // If the look loop is in the middle of a still, let it finish: the camera takes one picture at a time.
      await lookShot.current;
      const pic = await camera.current.takePictureAsync({ quality: 0.9, shutterSound: false });
      const prepared = await prepareImage(pic.uri);
      setStill(prepared);
      await submit(prepared);
    } catch {
      setStill(null);
      fail();
    } finally {
      capturing.current = false;
    }
  };

  const pickFromLibrary = async () => {
    if (phase === 'uploading' || phase === 'capturing') return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    setPhase('capturing');
    try {
      const prepared = await prepareImage(res.assets[0].uri);
      setStill(prepared);
      await submit(prepared);
    } catch {
      setStill(null);
      fail();
    }
  };

  const retake = () => {
    setStill(null);
    setPhase('live');
  };

  const busy = phase === 'capturing' || phase === 'uploading';

  // ---- Permission states ----
  if (!permission) return <View style={styles.black} />;
  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <View style={[styles.black, { paddingTop: insets.top + space.md, paddingHorizontal: space.xl }]}>
        <StatusBar style="light" />
        <GlassButton icon="close" label="Close" onPress={goBack} />
        <View style={styles.permission}>
          <View style={styles.permissionIcon}>
            <Icon name="camera" size={28} color={onPhoto.text} />
          </View>
          <T variant="title" color={onPhoto.text} style={{ textAlign: 'center' }}>
            Second Look needs the camera to read menus
          </T>
          <T color={onPhoto.textSecondary} style={{ textAlign: 'center' }}>
            Photos are only used to read the menu you point at.
          </T>
          <Tap
            accessibilityRole="button"
            accessibilityLabel={blocked ? 'Open Settings' : 'Allow camera'}
            feedback="tap"
            onPress={() => (blocked ? Linking.openSettings() : requestPermission())}
            style={styles.permissionButton}>
            <T variant="headline" color={onPhoto.chipText}>
              {blocked ? 'Open Settings' : 'Allow camera'}
            </T>
          </Tap>
          {busy ? (
            <View style={{ padding: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <ActivityIndicator color={onPhoto.text} />
              <T variant="bodyStrong" color={onPhoto.textSecondary}>
                Sending the photo
              </T>
            </View>
          ) : (
            <Tap accessibilityRole="button" accessibilityLabel="Choose a photo instead" onPress={pickFromLibrary} style={{ padding: space.md }}>
              <T variant="bodyStrong" color={onPhoto.textSecondary}>
                Choose a photo instead
              </T>
            </Tap>
          )}
          {phase === 'error' ? (
            <T variant="caption" color={onPhoto.textSecondary} style={{ textAlign: 'center' }}>
              Couldn’t send the photo. Check your connection and try again.
            </T>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.black}>
      <StatusBar style="light" />
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        animateShutter={false}
        onCameraReady={() => setReady(true)}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={startBarcode && phase === 'live' ? onBarcode : undefined}
      />

      {/* Frozen photo, drawn exactly as the result screen will draw it, so the hand-off has no jump. */}
      {still ? (
        <Animated.View entering={FadeIn.duration(duration.fast)} style={[StyleSheet.absoluteFill, { backgroundColor: onPhoto.black }]}>
          <Image source={{ uri: still.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
          {stillRect ? <ScanSweep photo={stillRect} active={busy} /> : null}
        </Animated.View>
      ) : null}

      {/* On a shelf the boxes are the frame: the brackets and the framing hint step aside. */}
      {onShelf ? <ShelfMarks boxes={shelfBoxes} rects={shelfRects} picked={picked} reduced={!!reduced} onPick={(b) => (haptic.tap(), setPicked(b))} /> : <Brackets rect={stillRect ?? liveFrame} breathing={phase === 'live'} />}

      {hint && phase === 'live' && !onShelf ? (
        <Animated.View entering={FadeIn.delay(400)} exiting={FadeOut.duration(duration.base)} style={[styles.hint, { top: liveFrame.y + liveFrame.height / 2 - 18 }]} pointerEvents="none">
          <GlassSurface style={styles.hintPill}>
            <T variant="bodyStrong" color={onPhoto.text}>
              Fit the menu or label inside the frame
            </T>
          </GlassSurface>
        </Animated.View>
      ) : null}

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: onPhoto.text }, flashStyle]} />

      {/* Top bar */}
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        <GlassButton icon="close" label="Close" onPress={goBack} />
        {onShelf ? (
          <GlassSurface style={styles.shelfPill}>
            <Animated.View key={shelfStatus} entering={FadeIn.duration(duration.base)}>
              <T variant="bodyStrong" color={onPhoto.text} numberOfLines={1}>
                {shelfStatus}
              </T>
            </Animated.View>
          </GlassSurface>
        ) : (
          <T variant="headline" color={onPhoto.text}>
            {phase === 'uploading' ? 'Sending' : 'Scan'}
          </T>
        )}
        <GlassButton icon={torch ? 'flash' : 'flashOff'} label={torch ? 'Turn off light' : 'Turn on light'} onPress={() => setTorch((t) => !t)} />
      </View>

      {/* Bottom controls */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.xl }]}>
        {phase === 'error' ? (
          <Animated.View entering={reduced ? FadeIn : FadeIn.springify()} style={styles.errorCard}>
            <Icon name="warning" size={18} color={onPhoto.chipText} />
            <T variant="bodyStrong" color={onPhoto.chipText} style={{ flex: 1 }}>
              Couldn’t send the photo. Check your connection.
            </T>
            <Tap accessibilityRole="button" accessibilityLabel="Try again" feedback="tap" onPress={still ? () => submit(still) : retake} style={styles.errorButton}>
              <T variant="bodyStrong" color={onPhoto.text}>
                Retry
              </T>
            </Tap>
          </Animated.View>
        ) : null}

        {picked && onShelf ? (
          <View style={{ alignSelf: 'stretch', paddingHorizontal: space.lg }}>
            <ShelfCard box={picked} opening={opening} onOpen={openPicked} onClose={() => setPicked(null)} />
          </View>
        ) : null}

        <View style={[styles.shutterRow, picked && onShelf ? { display: 'none' } : null]}>
          <GlassButton icon="photos" label="Choose from photos" onPress={pickFromLibrary} size={50} />
          <Tap accessibilityRole="button" accessibilityLabel="Take photo" onPress={phase === 'error' ? retake : capture} disabled={!ready && phase === 'live'} scaleTo={0.92}>
            <View style={styles.shutter}>
              {busy ? (
                <ActivityIndicator color={onPhoto.text} size="large" />
              ) : phase === 'error' ? (
                <Icon name="retry" size={28} color={onPhoto.chipText} />
              ) : (
                <Animated.View style={[styles.shutterInner, innerStyle]} />
              )}
            </View>
          </Tap>
          <View style={{ width: 50 }} />
        </View>

        {picked && onShelf ? null : (
          <T variant="caption" color={onPhoto.textSecondary}>
            {onShelf ? 'Tap a box for the product' : 'Menu, shelf, item or barcode'}
          </T>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: onPhoto.black },
  top: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg },
  hint: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hintPill: { paddingHorizontal: space.lg, paddingVertical: space.sm + 2 },
  shelfPill: { height: 40, paddingHorizontal: space.lg, justifyContent: 'center', maxWidth: 240 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: space.xl },
  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', paddingHorizontal: space.xxxl + space.sm },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: onPhoto.text, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: onPhoto.text },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: onPhoto.chip,
    borderRadius: radius.md,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    paddingVertical: space.xs,
    marginHorizontal: space.xl,
  },
  errorButton: { backgroundColor: onPhoto.chipText, borderRadius: radius.button - 4, paddingHorizontal: space.lg, paddingVertical: space.sm + 2 },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingBottom: 80 },
  permissionIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: onPhoto.glassFallback, marginBottom: space.sm },
  permissionButton: { marginTop: space.lg, backgroundColor: onPhoto.chip, borderRadius: radius.button, height: 54, paddingHorizontal: space.xxxl, alignItems: 'center', justifyContent: 'center' },
});

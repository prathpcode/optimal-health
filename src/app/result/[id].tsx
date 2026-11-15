import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View, type HostInstance, type ScrollViewInstance } from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Fit, Item, RankedItem, ScanQuestion } from '@engine/types';
import { AnswerButtons } from '@/components/AnswerButtons';
import { GlassButton, GlassSurface } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { MenuOverlay, ScanSweep } from '@/components/MenuOverlay';
import { ProductResult } from '@/components/ProductResult';
import { RestaurantCard } from '@/components/RestaurantCard';
import { Sheet, type SheetHandle } from '@/components/Sheet';
import { ShareCard } from '@/components/together';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { Button, Card, SectionLabel, Skeleton, VerdictDot } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { containRect } from '@/lib/layout';
import { SAMPLE_ID, useScan, useSetRestaurant, type Answer, type ScanView } from '@/lib/scan';
import { fitColor, SECTION_FIT, SECTION_LABEL } from '@/lib/verdict';
import { duration, ease, enterAt, onPhoto, radius, space, spring, useTheme } from '@/theme';

const SNAPS = [0.34, 0.62, 0.93];
const SECTIONS: RankedItem['section'][] = ['best', 'okay', 'cant_tell', 'not_fit'];

/**
 * What the pill says at each stage (PLAN 7.1): dish names arrive while judging, then provisional verdicts
 * ("checking"), then confirmed verdicts and questions (ranking), then the wording (explaining, done).
 */
function statusText(view: ScanView | undefined): string {
  const status = view?.status ?? 'reading';
  const product = view?.kind === 'product' || view?.kind === 'label';
  if (status === 'reading') return view?.kind === 'product' ? 'Looking it up' : view?.kind === 'label' ? 'Reading the label' : 'Reading';
  if (status === 'judging') return view?.provisional ? (product ? 'Checking' : 'Checking each dish') : view?.items.length ? 'Checking your rules' : product ? 'Reading the label' : 'Reading the menu';
  if (status === 'ranking') return 'Confirming';
  if (status === 'explaining') return 'Writing it up';
  if (status === 'failed') return 'Couldn’t read this';
  return '';
}

export default function ResultScreen() {
  const params = useLocalSearchParams<{ id: string; uri?: string; w?: string; h?: string }>();
  const id = params.id;
  const { view, answer } = useScan(id);
  const setRestaurant = useSetRestaurant();
  const { c } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const sheet = useRef<SheetHandle>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const content = useRef<HostInstance>(null);
  const rowRefs = useRef<Record<string, HostInstance | null>>({});
  const [selected, setSelected] = useState<string | null>(null);

  // ---- Photo placement: drawn full screen (matching the scanner's frozen frame), then eased into the space above
  // the sheet. Moving it with a transform keeps the hand-off seamless.
  const handoff = params.uri && params.w && params.h ? { uri: params.uri, width: Number(params.w), height: Number(params.h) } : null;
  const image = view ? { width: view.imageWidth, height: view.imageHeight } : handoff;
  const photo = handoff ? { uri: handoff.uri } : view?.photo;
  const full = useMemo(() => (image ? containRect({ width, height }, image) : null), [image?.width, image?.height, width, height]); // eslint-disable-line react-hooks/exhaustive-deps
  const area = useMemo(() => {
    const top = insets.top + 60;
    const bottom = height * (1 - SNAPS[0]) + 6;
    return { top, height: bottom - top };
  }, [insets.top, height]);
  const target = useMemo(() => {
    if (!image) return null;
    const r = containRect({ width: width - space.lg * 2, height: area.height }, image);
    return { ...r, x: r.x + space.lg, y: r.y + area.top };
  }, [image?.width, image?.height, width, area]); // eslint-disable-line react-hooks/exhaustive-deps

  const settle = useSharedValue(0);
  useEffect(() => {
    if (!target) return;
    settle.value = reduced ? withTiming(1, { duration: duration.base }) : withSpring(1, { ...spring.gentle, damping: 26 });
  }, [target, reduced, settle]);

  const photoStyle = useAnimatedStyle(() => {
    if (!full || !target) return {};
    const s = 1 + (target.width / full.width - 1) * settle.value;
    const tx = (target.x + target.width / 2 - (full.x + full.width / 2)) * settle.value;
    const ty = (target.y + target.height / 2 - (full.y + full.height / 2)) * settle.value;
    return { transform: [{ translateX: tx }, { translateY: ty }, { scale: s }] };
  });

  // Chips are laid out for the settled photo, so they appear only once it has arrived there.
  const overlayStyle = useAnimatedStyle(() => ({ opacity: interpolate(settle.value, [0.9, 1], [0, 1], Extrapolation.CLAMP) }));

  // ---- Haptics as the result lands
  const status = view?.status;
  const hasNotFit = view ? Object.values(view.verdicts).some((v) => v.fit === 'not_fit') : false;
  const warned = useRef(false);
  const lastStatus = useRef(status);
  useEffect(() => {
    if (hasNotFit && !warned.current) {
      warned.current = true;
      setTimeout(haptic.warning, 350);
    }
  }, [hasNotFit]);
  useEffect(() => {
    if (status === lastStatus.current) return;
    if (status === 'done' && lastStatus.current) haptic.success();
    if (status === 'failed') haptic.error();
    lastStatus.current = status;
  }, [status]);

  const selectDish = (itemId: string) => {
    setSelected(itemId);
    sheet.current?.snapTo(1);
    const row = rowRefs.current[itemId];
    if (row && content.current) {
      row.measureLayout(content.current, (_x, y) => scroll.current?.scrollTo({ y: Math.max(0, y - space.md), animated: true }), () => {});
    }
  };

  const opening = useRef(false);
  const openDish = (itemId: string) => {
    if (opening.current) return;
    opening.current = true;
    router.push({ pathname: '/dish/[scanId]/[itemId]', params: { scanId: id, itemId } });
    setTimeout(() => (opening.current = false), 800);
  };

  // A barcode or label scan is about one product: it gets its own layout, and the sheet opens taller.
  const isProduct = view?.kind === 'product' || view?.kind === 'label';
  useEffect(() => {
    if (isProduct) sheet.current?.snapTo(1);
  }, [isProduct]);

  if (view === null) return <Missing />;

  const working = !!view && view.status !== 'done' && view.status !== 'failed';
  const failed = view?.status === 'failed';
  const itemsById = new Map((view?.items ?? []).map((i) => [i.id, i]));

  return (
    <View style={{ flex: 1, backgroundColor: onPhoto.black }}>
      <StatusBar style="light" />

      {/* Photo + sweep, moved as one */}
      {photo && full ? (
        <Animated.View style={[StyleSheet.absoluteFill, photoStyle]} pointerEvents="none">
          <Image source={photo} style={StyleSheet.absoluteFill} contentFit="contain" />
          <ScanSweep photo={full} active={!view || view.status === 'reading' || view.status === 'judging'} />
        </Animated.View>
      ) : view === undefined ? (
        <View style={styles.center}>
          <ActivityIndicator color={onPhoto.text} />
        </View>
      ) : (
        // No photo on this device (or a barcode scan): a quiet backdrop with what was scanned.
        <View style={[styles.noPhoto, { top: insets.top + 64, height: height * (1 - SNAPS[isProduct ? 1 : 0]) - insets.top - 80 }]} pointerEvents="none">
          <Icon name={view.kind === 'menu' ? 'menu' : 'barcode'} size={34} color={onPhoto.textSecondary} />
          <T variant="title" color={onPhoto.text} style={{ textAlign: 'center' }} numberOfLines={2}>
            {view.restaurant || view.items[0]?.name || 'Your scan'}
          </T>
        </View>
      )}

      {/* Verdict chips over the dishes */}
      {view && target && !failed && !isProduct ? (
        <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]} pointerEvents="box-none">
          {view.items.some((i) => i.position?.length) ? (
            <MenuOverlay photo={target} bounds={{ width, height: area.top + area.height }} items={view.items} verdicts={view.verdicts} rules={view.rules} provisional={view.provisional} selectedId={selected} onSelect={selectDish} />
          ) : (
            // No dish positions (they need on-device text recognition): verdict chips in a row over the photo.
            <ChipRow view={view} bottom={height - (area.top + area.height) + space.md} selectedId={selected} onSelect={selectDish} />
          )}
        </Animated.View>
      ) : null}

      {/* Top bar */}
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
        <GlassButton icon="close" label="Close" onPress={() => router.back()} />
        <StatusPill view={view} />
        <View style={{ width: 44 }} />
      </View>

      <Sheet
        ref={sheet}
        snaps={SNAPS}
        initial={0}
        header={<SheetHeader view={view} working={working} failed={failed} isProduct={isProduct} />}>
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: height * (1 - SNAPS[0]) + insets.bottom + space.xxxl }}
          showsVerticalScrollIndicator={false}>
          <View ref={content}>
          {failed ? (
            <FailedCard message={view?.error} />
          ) : (
            <>
              {view?.generic ? <Banner icon="person" text="This is a general answer. Add your allergies and medicines in Me for one that fits you." onPress={() => router.dismissTo('/me')} /> : null}
              {view?.notice ? <Banner icon="note" text={view.notice} /> : null}

              {/* Offered only once the scan has finished: until then the pipeline is still writing the record. */}
              {view && setRestaurant && id !== SAMPLE_ID && view.kind === 'menu' && view.status === 'done' ? (
                <RestaurantCard scanId={id} name={view.restaurant} restaurantId={view.restaurantId} setRestaurant={setRestaurant} />
              ) : null}

              {view && isProduct ? (
                <ProductResult view={view} onAnswer={answer} />
              ) : null}

              {view && !isProduct && view.ranking.length > 0
                ? SECTIONS.map((section) => {
                    const rows = view.ranking.filter((r) => r.section === section);
                    if (rows.length === 0) return null;
                    return (
                      <Animated.View key={section} layout={reduced ? undefined : LinearTransition.springify().damping(22)} style={{ marginTop: space.lg }}>
                        <SectionLabel style={{ marginBottom: space.sm }}>{SECTION_LABEL[section]}</SectionLabel>
                        <Card style={{ padding: 0, overflow: 'hidden' }}>
                          {rows.map((row, i) => (
                            <View
                              key={row.itemId}
                              ref={(el) => {
                                rowRefs.current[row.itemId] = el;
                              }}>
                              <DishRow
                                index={i}
                                item={itemsById.get(row.itemId)}
                                row={row}
                                selected={selected === row.itemId}
                                provisional={view.provisional}
                                divider={i > 0}
                                onPress={() => openDish(row.itemId)}
                              />
                            </View>
                          ))}
                        </Card>
                      </Animated.View>
                    );
                  })
                : working && !isProduct
                  ? <ListSkeleton count={Math.max(3, view?.items.length ?? 0)} names={view?.items.map((i) => i.name) ?? []} />
                  : null}

              {view && !isProduct && view.questions.length > 0 ? (
                <Animated.View entering={enterAt(2, reduced)} layout={reduced ? undefined : LinearTransition.springify().damping(22)} style={{ marginTop: space.xxl }}>
                  <View style={styles.askHeader}>
                    <Icon name="server" size={16} color={c.textSecondary} />
                    <SectionLabel>Ask your server</SectionLabel>
                  </View>
                  <Card style={{ gap: space.xl }}>
                    {view.questions.map((q, i) => (
                      <QuestionRow key={q.id} q={q} item={itemsById.get(q.itemId)} divider={i > 0} onAnswer={(v) => answer(q.id, v)} />
                    ))}
                  </Card>
                </Animated.View>
              ) : null}

              {view?.status === 'done' && view.items.length > 0 ? (
                <Animated.View entering={FadeIn.delay(300)} style={{ marginTop: space.xxl }}>
                  <ShareCard scanId={id} />
                </Animated.View>
              ) : null}

              {view?.status === 'done' ? (
                <Animated.View entering={FadeIn.delay(200)} style={styles.footer}>
                  <Button label="Scan again" variant="secondary" icon="camera" onPress={() => router.replace('/scan')} style={{ flex: 1 }} />
                  <Button label="Done" onPress={() => router.back()} style={{ flex: 1 }} />
                </Animated.View>
              ) : null}
            </>
          )}
          </View>
        </ScrollView>
      </Sheet>
    </View>
  );
}

function StatusPill({ view }: { view: ScanView | undefined }) {
  const status = view?.status ?? 'reading';
  const working = status !== 'done' && status !== 'failed';
  const product = view?.kind === 'product' || view?.kind === 'label';
  const count = view?.items.length ?? 0;
  const done = product ? view?.items[0]?.name || 'Done' : view?.restaurant || `${count} ${count === 1 ? 'dish' : 'dishes'}`;
  const label = status === 'done' ? done : statusText(view);
  return (
    <GlassSurface style={styles.pill}>
      {working ? <ActivityIndicator size="small" color={onPhoto.text} /> : status === 'done' ? <Icon name="checkCircle" size={15} color={onPhoto.text} /> : <Icon name="warning" size={15} color={onPhoto.text} />}
      <Animated.View key={label} entering={FadeIn.duration(duration.base)} exiting={FadeOut.duration(duration.fast)}>
        <T variant="bodyStrong" color={onPhoto.text} numberOfLines={1}>
          {label}
        </T>
      </Animated.View>
    </GlassSurface>
  );
}

function SheetHeader({ view, working, failed, isProduct }: { view: ScanView | undefined; working: boolean; failed: boolean; isProduct: boolean }) {
  const { c } = useTheme();
  const counts = useMemo(() => {
    const ranking = view?.ranking ?? [];
    return {
      good: ranking.filter((r) => r.section === 'best' || r.section === 'okay').length,
      ask: ranking.filter((r) => r.section === 'cant_tell').length,
      out: ranking.filter((r) => r.section === 'not_fit').length,
    };
  }, [view?.ranking]);

  if (failed) {
    return (
      <T variant="title" style={{ marginBottom: space.xs }}>
        Couldn’t read this
      </T>
    );
  }
  return (
    <View style={{ gap: space.md }}>
      {view?.summary ? (
        <Animated.View entering={FadeIn.duration(duration.slow)}>
          <T variant="headline" style={{ lineHeight: 23 }}>
            {view.summary}
          </T>
        </Animated.View>
      ) : (
        <View style={{ gap: space.sm, paddingVertical: 2 }}>
          <Skeleton width="92%" height={15} />
          <Skeleton width="64%" height={15} />
        </View>
      )}
      {isProduct && !working ? null : (
      <View style={isProduct ? styles.productCounters : styles.counters}>
        {view && view.ranking.length > 0 && !isProduct ? (
          <>
            {view.provisional ? <CheckingTag /> : null}
            <Counter n={counts.good} label="Fit you" color={c.good} soft={c.goodSoft} index={0} />
            <Counter n={counts.ask} label="Ask first" color={c.cantTell} soft={c.cantTellSoft} index={1} />
            <Counter n={counts.out} label="Not a fit" color={c.notFit} soft={c.notFitSoft} index={2} />
          </>
        ) : working && !(isProduct && view?.verdicts && Object.keys(view.verdicts).length) ? (
          <Stepper view={view} />
        ) : null}
      </View>
      )}
    </View>
  );
}

/** Three short bars that fill as the pipeline moves: reading, checking, confirming. */
function Stepper({ view }: { view: ScanView | undefined }) {
  const status = view?.status ?? 'reading';
  const at = status === 'reading' || (status === 'judging' && !view?.items.length) ? 0 : status === 'judging' ? 1 : 2;
  return (
    <View style={{ flex: 1, gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <StepBar key={i} state={i < at ? 'done' : i === at ? 'active' : 'todo'} />
        ))}
      </View>
      <T variant="caption" tone="secondary">
        {statusText(view)}
        {at === 0 ? ' · this takes a few seconds' : ''}
      </T>
    </View>
  );
}

function StepBar({ state }: { state: 'done' | 'active' | 'todo' }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const fill = useSharedValue(state === 'done' ? 1 : 0);
  useEffect(() => {
    if (state === 'done') fill.value = withTiming(1, { duration: duration.base, easing: ease });
    else if (state === 'active' && !reduced) fill.value = withSequence(withTiming(0, { duration: 0 }), withTiming(0.85, { duration: 9000, easing: ease }));
    else fill.value = 0;
  }, [state, reduced, fill]);
  const style = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: c.cardMuted, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', borderRadius: 3, backgroundColor: c.text }, style]} />
    </View>
  );
}

function Counter({ n, label, color, soft, index }: { n: number; label: string; color: string; soft: string; index: number }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={enterAt(index, reduced)} style={[styles.counter, { backgroundColor: soft }]}>
      <T variant="headline" color={color} style={{ fontVariant: ['tabular-nums'] }}>
        {n}
      </T>
      <T variant="caption" color={color}>
        {label}
      </T>
    </Animated.View>
  );
}

function DishRow({ index, item, row, selected, provisional, divider, onPress }: { index: number; item?: Item; row: RankedItem; selected: boolean; provisional: boolean; divider: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const fit = SECTION_FIT[row.section];
  const highlight = useSharedValue(0);
  useEffect(() => {
    if (selected) highlight.value = withSequence(withTiming(1, { duration: 160 }), withTiming(0.35, { duration: 900 }));
    else highlight.value = withTiming(0, { duration: 300 });
  }, [selected, highlight]);
  const bg = useAnimatedStyle(() => ({ opacity: highlight.value }));

  return (
    <Animated.View entering={enterAt(index, reduced)}>
      {divider ? <View style={[styles.divider, { backgroundColor: c.hairline }]} /> : null}
      <Tap accessibilityRole="button" accessibilityLabel={`${item?.name ?? 'Dish'}. ${row.line}`} onPress={onPress} scaleTo={0.985}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fitColor(fit, c).soft }, bg]} />
        <View style={styles.row}>
          <View style={{ paddingTop: 6 }}>
            <VerdictDot fit={fit} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <T variant="headline" numberOfLines={1} style={{ flexShrink: 1 }}>
                {item?.name ?? 'Dish'}
              </T>
              {provisional ? <CheckingTag small /> : null}
            </View>
            <T variant="body" tone="secondary" numberOfLines={2}>
              {row.line}
            </T>
            {row.modification ? (
              <View style={styles.mod}>
                <Icon name="sparkle" size={12} color={c.good} />
                <T variant="caption" color={c.good} style={{ flex: 1 }} numberOfLines={2}>
                  {row.modification}
                </T>
              </View>
            ) : null}
          </View>
          <Icon name="chevron" size={13} color={c.textTertiary} />
        </View>
      </Tap>
    </Animated.View>
  );
}

/** "checking…" marker for provisional verdicts (PLAN 7.1): shown until the careful check confirms them. */
function CheckingTag({ small }: { small?: boolean }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduced) o.value = withRepeat(withSequence(withTiming(0.45, { duration: 650 }), withTiming(1, { duration: 650 })), -1);
  }, [o, reduced]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View entering={FadeIn.duration(duration.fast)} exiting={FadeOut.duration(duration.base)} style={[small ? styles.checkingSmall : styles.checking, { backgroundColor: c.cardMuted }, anim]}>
      <T variant={small ? 'micro' : 'caption'} tone="secondary">
        checking…
      </T>
    </Animated.View>
  );
}

/** Verdict chips in a wrapping row over the photo, for scans without dish positions. */
function ChipRow({ view, bottom, selectedId, onSelect }: { view: ScanView; bottom: number; selectedId: string | null; onSelect: (id: string) => void }) {
  const reduced = useReducedMotion();
  const rows = view.ranking.length ? view.ranking.map((r) => ({ id: r.itemId, fit: SECTION_FIT[r.section] as Fit | null })) : view.items.map((i) => ({ id: i.id, fit: null as Fit | null }));
  const names = new Map(view.items.map((i) => [i.id, i.name]));
  return (
    <View pointerEvents="box-none" style={[styles.chipRow, { bottom }]}>
      {rows.slice(0, 12).map((r, i) => (
        <Animated.View key={r.id} entering={reduced ? FadeIn : ZoomIn.springify().damping(14).delay(i * 40)} layout={reduced ? undefined : LinearTransition.springify().damping(20)}>
          <Tap accessibilityRole="button" accessibilityLabel={names.get(r.id) ?? 'Dish'} feedback="select" scaleTo={0.94} onPress={() => onSelect(r.id)}>
            <View style={[styles.lensChip, selectedId === r.id ? styles.lensChipSelected : null]}>
              <VerdictDot fit={r.fit} size={8} />
              <T variant="caption" color={onPhoto.chipText} numberOfLines={1} style={{ fontWeight: '600', maxWidth: 160 }}>
                {names.get(r.id) ?? 'Dish'}
              </T>
            </View>
          </Tap>
        </Animated.View>
      ))}
    </View>
  );
}

function QuestionRow({ q, item, divider, onAnswer }: { q: ScanQuestion; item?: Item; divider: boolean; onAnswer: (v: Answer) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.md }}>
      {divider ? <View style={[styles.divider, { backgroundColor: c.hairline, marginLeft: 0, marginTop: -space.sm }]} /> : null}
      <View style={{ gap: 4 }}>
        <T variant="caption" tone="secondary">
          {item?.name ?? 'Dish'}
        </T>
        <T variant="bodyStrong">“{q.text}”</T>
      </View>
      <AnswerButtons value={q.answer} onChange={onAnswer} question={q.text} />
      {q.answer === 'no' ? (
        <Animated.View entering={FadeIn.duration(duration.base)} style={styles.answered}>
          <Icon name="checkCircle" size={14} color={c.good} />
          <T variant="caption" color={c.good}>
            You confirmed today. Only you see this answer.
          </T>
        </Animated.View>
      ) : q.answer === 'yes' ? (
        <Animated.View entering={FadeIn.duration(duration.base)} style={styles.answered}>
          <Icon name="block" size={14} color={c.notFit} />
          <T variant="caption" color={c.notFit}>
            Marked as not a fit.
          </T>
        </Animated.View>
      ) : null}
    </View>
  );
}

function Banner({ icon, text, onPress }: { icon: 'person' | 'warning' | 'note'; text: string; onPress?: () => void }) {
  const { c } = useTheme();
  const body = (
    <View style={[styles.banner, { backgroundColor: c.cardMuted }]}>
      <Icon name={icon} size={16} color={c.textSecondary} />
      <T variant="caption" tone="secondary" style={{ flex: 1 }}>
        {text}
      </T>
      {onPress ? <Icon name="chevron" size={12} color={c.textTertiary} /> : null}
    </View>
  );
  return onPress ? (
    <Tap accessibilityRole="button" accessibilityLabel={text} onPress={onPress} scaleTo={0.98} style={{ marginTop: space.md }}>
      {body}
    </Tap>
  ) : (
    <View style={{ marginTop: space.md }}>{body}</View>
  );
}

function ListSkeleton({ count, names }: { count: number; names: string[] }) {
  return (
    <View style={{ marginTop: space.lg }}>
      <Skeleton width={90} height={10} style={{ marginBottom: space.md }} />
      <Card style={{ gap: space.xl }}>
        {Array.from({ length: Math.min(count, 6) }).map((_, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <VerdictDot fit={null} />
            <View style={{ flex: 1, gap: space.sm }}>
              {names[i] ? <T variant="headline">{names[i]}</T> : <Skeleton width="55%" height={15} />}
              <Skeleton width="80%" height={12} />
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

function FailedCard({ message }: { message?: string }) {
  const { c } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(duration.base)} style={{ gap: space.lg, marginTop: space.sm }}>
      <T tone="secondary">{message || 'Something went wrong reading this menu.'}</T>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="Retake" icon="camera" onPress={() => router.replace('/scan')} style={{ flex: 1 }} />
      </View>
      <View style={[styles.banner, { backgroundColor: c.cardMuted }]}>
        <Icon name="note" size={16} color={c.textSecondary} />
        <T variant="caption" tone="secondary" style={{ flex: 1 }}>
          Fit never guesses at a menu it can’t read. Flat, well lit photos work best.
        </T>
      </View>
    </Animated.View>
  );
}

function Missing() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.center, { backgroundColor: onPhoto.black, paddingTop: insets.top }]}>
      <T variant="headline" color={onPhoto.text}>
        This scan is no longer here
      </T>
      <Tap accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{ padding: space.lg }}>
        <T variant="bodyStrong" color={onPhoto.textSecondary}>
          Go back
        </T>
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  noPhoto: { position: 'absolute', left: space.xxl, right: space.xxl, alignItems: 'center', justifyContent: 'center', gap: space.md },
  checking: { borderRadius: radius.chip, paddingHorizontal: space.md, justifyContent: 'center', position: 'absolute', right: 0, top: -30 },
  checkingSmall: { borderRadius: radius.chip, paddingHorizontal: 7, paddingVertical: 3 },
  chipRow: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  lensChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: onPhoto.chip, borderRadius: radius.chip, paddingHorizontal: space.md, paddingVertical: 7, borderWidth: 2, borderColor: 'transparent' },
  lensChipSelected: { borderColor: onPhoto.chipText },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg },
  pill: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 40, paddingHorizontal: space.lg, maxWidth: 240 },
  counters: { flexDirection: 'row', gap: space.sm, minHeight: 52 },
  productCounters: { flexDirection: 'row' },
  counter: { flex: 1, borderRadius: radius.md, paddingVertical: space.sm, paddingHorizontal: space.md, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.lg },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: space.lg + 10 + space.md },
  mod: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  askHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  answered: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -space.xs },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, padding: space.md },
  footer: { flexDirection: 'row', gap: space.sm, marginTop: space.xxl },
});

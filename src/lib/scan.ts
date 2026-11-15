import { useMutation, useQuery } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';

import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { afterAnswer, buildQuestions, buildRanking, buildVerdicts } from '@engine/pipeline';
import type { Box, HardCheck, Item, RankedItem, Rule, ScanQuestion, ScanStatus, Verdict } from '@engine/types';
import profileJson from '../../fixtures/profile.json';
import scanJson from '../../fixtures/scan.done.json';
import { HAS_BACKEND, useDeviceId } from './backend';
import type { Where } from './location';

// The app talks to the backend only through the public Convex functions. This file adapts them to what the
// screens draw.

/** A bundled image (require) or a local/remote URI. */
export type PhotoSource = number | { uri: string };

/** Everything the result screen draws. Same shape live or from the bundled sample. */
export type ScanView = {
  status: ScanStatus;
  kind: 'menu' | 'product' | 'label' | 'unknown';
  photo: PhotoSource | null;
  imageWidth: number;
  imageHeight: number;
  items: Item[];
  verdicts: Record<string, Verdict>;
  ranking: RankedItem[];
  questions: ScanQuestion[];
  explanations: Record<string, string>;
  /** Used to name the profile item behind each finding. */
  rules: Rule[];
  summary?: string;
  restaurant?: string;
  /** Set once the backend knows which restaurant this is (a name plus a location); answers are remembered against it. */
  restaurantId?: string;
  /** Every line of text found on the photo, shown as faint outlines until the dishes have positions of their own. */
  textBoxes?: Box[];
  /** Fast first-pass verdicts, still being checked (PLAN 7.1). Shown as "checking", no questions yet. */
  provisional: boolean;
  notice?: string;
  generic: boolean;
  error?: string;
};

export type Answer = 'yes' | 'no' | 'skipped';

// ---- Photos stay on the device. The backend keeps only a storage id, so remember which local photo belongs to
// which scan (for the overlay, and for thumbnails in Recent scans).

export type LocalPhoto = { uri: string; width: number; height: number };
const PHOTOS_KEY = 'fit.scanPhotos';
let photos: Record<string, LocalPhoto> = {};
let photosLoaded = false;
const photoListeners = new Set<() => void>();

function loadPhotos() {
  if (photosLoaded) return;
  photosLoaded = true;
  SecureStore.getItemAsync(PHOTOS_KEY)
    .then((raw) => {
      if (!raw) return;
      photos = { ...JSON.parse(raw), ...photos };
      photoListeners.forEach((l) => l());
    })
    .catch(() => {});
}

export function rememberPhoto(scanId: string, photo: LocalPhoto) {
  photos = { ...photos, [scanId]: photo };
  photoListeners.forEach((l) => l());
  // Keep the newest 25 so the stored value stays small.
  const recent = Object.fromEntries(Object.entries(photos).slice(-25));
  SecureStore.setItemAsync(PHOTOS_KEY, JSON.stringify(recent)).catch(() => {});
}

function subscribePhotos(l: () => void) {
  photoListeners.add(l);
  return () => {
    photoListeners.delete(l);
  };
}

function usePhotos(): Record<string, LocalPhoto> {
  loadPhotos();
  return useSyncExternalStore(subscribePhotos, () => photos);
}

// ---- The bundled sample: the fixture menu laid over the bundled menu photo, replayed through the same stages as a
// live scan so every animation can be shown offline. One shared store, so the result screen and the dish sheet see
// the same answers. Answers are applied with the engine's own afterAnswer, exactly as the backend does.

export const SAMPLE_ID = 'sample';
export const SAMPLE_PHOTO: number = require('@/assets/demo/menu.jpg');

/** Where each fixture dish sits on assets/demo/menu.jpg (measured when the image was drawn). */
const SAMPLE_BOXES: Record<string, Box> = {
  d1: { left: 0.11, top: 0.2775, right: 0.4272, bottom: 0.3431 },
  d2: { left: 0.11, top: 0.3744, right: 0.3193, bottom: 0.44 },
  d3: { left: 0.11, top: 0.4713, right: 0.5024, bottom: 0.5369 },
  d4: { left: 0.11, top: 0.5681, right: 0.3628, bottom: 0.6338 },
  d5: { left: 0.11, top: 0.74, right: 0.3731, bottom: 0.8056 },
};

const fixture = scanJson as unknown as { items: Item[]; checks: HardCheck[]; ranking: RankedItem[]; summary: string; explanations: Record<string, string> };
const sampleRules = profileJson.rules as Rule[];
const sampleItems: Item[] = fixture.items.map((i) => ({ ...i, position: SAMPLE_BOXES[i.id] ? [SAMPLE_BOXES[i.id]] : undefined }));

type SampleScan = { checks: HardCheck[]; verdicts: Record<string, Verdict>; ranking: RankedItem[]; questions: ScanQuestion[] };
function freshSample(): SampleScan {
  const verdicts = buildVerdicts(sampleItems, sampleRules, fixture.checks);
  // Keep the fixture's worded lines and suggestions; sections follow the verdicts.
  return { checks: fixture.checks, verdicts, ranking: buildRanking(sampleItems, verdicts, sampleRules, fixture.ranking), questions: buildQuestions(sampleItems, verdicts) };
}

function sampleView(stage: ScanStatus, scan: SampleScan): ScanView {
  const confirmed = stage === 'ranking' || stage === 'explaining' || stage === 'done';
  const provisional = stage === 'judging';
  return {
    status: stage,
    kind: 'menu',
    photo: SAMPLE_PHOTO,
    imageWidth: 1200,
    imageHeight: 1600,
    rules: sampleRules,
    generic: false,
    restaurant: 'The Corner Table',
    provisional,
    items: stage === 'reading' ? [] : sampleItems,
    // Like the live pipeline: provisional verdicts first, questions only once confirmed, then wording.
    verdicts: provisional || confirmed ? scan.verdicts : {},
    ranking: provisional || confirmed ? scan.ranking : [],
    questions: confirmed ? scan.questions : [],
    explanations: stage === 'done' ? fixture.explanations : {},
    summary: stage === 'explaining' || stage === 'done' ? fixture.summary : undefined,
  };
}

let sample = (() => {
  const scan = freshSample();
  return { stage: 'done' as ScanStatus, scan, view: sampleView('done', scan) };
})();
let sampleTimers: ReturnType<typeof setTimeout>[] = [];
const sampleListeners = new Set<() => void>();

function setSample(stage: ScanStatus, scan: SampleScan) {
  sample = { stage, scan, view: sampleView(stage, scan) };
  sampleListeners.forEach((l) => l());
}

/** Start the sample from the top, like a live scan: reading, judging (provisional), ranking, explaining, done. */
export function restartSample() {
  sampleTimers.forEach(clearTimeout);
  setSample('reading', freshSample());
  sampleTimers = [
    setTimeout(() => setSample('judging', sample.scan), 1600),
    setTimeout(() => setSample('ranking', sample.scan), 2600),
    setTimeout(() => setSample('explaining', sample.scan), 3300),
    setTimeout(() => setSample('done', sample.scan), 3900),
  ];
}

function answerSample(questionId: string, value: Answer) {
  const next = afterAnswer({ items: sampleItems, ...sample.scan }, sampleRules, questionId, value, new Date().toISOString());
  if (next) setSample(sample.stage, next);
}

function subscribeSample(l: () => void) {
  sampleListeners.add(l);
  return () => {
    sampleListeners.delete(l);
  };
}

function useSampleScan(active: boolean) {
  const view = useSyncExternalStore(subscribeSample, () => sample.view);
  return { view: active ? view : undefined, answer: answerSample };
}

// ---- Live scans (scans.get, scans.answer, rules.list)

/** The device's rules (live), for naming the profile item behind each finding. */
function useRulesLive(): Rule[] {
  const deviceId = useDeviceId();
  const rules = useQuery(api.rules.list, deviceId ? { deviceId } : 'skip');
  return useMemo(() => rules ?? [], [rules]);
}

function useLiveScan(id: string | null) {
  const record = useQuery(api.scans.get, id ? { scanId: id as Id<'scans'> } : 'skip');
  const rules = useRulesLive();
  const all = usePhotos();
  const send = useMutation(api.scans.answer);
  const answer = useCallback(
    (questionId: string, value: Answer) => {
      if (!id) return;
      send({ scanId: id as Id<'scans'>, questionId, value }).catch(() => {});
    },
    [id, send],
  );
  const photo = id ? all[id] : undefined;
  const view = useMemo<ScanView | undefined | null>(() => {
    if (record === undefined) return undefined;
    if (record === null) return null;
    return {
      status: record.status,
      kind: record.kind,
      photo: photo ? { uri: photo.uri } : null,
      imageWidth: photo?.width ?? 0,
      imageHeight: photo?.height ?? 0,
      items: record.items,
      verdicts: record.verdicts,
      ranking: record.ranking,
      // PLAN 7.1: never ask anything on a provisional result.
      questions: record.provisional ? [] : record.questions,
      explanations: record.explanations,
      rules,
      summary: record.summary,
      restaurant: record.restaurantName,
      restaurantId: record.restaurantId,
      textBoxes: record.textBoxes,
      provisional: record.provisional === true,
      notice: record.notice,
      generic: record.generic,
      error: record.error,
    };
  }, [record, rules, photo]);
  return { view, answer };
}

function useLiveScanOffline(_id: string | null) {
  return { view: null as ScanView | null, answer: (_q: string, _v: Answer) => {} };
}

const useLive = HAS_BACKEND ? useLiveScan : useLiveScanOffline;

/**
 * The scan to draw. `undefined` while loading, `null` when it does not exist.
 * Answers update the screen at once: optimistically here, then from the record (which recomputes itself).
 */
export function useScan(id: string) {
  const isSample = id === SAMPLE_ID;
  const sampleScan = useSampleScan(isSample);
  const live = useLive(isSample ? null : id);
  const [pending, setPending] = useState<Record<string, Answer>>({});
  const source = isSample ? sampleScan : live;
  const view = source.view;

  // Optimistic answers hold the user's latest tap per question; once the record catches up they match it anyway.
  const answer = useCallback(
    (questionId: string, value: Answer) => {
      setPending((p) => ({ ...p, [questionId]: value }));
      source.answer(questionId, value);
    },
    [source],
  );

  const merged = useMemo(() => {
    if (!view || Object.keys(pending).length === 0) return view;
    return { ...view, questions: view.questions.map((q) => (pending[q.id] ? { ...q, answer: pending[q.id] } : q)) };
  }, [view, pending]);

  return { view: merged, answer };
}

// ---- Which restaurant a scan is from (scans.setRestaurant)

/**
 * Confirm or correct the restaurant's name. Resolves to the restaurant's id, or null when there is no location to
 * tell it from another place of the same name (answers then apply to that scan only).
 */
export type SetRestaurant = (scanId: string, name: string, location: Where | null) => Promise<string | null>;

function useSetRestaurantLive(): SetRestaurant {
  const send = useMutation(api.scans.setRestaurant);
  return useCallback((scanId, name, location) => send({ scanId: scanId as Id<'scans'>, name, ...(location ? { location } : {}) }), [send]);
}

/** Null without a backend (the bundled sample has no restaurant to remember). */
export const useSetRestaurant: () => SetRestaurant | null = HAS_BACKEND ? useSetRestaurantLive : () => null;

// The person confirms a restaurant's name once. Which ones they have confirmed is kept on the device.
const CONFIRMED_KEY = 'fit.restaurantsConfirmed';
let confirmed: string[] = [];
let confirmedLoaded = false;
const confirmedListeners = new Set<() => void>();

function loadConfirmed() {
  if (confirmedLoaded) return;
  confirmedLoaded = true;
  SecureStore.getItemAsync(CONFIRMED_KEY)
    .then((raw) => {
      if (!raw) return;
      confirmed = [...new Set([...(JSON.parse(raw) as string[]), ...confirmed])];
      confirmedListeners.forEach((l) => l());
    })
    .catch(() => {});
}

export function confirmRestaurant(restaurantId: string) {
  if (confirmed.includes(restaurantId)) return;
  // Keep the newest 60 so the stored value stays small.
  confirmed = [...confirmed, restaurantId].slice(-60);
  confirmedListeners.forEach((l) => l());
  SecureStore.setItemAsync(CONFIRMED_KEY, JSON.stringify(confirmed)).catch(() => {});
}

function subscribeConfirmed(l: () => void) {
  confirmedListeners.add(l);
  return () => {
    confirmedListeners.delete(l);
  };
}

/** Whether this person has already confirmed this restaurant's name on this device. */
export function useRestaurantConfirmed(restaurantId: string | undefined): boolean {
  loadConfirmed();
  const all = useSyncExternalStore(subscribeConfirmed, () => confirmed);
  return !!restaurantId && all.includes(restaurantId);
}

// ---- Recent scans (scans.list)

export type RecentScan = {
  id: string;
  title: string;
  createdAt: number;
  status: ScanStatus;
  kind: string;
  itemCount: number;
  photo: PhotoSource | null;
};

function useRecentLive(): RecentScan[] | undefined {
  const deviceId = useDeviceId();
  const rows = useQuery(api.scans.list, deviceId ? { deviceId } : 'skip');
  const all = usePhotos();
  return useMemo(
    () =>
      rows?.map((r) => ({
        id: r.scanId,
        title: r.title,
        createdAt: r.createdAt,
        status: r.status,
        kind: r.kind,
        itemCount: r.itemCount,
        photo: all[r.scanId] ? { uri: all[r.scanId].uri } : null,
      })),
    [rows, all],
  );
}

/** Recent scans, newest first. `undefined` while loading. */
export const useRecentScans: () => RecentScan[] | undefined = HAS_BACKEND ? useRecentLive : () => [];

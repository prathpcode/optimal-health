import { useMutation } from 'convex/react';
import { Asset } from 'expo-asset';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useCallback } from 'react';

import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { HAS_BACKEND } from './backend';
import type { Where } from './location';
import { rememberPhoto, SAMPLE_PHOTO } from './scan';

/**
 * Longest side sent to the reader. Small print stays legible at this size, and it is under the size at which the
 * API would scale the image itself, so the pixel boxes the reader returns line up with the photo we stored.
 */
const MAX_SIDE = 1536;

export type Prepared = { uri: string; width: number; height: number };

/** Downscale to MAX_SIDE and re-encode as JPEG (also bakes in EXIF orientation). Reads the real size itself. */
export async function prepareImage(uri: string): Promise<Prepared> {
  let image = await ImageManipulator.manipulate(uri).renderAsync();
  if (Math.max(image.width, image.height) > MAX_SIDE) {
    const ctx = ImageManipulator.manipulate(image);
    ctx.resize(image.width >= image.height ? { width: MAX_SIDE, height: null } : { width: null, height: MAX_SIDE });
    image = await ctx.renderAsync();
  }
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** The bundled sample menu as a local file, ready to upload. */
export async function sampleMenuFile(): Promise<Prepared> {
  const asset = Asset.fromModule(SAMPLE_PHOTO);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  return { uri, width: asset.width ?? 1200, height: asset.height ?? 1600 };
}

/** `location`, when the phone already has one, lets the backend recognise the restaurant (PLAN 6.5). */
type StartScan = (image: Prepared, deviceId: string, location?: Where | null) => Promise<string>;

/** Upload a prepared photo to Convex storage and start the pipeline. Resolves to the new scan id. */
function useStartScanLive(): StartScan {
  const generateUploadUrl = useMutation(api.scans.generateUploadUrl);
  const start = useMutation(api.scans.start);

  return useCallback(
    async (image, deviceId, location) => {
      const uploadUrl = await generateUploadUrl();
      const file = await fetch(image.uri);
      const blob = await file.blob();
      const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };
      // PLAN 7.1: scans.start({ deviceId, imageId, location? }). The photo stays on the device for the overlay.
      const scanId = await start({ deviceId, imageId: storageId, ...(location ? { location } : {}) });
      rememberPhoto(scanId, image);
      return scanId;
    },
    [generateUploadUrl, start],
  );
}

/** A product scan from a barcode alone (PLAN 7.1: scans.start({ deviceId, barcode })). */
function useStartBarcodeLive(): (barcode: string, deviceId: string) => Promise<string> {
  const start = useMutation(api.scans.start);
  return useCallback((barcode, deviceId) => start({ deviceId, barcode }), [start]);
}
export const useStartBarcode: () => ((barcode: string, deviceId: string) => Promise<string>) | null = HAS_BACKEND ? useStartBarcodeLive : () => null;

/** Null when the app runs without a backend; callers then show the bundled sample. */
export const useStartScan: () => StartScan | null = HAS_BACKEND ? useStartScanLive : () => null;

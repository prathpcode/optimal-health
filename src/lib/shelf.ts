import { useAction } from 'convex/react';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useCallback } from 'react';

import { api } from '@convex/_generated/api';
import type { ShelfBox } from '@engine/shelf';
import { HAS_BACKEND } from './backend';

export type { ShelfBox, ShelfState } from '@engine/shelf';

/**
 * Longest side of a still sent to the shelf view. Package fronts are big print, so this is smaller than a menu
 * photo: a smaller picture goes up faster, and the view is only as live as its round trip.
 */
const MAX_SIDE = 1100;

export type ShelfStill = { base64: string; width: number; height: number };

/** Shrink a camera still and hand it back as base64 JPEG, which is what the backend's text recognition takes. */
export async function shelfStill(uri: string): Promise<ShelfStill> {
  let image = await ImageManipulator.manipulate(uri).renderAsync();
  if (Math.max(image.width, image.height) > MAX_SIDE) {
    const ctx = ImageManipulator.manipulate(image);
    ctx.resize(image.width >= image.height ? { width: MAX_SIDE, height: null } : { width: null, height: MAX_SIDE });
    image = await ctx.renderAsync();
  }
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });
  if (!saved.base64) throw new Error('No picture data');
  return { base64: saved.base64, width: saved.width, height: saved.height };
}

export type ShelfLook = (still: ShelfStill, deviceId: string) => Promise<{ boxes: ShelfBox[]; reading: boolean }>;

function useShelfLookLive(): ShelfLook {
  const look = useAction(api.shelf.look);
  return useCallback((still, deviceId) => look({ deviceId, image: still.base64 }), [look]);
}

/** One still in, a box per package out (shelf.look). Null when the app runs without a backend. */
export const useShelfLook: () => ShelfLook | null = HAS_BACKEND ? useShelfLookLive : () => null;

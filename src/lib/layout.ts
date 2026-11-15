import type { Box } from '@engine/types';

// Pure geometry for the photo overlay. Kept free of React so it can be tested.

export type Rect = { x: number; y: number; width: number; height: number };

/** Where an image drawn with contentFit="contain" actually lands inside its container. */
export function containRect(container: { width: number; height: number }, image: { width: number; height: number }): Rect {
  if (!container.width || !container.height || !image.width || !image.height) return { x: 0, y: 0, width: 0, height: 0 };
  const scale = Math.min(container.width / image.width, container.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { x: (container.width - width) / 2, y: (container.height - height) / 2, width, height };
}

export function boxToRect(box: Box, photo: Rect): Rect {
  return {
    x: photo.x + box.left * photo.width,
    y: photo.y + box.top * photo.height,
    width: (box.right - box.left) * photo.width,
    height: (box.bottom - box.top) * photo.height,
  };
}

export type ChipInput = {
  id: string;
  box: Box;
  height: number;
  /** Estimated rendered width. */
  width: number;
  /** Dishes that are out or need a question keep their chip on a crowded menu. */
  important: boolean;
};

export type ChipPlacement = {
  id: string;
  /** "chip": full label. "dot": a small marker beside the dish, used when a label would not fit near it. */
  mode: 'chip' | 'dot';
  x: number;
  y: number;
  width: number;
  outline: Rect;
};

export const DOT = 16;

type Opts = { gap: number; margin: number; minWidth: number; maxWidth: number; maxShift: number; crowded: number };
const DEFAULTS: Opts = { gap: 6, margin: 10, minWidth: 120, maxWidth: 280, maxShift: 36, crowded: 10 };

/**
 * Anchor each chip at the top-left of its dish and keep it on screen. A chip that overlaps one above it moves down,
 * but never far: if it would drift more than `maxShift` from its dish, or fall below `bounds.height` (under the
 * sheet), it becomes a dot instead. On a crowded menu only important dishes get chips.
 */
export function placeChips(chips: ChipInput[], photo: Rect, bounds: { width: number; height: number }, options: Partial<Opts> = {}): ChipPlacement[] {
  const o = { ...DEFAULTS, ...options };
  const crowded = chips.length > o.crowded;
  const sorted = [...chips].sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const out: ChipPlacement[] = [];

  for (const chip of sorted) {
    const outline = boxToRect(chip.box, photo);
    const dot = (): ChipPlacement => ({
      id: chip.id,
      mode: 'dot',
      x: Math.max(2, outline.x - DOT - 4),
      y: outline.y + Math.min(outline.height, 30) / 2 - DOT / 2,
      width: DOT,
      outline,
    });
    if (crowded && !chip.important) {
      out.push(dot());
      continue;
    }

    const width = Math.max(o.minWidth, Math.min(chip.width, o.maxWidth, bounds.width - 2 * o.margin));
    let x = Math.max(o.margin, outline.x - 4);
    if (x + width > bounds.width - o.margin) x = Math.max(o.margin, bounds.width - o.margin - width);
    const anchorY = Math.max(o.margin, outline.y - 4);
    let y = anchorY;
    let moved = true;
    while (moved) {
      moved = false;
      for (const p of placed) {
        const overlapsX = x < p.x + p.w && x + width > p.x;
        const overlapsY = y < p.y + p.h + o.gap && y + chip.height + o.gap > p.y;
        if (overlapsX && overlapsY) {
          y = p.y + p.h + o.gap;
          moved = true;
        }
      }
    }
    if (y - anchorY > o.maxShift || y + chip.height > bounds.height) {
      out.push(dot());
      continue;
    }
    placed.push({ x, y, w: width, h: chip.height });
    out.push({ id: chip.id, mode: 'chip', x, y, width, outline });
  }
  return out;
}

/** Rough rendered width of a chip from its text (13 pt semibold name, 12 pt reason). */
export function estimateChipWidth(name: string, reason: string | null): number {
  const chrome = 12 * 2 + 2 * 2; // padding + border
  const nameLine = chrome + 9 + 7 + name.length * 7.3;
  const reasonLine = reason ? chrome + 16 + reason.length * 6.4 : 0;
  return Math.ceil(Math.max(nameLine, reasonLine));
}

import type { Box, Quad } from '@engine/types';

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

/**
 * Where an image drawn to FILL its container actually lands: it is scaled until it covers, so it runs past two of
 * the container's edges. A camera preview is drawn this way, so a still's coordinates map onto the preview through
 * this rect.
 */
export function coverRect(container: { width: number; height: number }, image: { width: number; height: number }): Rect {
  if (!container.width || !container.height || !image.width || !image.height) return { x: 0, y: 0, width: 0, height: 0 };
  const scale = Math.max(container.width / image.width, container.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { x: (container.width - width) / 2, y: (container.height - height) / 2, width, height };
}

/**
 * Grow each block of text toward the size of the package it is printed on. The words sit in the upper middle of a
 * package's front, so a box drawn tightly round them looks small and is hard to see; this pushes each side out by a
 * share of the block's own size (more below than above), but never past halfway to a neighbouring block, so two
 * packages standing side by side keep separate boxes.
 */
export function packageRects(blocks: Rect[], grow = { side: 0.32, top: 0.4, bottom: 0.95 }): Rect[] {
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0;
  return blocks.map((r, i) => {
    let left = r.width * grow.side, right = r.width * grow.side, top = r.height * grow.top, bottom = r.height * grow.bottom;
    blocks.forEach((o, j) => {
      if (j === i) return;
      if (overlap(r.y, r.y + r.height, o.y, o.y + o.height)) {
        if (o.x >= r.x + r.width) right = Math.min(right, (o.x - (r.x + r.width)) / 2);
        if (o.x + o.width <= r.x) left = Math.min(left, (r.x - (o.x + o.width)) / 2);
      }
      if (overlap(r.x, r.x + r.width, o.x, o.x + o.width)) {
        if (o.y >= r.y + r.height) bottom = Math.min(bottom, (o.y - (r.y + r.height)) / 2);
        if (o.y + o.height <= r.y) top = Math.min(top, (r.y - (o.y + o.height)) / 2);
      }
    });
    // Always a little room round the words, even between tightly packed packages.
    left = Math.max(left, 3);
    right = Math.max(right, 3);
    top = Math.max(top, 3);
    bottom = Math.max(bottom, 3);
    return { x: r.x - left, y: r.y - top, width: r.width + left + right, height: r.height + top + bottom };
  });
}

export function boxToRect(box: Box, photo: Rect): Rect {
  return {
    x: photo.x + box.left * photo.width,
    y: photo.y + box.top * photo.height,
    width: (box.right - box.left) * photo.width,
    height: (box.bottom - box.top) * photo.height,
  };
}

/** The smallest box that holds all of a dish's lines (its name and the description under it). */
export function unionBox(boxes: Box[]): Box {
  return {
    top: Math.min(...boxes.map((b) => b.top)),
    left: Math.min(...boxes.map((b) => b.left)),
    bottom: Math.max(...boxes.map((b) => b.bottom)),
    right: Math.max(...boxes.map((b) => b.right)),
  };
}

/**
 * Where to draw a photo so that one region of it (the part with the menu's dishes) fills a container, instead of
 * the whole photo being shrunk to fit. The returned rect is the WHOLE photo and usually runs past the container's
 * edges. The region gets a margin of `pad` (a fraction of the photo), and the photo is never enlarged beyond
 * `maxZoom` times its fit-everything size, so a menu shot from far away does not turn to mush.
 */
export function zoomRect(container: Rect, image: { width: number; height: number }, region: Box, options: { pad?: number; maxZoom?: number } = {}): Rect | null {
  const pad = options.pad ?? 0.03;
  const maxZoom = options.maxZoom ?? 3;
  if (!container.width || !container.height || !image.width || !image.height) return null;
  const left = Math.max(0, region.left - pad), right = Math.min(1, region.right + pad);
  const top = Math.max(0, region.top - pad), bottom = Math.min(1, region.bottom + pad);
  const regionW = (right - left) * image.width, regionH = (bottom - top) * image.height;
  if (!(regionW > 0) || !(regionH > 0)) return null;
  const fit = Math.min(container.width / image.width, container.height / image.height);
  const scale = Math.min(container.width / regionW, container.height / regionH, fit * maxZoom);
  if (scale <= fit * 1.1) return null; // the region already nearly fills the photo: not worth moving anything
  return {
    x: container.x + (container.width - regionW * scale) / 2 - left * image.width * scale,
    y: container.y + (container.height - regionH * scale) / 2 - top * image.height * scale,
    width: image.width * scale,
    height: image.height * scale,
  };
}

/** A rectangle that may be turned: its centre, its size, and its angle in radians (clockwise on screen). */
export type Tilted = { cx: number; cy: number; width: number; height: number; angle: number };

/**
 * One rectangle around all of a dish's lines, turned to the angle the text runs at. On a menu photographed at a
 * slant an upright box has to grow to cover the slanted lines and ends up overlapping its neighbours; this one hugs
 * the dish. Worked out in screen points, because a tilt only means something where both axes have the same scale.
 */
export function tiltedRect(quads: Quad[], photo: Rect): Tilted | null {
  const lines = quads.filter((q) => q.length === 4).map((q) => q.map((p) => ({ x: photo.x + p.x * photo.width, y: photo.y + p.y * photo.height })));
  if (!lines.length) return null;
  // The text's direction: the top edges of all the lines, added up (so longer lines count for more).
  const dx = lines.reduce((s, q) => s + (q[1].x - q[0].x), 0);
  const dy = lines.reduce((s, q) => s + (q[1].y - q[0].y), 0);
  const angle = Math.atan2(dy, dx);
  if (!Number.isFinite(angle)) return null;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const pts = lines.flat();
  const us = pts.map((p) => p.x * cos + p.y * sin);
  const vs = pts.map((p) => -p.x * sin + p.y * cos);
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
  const u = (u0 + u1) / 2, v = (v0 + v1) / 2;
  return { cx: u * cos - v * sin, cy: u * sin + v * cos, width: u1 - u0, height: v1 - v0, angle };
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

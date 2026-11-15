import { describe, expect, it } from 'vitest';
import { boxToRect, containRect, coverRect, estimateChipWidth, placeChips, tiltedRect, unionBox, zoomRect, type ChipInput } from './layout';

describe('containRect', () => {
  it('letterboxes a tall photo in a wide box', () => {
    expect(containRect({ width: 400, height: 300 }, { width: 300, height: 600 })).toEqual({ x: 125, y: 0, width: 150, height: 300 });
  });
  it('pillarboxes a wide photo in a tall box', () => {
    expect(containRect({ width: 390, height: 600 }, { width: 1200, height: 900 })).toEqual({ x: 0, y: 153.75, width: 390, height: 292.5 });
  });
  it('is empty before layout', () => {
    expect(containRect({ width: 0, height: 0 }, { width: 10, height: 10 }).width).toBe(0);
  });
});

describe('coverRect', () => {
  it('fills a tall screen with a 3:4 still, cropping its sides evenly', () => {
    const r = coverRect({ width: 390, height: 844 }, { width: 900, height: 1200 });
    expect(r.height).toBeCloseTo(844);
    expect(r.width).toBeCloseTo(633);
    expect(r.x).toBeCloseTo(-121.5);
    expect(r.y).toBeCloseTo(0);
  });
  it('is empty before layout', () => {
    expect(coverRect({ width: 0, height: 0 }, { width: 10, height: 10 }).width).toBe(0);
  });
});

describe('placeChips', () => {
  const photo = { x: 0, y: 0, width: 400, height: 800 };
  const bounds = { width: 400, height: 800 };
  const chip = (id: string, left: number, top: number, extra: Partial<ChipInput> = {}): ChipInput => ({
    id,
    box: { left, top, right: left + 0.3, bottom: top + 0.03 },
    height: 36,
    width: 150,
    important: true,
    ...extra,
  });
  const chips = (p: ReturnType<typeof placeChips>) => p.filter((x) => x.mode === 'chip');

  it('anchors a chip at its dish', () => {
    const [p] = placeChips([chip('a', 0.25, 0.25)], photo, bounds);
    expect(p).toMatchObject({ mode: 'chip', x: 96, y: 196 });
  });

  it('never lets two chips overlap, and nudges a close neighbour only a little', () => {
    const input = [chip('a', 0.1, 0.2), chip('b', 0.1, 0.21), chip('c', 0.12, 0.215)];
    const placed = chips(placeChips(input, photo, bounds));
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        const overlap = a.y < b.y + 36 && b.y < a.y + 36 && a.x < b.x + b.width && b.x < a.x + a.width;
        expect(overlap, `${a.id} vs ${b.id}`).toBe(false);
      }
    // The third chip would have to travel too far from its dish, so it becomes a dot.
    expect(placeChips(input, photo, bounds).find((x) => x.id === 'c')?.mode).toBe('dot');
  });

  it('lets chips side by side share a row when they do not overlap', () => {
    const placed = placeChips([chip('a', 0.02, 0.3, { width: 150 }), chip('b', 0.55, 0.3, { width: 150 })], photo, bounds);
    expect(placed.every((p) => p.mode === 'chip')).toBe(true);
    expect(placed[0].y).toBe(placed[1].y);
  });

  it('turns a chip that would sit under the sheet into a dot', () => {
    const [p] = placeChips([chip('a', 0.1, 0.9)], photo, { width: 400, height: 700 });
    expect(p.mode).toBe('dot');
  });

  it('keeps chips only for important dishes on a crowded menu', () => {
    const input = Array.from({ length: 14 }, (_, i) => chip(`d${i}`, 0.1, 0.05 + i * 0.06, { important: i === 3 }));
    const placed = placeChips(input, photo, bounds);
    expect(chips(placed).map((p) => p.id)).toEqual(['d3']);
  });

  it('keeps a chip near the right edge on screen', () => {
    const [p] = placeChips([chip('a', 0.95, 0.5)], photo, bounds);
    expect(p.x + p.width).toBeLessThanOrEqual(390);
  });
});

describe('unionBox', () => {
  it('covers a dish name and the description lines under it', () => {
    expect(unionBox([{ top: 0.2, left: 0.1, bottom: 0.22, right: 0.3 }, { top: 0.22, left: 0.1, bottom: 0.25, right: 0.7 }])).toEqual({ top: 0.2, left: 0.1, bottom: 0.25, right: 0.7 });
  });
});

describe('tiltedRect', () => {
  const photo = { x: 0, y: 0, width: 1000, height: 1000 };
  /** A 400 x 40 line whose top-left is at (x, y), turned by `deg` about that corner, as fractions of the photo. */
  const line = (x: number, y: number, deg: number, w = 400, h = 40) => {
    const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    const at = (u: number, v: number) => ({ x: (x + u * cos - v * sin) / 1000, y: (y + u * sin + v * cos) / 1000 });
    return [at(0, 0), at(w, 0), at(w, h), at(0, h)];
  };
  it('is the plain box when the text is level', () => {
    const r = tiltedRect([line(100, 200, 0), line(100, 240, 0, 300)], photo)!;
    expect(r.angle).toBeCloseTo(0);
    expect(r.width).toBeCloseTo(400);
    expect(r.height).toBeCloseTo(80);
    expect(r.cx).toBeCloseTo(300);
    expect(r.cy).toBeCloseTo(240);
  });
  it('turns with the text and stays the size of the text, not of its upright shadow', () => {
    const r = tiltedRect([line(100, 200, 10)], photo)!;
    expect((r.angle * 180) / Math.PI).toBeCloseTo(10);
    expect(r.width).toBeCloseTo(400);
    expect(r.height).toBeCloseTo(40);
    // The upright box around the same line would be far taller than the line itself.
    expect(400 * Math.sin((10 * Math.PI) / 180) + 40).toBeGreaterThan(100);
  });
  it('is nothing without corners', () => {
    expect(tiltedRect([], photo)).toBeNull();
    expect(tiltedRect([[{ x: 0, y: 0 }]], photo)).toBeNull();
  });
});

describe('zoomRect', () => {
  const container = { x: 20, y: 100, width: 360, height: 400 };
  const image = { width: 900, height: 1600 };
  it('draws the photo so the menu region fills the container, centred', () => {
    const region = { left: 0.25, right: 0.75, top: 0.3, bottom: 0.6 };
    const photo = zoomRect(container, image, region, { pad: 0, maxZoom: 10 })!;
    const shown = boxToRect(region, photo);
    expect(shown.width).toBeCloseTo(360);
    expect(shown.x).toBeCloseTo(20);
    expect(shown.y + shown.height / 2).toBeCloseTo(300); // vertically centred in the container
    expect(shown.height).toBeLessThanOrEqual(400);
  });
  it('does not enlarge beyond the limit however small the region', () => {
    const fit = Math.min(360 / 900, 400 / 1600);
    const photo = zoomRect(container, image, { left: 0.45, right: 0.5, top: 0.45, bottom: 0.5 }, { maxZoom: 3 })!;
    expect(photo.width / image.width).toBeCloseTo(fit * 3);
  });
  it('leaves a photo alone when the menu already fills it', () => {
    expect(zoomRect(container, image, { left: 0.02, right: 0.98, top: 0.02, bottom: 0.98 })).toBeNull();
  });
  it('is nothing before layout', () => {
    expect(zoomRect({ x: 0, y: 0, width: 0, height: 0 }, image, { left: 0, right: 1, top: 0, bottom: 1 })).toBeNull();
  });
});

describe('estimateChipWidth', () => {
  it('grows with the longer line', () => {
    expect(estimateChipWidth('Ramen', null)).toBeLessThan(estimateChipWidth('Walnut and beet salad', null));
    expect(estimateChipWidth('Paloma', 'Grapefruit · simvastatin')).toBeGreaterThan(estimateChipWidth('Paloma', null));
  });
});

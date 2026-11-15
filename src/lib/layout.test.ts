import { describe, expect, it } from 'vitest';
import { containRect, estimateChipWidth, placeChips, type ChipInput } from './layout';

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

describe('estimateChipWidth', () => {
  it('grows with the longer line', () => {
    expect(estimateChipWidth('Ramen', null)).toBeLessThan(estimateChipWidth('Walnut and beet salad', null));
    expect(estimateChipWidth('Paloma', 'Grapefruit · simvastatin')).toBeGreaterThan(estimateChipWidth('Paloma', null));
  });
});

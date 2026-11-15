import { describe, expect, it } from 'vitest';
import type { Item } from '@engine/types';
import { itemLink, readItemLink, toSharedItem } from './sharedItem';

const item: Item = {
  id: 'i1',
  kind: 'dish',
  name: 'Crème brûlée tacos',
  description: 'Corn tortillas, grilled fish, lime crema',
  ingredients: [
    { name: 'corn tortilla', origin: 'menu_text', evidence: 'Corn tortillas' },
    { name: 'cilantro', origin: 'inferred' },
  ],
  tags: [{ tag: 'fish', sureness: 'certain', origin: 'menu_text', evidence: 'grilled fish' }],
  levels: { sodium: 'high' },
};

describe('shared items', () => {
  it('keeps only facts about the food', () => {
    const s = toSharedItem(item, 'Taqueria Luna');
    expect(s).toEqual({
      kind: 'dish',
      name: 'Crème brûlée tacos',
      place: 'Taqueria Luna',
      description: 'Corn tortillas, grilled fish, lime crema',
      ingredients: [{ name: 'corn tortilla' }, { name: 'cilantro', guess: true }],
    });
    expect(JSON.stringify(s)).not.toMatch(/tags|levels|evidence|fit|verdict/);
  });
  it('round-trips through the post link, accents and all, and strips the link from the text', () => {
    const s = toSharedItem(item);
    const content = `Taqueria Luna · Loved it\n\nSo good.\n\n${itemLink(s)}`;
    const back = readItemLink(content);
    expect(back.item).toEqual(s);
    expect(back.text).toBe('Taqueria Luna · Loved it\n\nSo good.');
  });
  it('ignores posts without a link, and links it cannot read', () => {
    expect(readItemLink('Just text')).toEqual({ text: 'Just text' });
    expect(readItemLink('Hi [Open in Second Look](fitscanner://item?d=not_json)').item).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { dishEmoji, REACTION_EMOJI } from './emoji';

describe('dishEmoji', () => {
  it('matches common dishes by their words', () => {
    expect(dishEmoji('Spicy Tuna Roll Sushi')).toBe('🍣');
    expect(dishEmoji('Margherita Pizza')).toBe('🍕');
    expect(dishEmoji('Grilled Salmon')).toBe('🐟');
    expect(dishEmoji('Penne alla Vodka')).toBe('🍝');
  });
  it('prefers the dish over its ingredient', () => {
    expect(dishEmoji('Chicken Caesar Salad')).toBe('🥗');
    expect(dishEmoji('Fish Tacos')).toBe('🌮');
    expect(dishEmoji('Chicken Burrito')).toBe('🌯');
  });
  it('does not match inside other words', () => {
    expect(dishEmoji('Teriyaki Bowl')).toBe('🍚');
    expect(dishEmoji('Steamed Edamame')).toBe('🍽️');
  });
  it('has an emoji for every reaction', () => {
    expect(Object.keys(REACTION_EMOJI).sort()).toEqual(['loved', 'nope', 'okay']);
  });
});

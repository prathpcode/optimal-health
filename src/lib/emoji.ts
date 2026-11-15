import type { Reaction } from './whopForum';

/** How a meal went, as one emoji. */
export const REACTION_EMOJI: Record<Reaction, string> = { loved: '😍', okay: '🙂', nope: '😕' };

// First match wins, so specific words come before general ones ("chicken salad" is a salad, "fish taco" a taco).
const DISHES: [RegExp, string][] = [
  [/\b(sushi|sashimi|nigiri|maki)\b/, '🍣'],
  [/\b(ramen|pho|udon|soba|noodle soup)\b/, '🍜'],
  [/\b(burrito|wrap)\b/, '🌯'],
  [/\b(taco|tacos)\b/, '🌮'],
  [/\b(pizza|flatbread)\b/, '🍕'],
  [/\b(burger|cheeseburger|slider)s?\b/, '🍔'],
  [/\b(hot ?dog)s?\b/, '🌭'],
  [/\b(sandwich|sub|panini|blt|club)\b/, '🥪'],
  [/\b(salad|greens|slaw)\b/, '🥗'],
  [/\b(pasta|spaghetti|penne|linguine|fettuccine|lasagna|ravioli|gnocchi|mac)\b/, '🍝'],
  [/\b(curry|tikka|masala|korma|vindaloo)\b/, '🍛'],
  [/\b(rice|risotto|paella|biryani|fried rice|poke|bowl)\b/, '🍚'],
  [/\b(soup|chowder|bisque|stew|chili)\b/, '🍲'],
  [/\b(dumpling|gyoza|bao|potsticker|wonton)s?\b/, '🥟'],
  [/\b(shrimp|prawn|lobster|crab)s?\b/, '🍤'],
  [/\b(salmon|tuna|cod|fish|halibut|trout|seabass|sea bass)\b/, '🐟'],
  [/\b(steak|ribeye|sirloin|brisket|beef)\b/, '🥩'],
  [/\b(chicken|wings?|tenders?|nuggets?)\b/, '🍗'],
  [/\b(bacon|pork|ham|ribs?)\b/, '🥓'],
  [/\b(egg|eggs|omelet|omelette|frittata|benedict)\b/, '🍳'],
  [/\b(pancakes?|waffles?|crepes?)\b/, '🥞'],
  [/\b(fries|chips)\b/, '🍟'],
  [/\b(falafel|hummus|pita|gyro|shawarma|kebab)\b/, '🥙'],
  [/\b(tofu|tempeh|vegan|veggie|vegetable)s?\b/, '🥦'],
  [/\b(avocado|guacamole)\b/, '🥑'],
  [/\b(cake|cheesecake|brownie|cookie|pie|tart|dessert)s?\b/, '🍰'],
  [/\b(ice cream|gelato|sorbet|froyo)\b/, '🍨'],
  [/\b(smoothie|juice|shake)\b/, '🥤'],
  [/\b(coffee|latte|espresso|cappuccino|mocha)\b/, '☕'],
  [/\b(tea|matcha|chai)\b/, '🍵'],
  [/\b(bread|toast|bagel|croissant|muffin)s?\b/, '🥐'],
  [/\b(fruit|berries|berry|apple|banana|mango)\b/, '🍓'],
];

/** A food emoji for a dish name, from the words in it. A plate when nothing matches. */
export function dishEmoji(name: string): string {
  const n = name.toLowerCase();
  for (const [re, e] of DISHES) if (re.test(n)) return e;
  return '🍽️';
}

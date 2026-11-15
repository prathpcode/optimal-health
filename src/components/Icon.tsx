import { SymbolView, type SymbolViewProps } from 'expo-symbols';

/** SF Symbol on iOS, Material Symbol on Android/web. Every icon in the app is listed here. */
const ICONS = {
  back: { ios: 'chevron.left', android: 'arrow_back' },
  close: { ios: 'xmark', android: 'close' },
  chevron: { ios: 'chevron.right', android: 'chevron_right' },
  plus: { ios: 'plus', android: 'add' },
  flash: { ios: 'bolt.fill', android: 'flash_on' },
  flashOff: { ios: 'bolt.slash.fill', android: 'flash_off' },
  photos: { ios: 'photo.on.rectangle', android: 'photo_library' },
  camera: { ios: 'camera.fill', android: 'photo_camera' },
  menu: { ios: 'menucard', android: 'restaurant_menu' },
  barcode: { ios: 'barcode.viewfinder', android: 'barcode_scanner' },
  check: { ios: 'checkmark', android: 'check' },
  checkCircle: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  block: { ios: 'xmark.octagon.fill', android: 'block' },
  question: { ios: 'questionmark.circle.fill', android: 'help' },
  note: { ios: 'info.circle.fill', android: 'info' },
  sparkle: { ios: 'sparkles', android: 'auto_awesome' },
  allergy: { ios: 'allergens', android: 'emergency' },
  pill: { ios: 'pills.fill', android: 'medication' },
  heart: { ios: 'heart.text.square.fill', android: 'monitor_heart' },
  leaf: { ios: 'leaf.fill', android: 'eco' },
  person: { ios: 'person.crop.circle.fill', android: 'account_circle' },
  shield: { ios: 'checkmark.shield.fill', android: 'verified_user' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning' },
  retry: { ios: 'arrow.clockwise', android: 'refresh' },
  fork: { ios: 'fork.knife', android: 'restaurant' },
  server: { ios: 'bubble.left.and.text.bubble.right.fill', android: 'forum' },
  flame: { ios: 'flame.fill', android: 'local_fire_department' },
  sugar: { ios: 'cube.fill', android: 'category' },
  fat: { ios: 'drop.fill', android: 'water_drop' },
  salt: { ios: 'aqi.medium', android: 'grain' },
  box: { ios: 'shippingbox.fill', android: 'inventory_2' },
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, color, weight = 'semibold' }: { name: IconName; size?: number; color: string; weight?: SymbolViewProps['weight'] }) {
  const n = ICONS[name];
  return <SymbolView name={{ ios: n.ios, android: n.android, web: n.android } as SymbolViewProps['name']} size={size} tintColor={color} weight={weight} />;
}

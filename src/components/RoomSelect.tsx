import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import type { RoomView } from '@/lib/community';
import { radius, space, useTheme } from '@/theme';
import { RoomIcon } from './community';
import { Icon } from './Icon';
import { T } from './T';
import { Tap } from './Tap';

/**
 * Where a post goes, as plain text with a small chevron (like picking a community before posting); tap to choose
 * another of your rooms. `locked` shows the room without a choice.
 */
export function RoomSelect({ rooms, value, onChange, locked }: { rooms: RoomView[]; value?: string; onChange: (slug: string) => void; locked?: boolean }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const room = rooms.find((r) => r.slug === value);
  const canChoose = !locked && rooms.length > 1;
  if (!room) return null;

  return (
    <View style={{ alignSelf: 'flex-start', zIndex: 10 }}>
      <Tap
        accessibilityRole={canChoose ? 'button' : 'text'}
        accessibilityLabel={canChoose ? `Posting to ${room.title}. Change room` : `Posting to ${room.title}`}
        accessibilityState={canChoose ? { expanded: open } : undefined}
        disabled={!canChoose}
        feedback="select"
        scaleTo={0.97}
        onPress={() => setOpen((o) => !o)}>
        <View style={styles.trigger}>
          <T variant="body" tone="secondary" numberOfLines={1}>
            to{' '}
            <T variant="bodyStrong">{room.title}</T>
          </T>
          {canChoose ? <Icon name="down" size={12} color={c.textSecondary} weight="bold" /> : null}
        </View>
      </Tap>
      {open && canChoose ? (
        <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(100)} style={[styles.menu, { backgroundColor: c.card, borderColor: c.hairline }]}>
          {rooms.map((r, i) => (
            <Tap
              key={r.slug}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: r.slug === value }}
              accessibilityLabel={r.title}
              feedback="select"
              scaleTo={1}
              onPress={() => {
                onChange(r.slug);
                setOpen(false);
              }}
              style={[styles.item, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline } : null]}>
              <RoomIcon icon={r.icon} slug={r.slug} size={26} />
              <T variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                {r.title}
              </T>
              {r.slug === value ? <Icon name="check" size={14} color={c.text} weight="bold" /> : null}
            </Tap>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, paddingVertical: space.xs },
  menu: { position: 'absolute', top: 30, left: 0, minWidth: 240, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', elevation: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2, paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
});

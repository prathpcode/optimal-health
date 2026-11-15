import { router } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassButton } from '@/components/Glass';
import { JoinBar, joinRooms, RoomChecklist, usePickedRooms } from '@/components/RoomPicker';
import { T } from '@/components/T';
import { useTogether } from '@/lib/community';
import { gutter, space, titleTop, topBar, useTheme } from '@/theme';

/**
 * Every room you're not in yet, as a full page (glass rows and a pinned button behave in a page, not in a resizing
 * sheet). Tick as many as you like, then join them all at once.
 */
export default function RoomsScreen() {
  const { all } = useTogether();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = Platform.OS === 'ios' ? insets.bottom : space.md;
  // Rooms that match your profile first, and start ticked.
  const rooms = all.filter((r) => !r.joined).sort((a, b) => b.reasons.length - a.reasons.length);
  const { picked, toggle } = usePickedRooms(
    rooms,
    rooms.filter((r) => r.reasons.length).map((r) => r.slug),
  );
  const back = () => (router.canGoBack() ? router.back() : router.replace('/together'));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingTop: insets.top + titleTop, paddingHorizontal: gutter, paddingBottom: bottom + 62 + space.huge }}
        showsVerticalScrollIndicator={false}>
        <T variant="heroBold" accessibilityRole="header" style={styles.title}>
          More rooms
        </T>
        {rooms.length === 0 ? (
          <T tone="secondary" style={{ textAlign: 'center' }}>
            You’re in every room.
          </T>
        ) : (
          <RoomChecklist rooms={rooms} picked={picked} onToggle={toggle} />
        )}
      </ScrollView>
      <View style={{ position: 'absolute', top: insets.top + topBar, left: gutter }}>
        <GlassButton tone="theme" icon="back" label="Back" onPress={back} />
      </View>
      <JoinBar
        picked={picked}
        hideWhenEmpty
        bottom={bottom + space.md}
        onJoin={async (slugs) => {
          if (await joinRooms(slugs)) back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { textAlign: 'center', marginBottom: space.xxl },
});

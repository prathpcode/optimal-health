import { router } from 'expo-router';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { joinRooms, RoomPicker } from '@/components/RoomPicker';
import { T } from '@/components/T';
import { useTogether } from '@/lib/community';
import { space } from '@/theme';

/** Every room you're not in yet. Tick as many as you like, then join them all at once. */
export default function RoomsSheet() {
  const { all } = useTogether();
  const insets = useSafeAreaInsets();
  // Rooms that match your profile first.
  const rooms = all.filter((r) => !r.joined).sort((a, b) => b.reasons.length - a.reasons.length);

  return (
    <ScrollView contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.xxxl, gap: space.xl }} showsVerticalScrollIndicator={false}>
      <T variant="heroBold">More rooms</T>
      {rooms.length === 0 ? (
        <T tone="secondary">You’re in every room.</T>
      ) : (
        <RoomPicker
          rooms={rooms}
          initial={rooms.filter((r) => r.reasons.length).map((r) => r.slug)}
          onJoin={async (slugs) => {
            if (await joinRooms(slugs)) router.back();
          }}
        />
      )}
    </ScrollView>
  );
}

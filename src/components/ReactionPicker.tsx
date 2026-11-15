import { StyleSheet, View } from 'react-native';

import type { Reaction } from '@/lib/community';
import { REACTION_EMOJI } from '@/lib/emoji';
import { radius, space, tint, useTheme } from '@/theme';
import { T } from './T';
import { Tap } from './Tap';
import { REACTION_LABEL } from './together';

const REACTIONS: Reaction[] = ['loved', 'okay', 'nope'];

/** "How was it?": three big choices in a row, filled with the room's colour when picked. */
export function ReactionPicker({ value, onChange, accent }: { value: Reaction | null; onChange: (r: Reaction) => void; accent: string }) {
  const { c, dark } = useTheme();
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {REACTIONS.map((r) => {
        const on = value === r;
        return (
          <Tap
            key={r}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={REACTION_LABEL[r]}
            feedback="select"
            scaleTo={0.94}
            onPress={() => onChange(r)}
            style={[styles.reaction, { backgroundColor: on ? accent : dark ? c.cardMuted : tint(accent, 0.08) }]}>
            <T style={styles.emoji} accessibilityElementsHidden>
              {REACTION_EMOJI[r]}
            </T>
            <T variant="caption" color={on ? '#FFFFFF' : c.text} style={{ textAlign: 'center' }}>
              {REACTION_LABEL[r]}
            </T>
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  reaction: { flex: 1, height: 96, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.sm },
  emoji: { fontSize: 28, lineHeight: 34 },
});

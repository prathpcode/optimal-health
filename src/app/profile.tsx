import Constants from 'expo-constants';
import { StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassButton } from '@/components/Glass';
import { T } from '@/components/T';
import { setFirstName, useFirstName } from '@/lib/name';
import { goBack } from '@/lib/nav';
import { gutter, radius, space, useTheme } from '@/theme';

/** Opened from the button at the top right of Home: the name Home greets, and the app version. */
export default function ProfileScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const name = useFirstName();
  return (
    <View style={[styles.body, { backgroundColor: c.bg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg }]}>
      <View style={{ gap: space.xl }}>
        <View style={{ alignSelf: 'flex-start' }}>
          <GlassButton tone="theme" icon="back" label="Back" onPress={goBack} />
        </View>
        <T variant="display">Profile</T>
        <View style={{ gap: space.sm }}>
          <T variant="caption" tone="secondary">
            Name
          </T>
          <TextInput
            value={name ?? ''}
            onChangeText={setFirstName}
            placeholder="First name"
            placeholderTextColor={c.textTertiary}
            autoCorrect={false}
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
            returnKeyType="done"
            maxLength={24}
            style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.hairline }]}
            accessibilityLabel="First name"
          />
        </View>
      </View>
      <T variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
        Fit {Constants.expoConfig?.version}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: gutter, justifyContent: 'space-between' },
  input: { height: 52, borderRadius: radius.button, borderWidth: 1.5, paddingHorizontal: space.lg, fontSize: 17 },
});

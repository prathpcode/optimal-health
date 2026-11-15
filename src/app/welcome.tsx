import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassButton } from '@/components/Glass';
import { T } from '@/components/T';
import { setFirstName } from '@/lib/name';
import { gutter, space, useTheme } from '@/theme';

/** First launch: ask for a first name, which Home greets. */
export default function WelcomeScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState('');
  const name = value.trim();

  const done = () => {
    if (!name) return;
    setFirstName(name);
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.body, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.lg }]}>
        <View style={{ gap: space.xxl }}>
          <T variant="hero">What should we call you?</T>
          <TextInput
            value={value}
            onChangeText={setValue}
            onSubmitEditing={done}
            placeholder="First name"
            placeholderTextColor={c.textTertiary}
            autoFocus
            autoCorrect={false}
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
            returnKeyType="done"
            maxLength={24}
            selectionColor={c.text}
            style={[styles.input, { color: c.text, borderBottomColor: c.text }]}
            accessibilityLabel="First name"
          />
        </View>
        <View style={{ alignSelf: 'flex-end' }}>
          <GlassButton tone="theme" icon="check" label="Continue" size={68} onPress={done} disabled={!name} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: gutter, justifyContent: 'space-between' },
  input: { fontSize: 28, fontWeight: '600', letterSpacing: -0.4, paddingVertical: space.md, borderBottomWidth: 2 },
});

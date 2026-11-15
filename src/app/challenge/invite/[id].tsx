import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { inviteToChallenge } from '@/components/challenge';
import { Avatar } from '@/components/community';
import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { attempt } from '@/components/together';
import { invitePerson, PREVIEW, useChallenge, usePeople, type Person } from '@/lib/community';
import { radius, space, type as typeScale, useTheme } from '@/theme';

/**
 * Invite friends to a race without leaving the app: search people signed in with Whop by name or username, or pick
 * from people you have raced with, and tap Invite. The invite shows on their Together tab. A link to share anywhere
 * else is at the bottom, for friends who are not on the app yet.
 */
export default function InviteSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const ch = useChallenge(id);
  const [text, setText] = useState('');
  // What is searched for: the typed text once typing pauses, so each letter is not its own request.
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const searching = q.length >= 2;
  const people = usePeople(id, searching ? q : '');
  // People invited in this sheet show as invited at once, before the backend's answer comes round.
  const [sent, setSent] = useState<string[]>([]);
  const [sending, setSending] = useState<string | null>(null);

  const invite = async (p: Person) => {
    setSending(p.id);
    const ok = await attempt(invitePerson(id, p.id));
    setSending(null);
    if (ok) setSent((s) => [...s, p.id]);
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.xxl, paddingBottom: insets.bottom + space.xl, gap: space.xl }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled">
      <T variant="heroBold">Invite friends</T>

      {PREVIEW ? null : (
        <View style={[styles.search, { backgroundColor: c.cardMuted }]}>
          <Icon name="people" size={18} color={c.textTertiary} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Name or Whop username"
            placeholderTextColor={c.textTertiary}
            style={[typeScale.body, styles.input, { color: c.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            maxLength={40}
            accessibilityLabel="Search for a friend by name or Whop username"
          />
          {text ? (
            <Tap accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setText('')} hitSlop={10}>
              <Icon name="close" size={14} color={c.textTertiary} />
            </Tap>
          ) : null}
        </View>
      )}

      {people === undefined ? (
        <ActivityIndicator color={c.textSecondary} />
      ) : people.length ? (
        <View style={{ gap: space.sm }}>
          {searching ? null : (
            <T variant="bodyStrong" tone="secondary">
              People you’ve raced with
            </T>
          )}
          <View>
            {people.map((p, i) => (
              <PersonRow key={p.id} person={p} first={i === 0} sent={sent.includes(p.id)} busy={sending === p.id} onInvite={() => invite(p)} />
            ))}
          </View>
        </View>
      ) : searching ? (
        <T variant="bodyStrong" tone="secondary">
          Nobody on the app by that name yet. Send them the link instead.
        </T>
      ) : null}

      {ch ? (
        <Tap accessibilityRole="button" accessibilityLabel="Share a link instead" feedback="tap" scaleTo={0.98} onPress={() => void inviteToChallenge(ch)}>
          <View style={[styles.link, { borderColor: c.hairline }]}>
            <Icon name="share" size={18} color={c.text} />
            <T variant="headline">Share a link instead</T>
          </View>
        </Tap>
      ) : null}
    </ScrollView>
  );
}

function PersonRow({ person, first, sent, busy, onInvite }: { person: Person; first: boolean; sent: boolean; busy: boolean; onInvite: () => void }) {
  const { c } = useTheme();
  const state = person.state ?? (sent ? 'invited' : null);
  const label = state === 'in' ? 'In the race' : state === 'invited' ? 'Invited' : 'Invite';
  return (
    <View style={[styles.person, first ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline }]}>
      <Avatar name={person.name} url={person.avatarUrl} size={44} />
      <View style={{ flex: 1 }}>
        <T variant="headline" numberOfLines={1}>
          {person.name}
        </T>
        <T variant="caption" tone="secondary" numberOfLines={1}>
          @{person.username}
        </T>
      </View>
      {state ? (
        <T variant="bodyStrong" tone="tertiary">
          {label}
        </T>
      ) : (
        <Tap accessibilityRole="button" accessibilityLabel={`Invite ${person.name}`} feedback="tap" disabled={busy} onPress={onInvite}>
          <View style={[styles.invite, { backgroundColor: c.primary }]}>
            {busy ? <ActivityIndicator color={c.onPrimary} size="small" /> : <T variant="bodyStrong" color={c.onPrimary}>{label}</T>}
          </View>
        </Tap>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 52, borderRadius: radius.md, paddingHorizontal: space.lg },
  input: { flex: 1, height: 52, paddingVertical: 0 },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  invite: { minWidth: 84, height: 40, paddingHorizontal: space.lg, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, height: 54, borderRadius: radius.button, borderWidth: 1.5 },
});

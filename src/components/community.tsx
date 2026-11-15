import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { countdown, initials, money, type ChallengeView, type RoomView } from '@/lib/community';
import { radius, roomAccent, shadow, space, useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';
import { T } from './T';
import { Tap } from './Tap';
import { Card } from './ui';

export function Avatar({ name, url, size = 32 }: { name: string; url?: string; size?: number }) {
  const { c } = useTheme();
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (url) return <Image source={{ uri: url }} style={box} contentFit="cover" accessibilityIgnoresInvertColors />;
  return (
    <View style={[box, styles.center, { backgroundColor: c.cardMuted }]}>
      <T variant="caption" tone="secondary" style={{ fontSize: Math.max(10, size * 0.36), lineHeight: size * 0.5 }}>
        {initials(name)}
      </T>
    </View>
  );
}

/** A room's icon on its accent colour. Without a slug it falls back to the neutral muted tile. */
export function RoomIcon({ icon, size = 44, slug }: { icon: string; size?: number; slug?: string }) {
  const { c } = useTheme();
  const accent = slug ? roomAccent[slug] : undefined;
  return (
    <View style={[styles.center, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: accent ?? c.cardMuted }]}>
      <Icon name={icon as IconName} size={size * 0.45} color={accent ? '#FFFFFF' : c.text} />
    </View>
  );
}

export function BackButton() {
  const { c, dark } = useTheme();
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel="Back"
      feedback="tap"
      hitSlop={8}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/together'))}
      style={[styles.round, { backgroundColor: c.card }, shadow('card', dark)]}>
      <Icon name="back" size={17} color={c.text} />
    </Tap>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.hairline, marginLeft: 76 }} />;
}

/** One room in a list: icon, name, why you are here (or how many people are), and a trailing element. */
export function RoomRow({ room, trailing, onPress }: { room: RoomView; trailing?: React.ReactNode; onPress?: () => void }) {
  const { c } = useTheme();
  const detail = [`${room.members.toLocaleString()} members`, room.reasons[0]].filter(Boolean).join(' · ');
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${room.title}, ${detail}`}
      onPress={onPress ?? (() => router.push({ pathname: '/community/[slug]', params: { slug: room.slug } }))}
      scaleTo={0.98}
      style={styles.row}>
      <RoomIcon icon={room.icon} slug={room.slug} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="headline" numberOfLines={1}>
          {room.title}
        </T>
        <T variant="caption" tone="secondary" numberOfLines={1}>
          {detail}
        </T>
      </View>
      {trailing ?? <Icon name="chevron" size={14} color={c.textTertiary} />}
    </Tap>
  );
}

export function ChallengeCard({ ch, showRoom }: { ch: ChallengeView; showRoom?: boolean }) {
  const { c } = useTheme();
  const progress = ch.me && ch.max ? ch.me.score / ch.max : 0;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${ch.title}, ${ch.entryCents ? `${money(ch.potCents)} pot` : 'free'}, ${countdown(ch)}`}
      onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: ch.id } })}
      scaleTo={0.98}>
      <Card style={{ gap: space.lg }}>
        <View style={styles.cardTop}>
          <View style={[styles.trophy, { backgroundColor: ch.joined ? c.primary : c.cardMuted }]}>
            <Icon name="trophy" size={18} color={ch.joined ? c.onPrimary : c.text} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="headline" numberOfLines={1}>
              {ch.title}
            </T>
            <T variant="caption" tone="secondary" numberOfLines={1}>
              {[showRoom ? ch.roomTitle : null, `${ch.days} days`, countdown(ch)].filter(Boolean).join(' · ')}
            </T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T variant="headline" style={{ fontVariant: ['tabular-nums'] }}>
              {ch.entryCents ? money(ch.potCents) : 'Free'}
            </T>
            <T variant="caption" tone="tertiary">
              {ch.entryCents ? 'pot' : `${ch.players.length} in`}
            </T>
          </View>
        </View>
        {ch.joined && ch.status !== 'upcoming' ? (
          <View style={{ gap: space.sm }}>
            <View style={[styles.track, { backgroundColor: c.cardMuted }]}>
              <View style={[styles.fill, { backgroundColor: c.text, width: `${Math.round(progress * 100)}%` }]} />
            </View>
            <View style={styles.between}>
              <T variant="caption" tone="secondary">
                {ch.me?.score ?? 0} of {ch.max} points
              </T>
              <T variant="caption" tone="secondary">
                {ch.me ? ordinal(ch.me.rank) : ''} of {ch.players.length}
              </T>
            </View>
          </View>
        ) : (
          <View style={styles.faces}>
            {ch.standings.slice(0, 4).map((p, i) => (
              <View key={p.id} style={{ marginLeft: i ? -8 : 0, borderRadius: 14, borderWidth: 2, borderColor: c.card }}>
                <Avatar name={p.name} size={24} />
              </View>
            ))}
            <T variant="caption" tone="secondary" style={{ marginLeft: space.sm }}>
              {ch.players.length} {ch.players.length === 1 ? 'player' : 'players'}
              {ch.entryCents ? ` · ${money(ch.entryCents)} to join` : ''}
            </T>
            {ch.joined ? (
              <View style={[styles.badge, { backgroundColor: c.cardMuted }]}>
                <T variant="caption">Joined</T>
              </View>
            ) : null}
          </View>
        )}
      </Card>
    </Tap>
  );
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  trophy: { width: 40, height: 40, borderRadius: radius.sm + 2, alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  faces: { flexDirection: 'row', alignItems: 'center' },
  badge: { marginLeft: 'auto', paddingHorizontal: space.sm + 2, paddingVertical: 3, borderRadius: radius.chip },
});

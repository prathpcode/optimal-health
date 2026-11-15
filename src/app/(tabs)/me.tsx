import { useAction } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@convex/_generated/api';
import { allergyOptions, conditionOptions, dietOptions } from '@engine/compileRules';
import { tagLabel } from '@engine/tags';
import type { Rule } from '@engine/types';
import { Icon, type IconName } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { Card, Chip, SectionLabel } from '@/components/ui';
import { HAS_BACKEND } from '@/lib/backend';
import { useProfile, type MedStatus } from '@/lib/profile';
import { LEVEL_LABEL } from '@/lib/verdict';
import { duration, enterAt, gutter, radius, space, useTheme, type Colors } from '@/theme';

const ALLERGIES = allergyOptions().map((a) => ({ key: a.tag, label: capital(a.label) }));
const DIETS = dietOptions();
const CONDITIONS = conditionOptions();

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((x) => x !== key) : [...list, key]);

export default function MeScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { profile, rules, meds, update, setRuleEnabled, saved } = useProfile();

  const addMedication = (name: string) =>
    update((p) => (p.medications.some((m) => m.name.toLowerCase() === name.toLowerCase()) ? p : { ...p, medications: [...p.medications, { name }] }));
  const removeMedication = (name: string) => update((p) => ({ ...p, medications: p.medications.filter((m) => m.name !== name) }));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingHorizontal: gutter, paddingBottom: (Platform.OS === 'ios' ? insets.bottom : 0) + space.xxxl }}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <T variant="display">Me</T>
        {saved ? (
          <Animated.View entering={FadeIn.duration(duration.fast)} exiting={FadeOut.duration(duration.base)} style={[styles.saved, { backgroundColor: c.goodSoft }]}>
            <Icon name="check" size={12} color={c.good} weight="bold" />
            <T variant="caption" color={c.good}>
              Saved
            </T>
          </Animated.View>
        ) : null}
      </View>
      <T tone="secondary" style={{ marginBottom: space.xl }}>
        What you choose here becomes the rules every scan is checked against.
      </T>

      <Section index={0} title="Allergies" icon="allergy">
        <View style={styles.chips}>
          {ALLERGIES.map((o) => (
            <Chip key={o.key} label={o.label} selected={profile.allergies.includes(o.key)} onPress={() => update((p) => ({ ...p, allergies: toggle(p.allergies, o.key) }))} />
          ))}
        </View>
      </Section>

      <Section index={1} title="Medicines" icon="pill">
        <MedicineList
          names={profile.medications.map((m) => m.name)}
          meds={meds}
          onRemove={removeMedication}
        />
        {HAS_BACKEND ? <MedicineSearch onAdd={addMedication} taken={profile.medications.map((m) => m.name.toLowerCase())} /> : null}
        <T variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>
          Food rules are read from each medicine’s FDA label. Name only, no dose.
        </T>
      </Section>

      <Section index={2} title="Conditions" icon="heart">
        <View style={styles.chips}>
          {CONDITIONS.map((o) => (
            <Chip
              key={o.key}
              label={o.label}
              selected={profile.conditions.some((x) => x.key === o.key)}
              onPress={() =>
                update((p) => ({
                  ...p,
                  conditions: p.conditions.some((x) => x.key === o.key) ? p.conditions.filter((x) => x.key !== o.key) : [...p.conditions, { name: o.label, key: o.key }],
                }))
              }
            />
          ))}
        </View>
      </Section>

      <Section index={3} title="Diet" icon="leaf">
        <View style={styles.chips}>
          {DIETS.map((o) => (
            <Chip key={o.key} label={o.label} selected={profile.diets.includes(o.key)} onPress={() => update((p) => ({ ...p, diets: toggle(p.diets, o.key) }))} />
          ))}
        </View>
      </Section>

      <View style={[styles.sectionTitle, { marginTop: space.sm }]}>
        <Icon name="shield" size={15} color={c.textSecondary} />
        <SectionLabel>Your rules</SectionLabel>
      </View>
      {rules.length === 0 ? (
        <Card muted>
          <T tone="secondary">No rules yet. Pick an allergy, medicine, condition or diet above and your rules appear here.</T>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {rules.map((r, i) => (
            <Animated.View
              key={r.id}
              entering={reduced ? FadeIn : FadeIn.duration(duration.base)}
              exiting={FadeOut.duration(duration.fast)}
              layout={reduced ? undefined : LinearTransition.springify().damping(22)}>
              {i > 0 ? <View style={[styles.divider, { backgroundColor: c.hairline }]} /> : null}
              <RuleRow rule={r} onToggle={(on) => setRuleEnabled(r.id, on)} />
            </Animated.View>
          ))}
        </Card>
      )}
      <T variant="caption" tone="tertiary" style={{ marginTop: space.md }}>
        Fit is a reference tool. It never tells you to take, stop or change a medicine.
      </T>
    </ScrollView>
  );
}

function Section({ index, title, icon, children }: { index: number; title: string; icon: IconName; children: React.ReactNode }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={enterAt(index, reduced)} style={{ marginBottom: space.xxl }}>
      <View style={styles.sectionTitle}>
        <Icon name={icon} size={15} color={c.textSecondary} />
        <SectionLabel>{title}</SectionLabel>
      </View>
      {children}
    </Animated.View>
  );
}

const MED_STATE: Record<MedStatus['state'], string> = {
  pending: 'Reading the label…',
  rules: '',
  no_rules: 'No food rules on its label',
  not_recognised: 'Name not recognised',
  no_label: 'No FDA label found',
  failed: 'Couldn’t read the label. Save again to retry.',
};

function MedicineList({ names, meds, onRemove }: { names: string[]; meds: MedStatus[]; onRemove: (name: string) => void }) {
  const { c } = useTheme();
  if (names.length === 0) return null;
  return (
    <Card style={{ padding: 0, overflow: 'hidden', marginBottom: space.md }}>
      {names.map((name, i) => {
        const status = meds.find((m) => m.name.toLowerCase() === name.toLowerCase());
        const state = status?.state ?? 'pending';
        const text = state === 'rules' ? `${status?.ruleCount ?? 0} ${status?.ruleCount === 1 ? 'rule' : 'rules'} from its label` : MED_STATE[state];
        const bad = state === 'not_recognised' || state === 'no_label' || state === 'failed';
        return (
          <Animated.View key={name} entering={FadeIn.duration(duration.base)} layout={LinearTransition.springify().damping(22)}>
            {i > 0 ? <View style={[styles.divider, { backgroundColor: c.hairline }]} /> : null}
            <View style={styles.med}>
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="bodyStrong">{name}</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {state === 'pending' ? <ActivityIndicator size="small" color={c.textSecondary} /> : null}
                  <T variant="caption" color={bad ? c.okay : c.textSecondary}>
                    {text}
                  </T>
                </View>
              </View>
              <Tap accessibilityRole="button" accessibilityLabel={`Remove ${name}`} feedback="tap" onPress={() => onRemove(name)} hitSlop={10} style={[styles.remove, { backgroundColor: c.cardMuted }]}>
                <Icon name="close" size={11} color={c.textSecondary} weight="bold" />
              </Tap>
            </View>
          </Animated.View>
        );
      })}
    </Card>
  );
}

/** Search-as-you-type through lookup.medications (NLM); brand names resolve to the drug. */
function MedicineSearch({ onAdd, taken }: { onAdd: (name: string) => void; taken: string[] }) {
  const { c } = useTheme();
  const lookup = useAction(api.lookup.medications);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<{ name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) return;
    const mine = ++seq.current;
    const t = setTimeout(() => {
      setLoading(true);
      lookup({ term: q })
        .then((r) => {
          if (mine === seq.current) setResults(r.slice(0, 6));
        })
        .catch(() => {})
        .finally(() => {
          if (mine === seq.current) setLoading(false);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [term, lookup]);

  const shown = term.trim().length < 2 ? [] : results.filter((r) => !taken.includes(r.name.toLowerCase()));

  return (
    <View>
      <View style={[styles.search, { backgroundColor: c.card, borderColor: c.hairline }]}>
        <Icon name="plus" size={15} color={c.textSecondary} />
        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder="Add a medicine"
          placeholderTextColor={c.textTertiary}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
          style={[styles.input, { color: c.text }]}
          accessibilityLabel="Add a medicine"
        />
        {loading ? <ActivityIndicator size="small" color={c.textSecondary} /> : null}
      </View>
      {shown.length > 0 ? (
        <Animated.View entering={FadeIn.duration(duration.fast)} style={[styles.results, { backgroundColor: c.card, borderColor: c.hairline }]}>
          {shown.map((r, i) => (
            <Tap
              key={r.name}
              accessibilityRole="button"
              accessibilityLabel={`Add ${r.name}`}
              feedback="select"
              scaleTo={0.98}
              onPress={() => {
                onAdd(r.name);
                setTerm('');
                setResults([]);
              }}
              style={[styles.result, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline } : null]}>
              <T variant="body">{r.name}</T>
              <Icon name="plus" size={13} color={c.textTertiary} />
            </Tap>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

function levelColor(level: Rule['level'], c: Colors) {
  if (level === 'never') return { fg: c.notFit, bg: c.notFitSoft };
  if (level === 'avoid') return { fg: c.okay, bg: c.okaySoft };
  return { fg: c.textSecondary, bg: c.cantTellSoft };
}

const STATUS_TEXT: Record<Rule['status'], string> = {
  library: '',
  sourced: 'sourced',
  from_label: 'FDA label',
  unverified: 'unverified',
};

function RuleRow({ rule, onToggle }: { rule: Rule; onToggle: (on: boolean) => void }) {
  const { c } = useTheme();
  const col = levelColor(rule.level, c);
  const name = tagLabel(rule.tag);
  const budget = rule.budget ? ` (${rule.budget.amount.toLocaleString()} ${rule.budget.unit} a day)` : '';
  const status = STATUS_TEXT[rule.status];
  return (
    <View style={[styles.rule, !rule.enabled ? { opacity: 0.5 } : null]}>
      <View style={[styles.level, { backgroundColor: col.bg }]}>
        <T variant="micro" color={col.fg}>
          {LEVEL_LABEL[rule.level]}
        </T>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong">
          {capital(name)}
          {budget}
        </T>
        <View style={styles.ruleMeta}>
          <T variant="caption" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
            {rule.from.label}
          </T>
          {status ? (
            <T variant="caption" color={rule.status === 'unverified' ? c.okay : c.textTertiary}>
              · {status}
            </T>
          ) : null}
        </View>
      </View>
      <Switch
        value={rule.enabled}
        onValueChange={onToggle}
        trackColor={{ true: c.primary, false: c.cardMuted }}
        thumbColor={c.card}
        ios_backgroundColor={c.cardMuted}
        accessibilityLabel={`${LEVEL_LABEL[rule.level]} ${name}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.chip },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: space.lg },
  rule: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md + 2 },
  level: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, minWidth: 62, alignItems: 'center' },
  ruleMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  med: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  remove: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 48, borderRadius: radius.button, borderWidth: 1.5, paddingHorizontal: space.lg },
  input: { flex: 1, fontSize: 16, height: '100%' },
  results: { marginTop: space.sm, borderRadius: radius.button, borderWidth: 1.5, overflow: 'hidden' },
  result: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md + 2 },
});

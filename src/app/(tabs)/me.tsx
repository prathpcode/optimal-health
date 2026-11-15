import { useAction } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@convex/_generated/api';
import { allergyOptions, conditionOptions, dietOptions } from '@engine/compileRules';
import { checkCustomRule, customLevelsFor } from '@engine/customRules';
import { TAGS, tagLabel } from '@engine/tags';
import type { Rule, RuleLevel } from '@engine/types';
import { GlassSurface } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { Tap } from '@/components/Tap';
import { Card, Chip } from '@/components/ui';
import { HAS_BACKEND } from '@/lib/backend';
import { useProfile, type MedStatus, type ProfileRule } from '@/lib/profile';
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
  const { profile, rules, meds, update, setRuleEnabled, addRule, removeRule, saved } = useProfile();

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
        <T variant="heroBold">Manage</T>
        {saved ? (
          <Animated.View entering={FadeIn.duration(duration.fast)} exiting={FadeOut.duration(duration.base)} style={[styles.saved, { backgroundColor: c.goodSoft }]}>
            <Icon name="check" size={12} color={c.good} weight="bold" />
            <T variant="caption" color={c.good}>
              Saved
            </T>
          </Animated.View>
        ) : null}
      </View>
      <PickSection index={0} title="Allergies" options={ALLERGIES} selected={profile.allergies} onToggle={(key) => update((p) => ({ ...p, allergies: toggle(p.allergies, key) }))} />

      <Section index={1} title="Medicines">
        <MedicineList
          names={profile.medications.map((m) => m.name)}
          meds={meds}
          onRemove={removeMedication}
        />
        {HAS_BACKEND ? <MedicineSearch onAdd={addMedication} taken={profile.medications.map((m) => m.name.toLowerCase())} /> : null}
      </Section>

      <PickSection
        index={2}
        title="Conditions"
        options={CONDITIONS}
        selected={profile.conditions.flatMap((x) => (x.key ? [x.key] : []))}
        onToggle={(key) =>
          update((p) => ({
            ...p,
            conditions: p.conditions.some((x) => x.key === key) ? p.conditions.filter((x) => x.key !== key) : [...p.conditions, { name: CONDITIONS.find((o) => o.key === key)?.label ?? key, key }],
          }))
        }
      />

      <PickSection index={3} title="Diet" options={DIETS} selected={profile.diets} onToggle={(key) => update((p) => ({ ...p, diets: toggle(p.diets, key) }))} />

      <View style={styles.sectionTitle}>
        <T variant="heading">Rules</T>
      </View>
      {rules.length === 0 ? null : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {rules.map((r, i) => (
            <Animated.View
              key={r.id}
              entering={reduced ? FadeIn : FadeIn.duration(duration.base)}
              exiting={FadeOut.duration(duration.fast)}
              layout={reduced ? undefined : LinearTransition.springify().damping(22)}>
              {i > 0 ? <View style={[styles.divider, { backgroundColor: c.hairline }]} /> : null}
              <RuleRow rule={r} onToggle={(on) => setRuleEnabled(r.id, on)} onRemove={r.custom ? () => removeRule(r.id) : undefined} />
            </Animated.View>
          ))}
        </Card>
      )}
      <AddRule rules={rules} onAdd={addRule} />
    </ScrollView>
  );
}

function Section({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={enterAt(index, reduced)} style={{ marginBottom: space.xxxl }}>
      <View style={styles.sectionTitle}>
        <T variant="heading">{title}</T>
      </View>
      {children}
    </Animated.View>
  );
}

/** Shows only what is chosen. The Add control after the last chip opens the rest of the list to add from. */
function PickSection({ index, title, options, selected, onToggle }: { index: number; title: string; options: { key: string; label: string }[]; selected: string[]; onToggle: (key: string) => void }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const chosen = options.filter((o) => selected.includes(o.key));
  const rest = options.filter((o) => !selected.includes(o.key));
  return (
    <Section index={index} title={title}>
      <View style={styles.chips}>
        {chosen.map((o) => (
          <Chip key={o.key} label={o.label} selected onPress={() => onToggle(o.key)} />
        ))}
        <Tap accessibilityRole="button" accessibilityLabel={open ? `Hide other ${title.toLowerCase()}` : `Show all ${title.toLowerCase()}`} accessibilityState={{ expanded: open }} feedback="select" onPress={() => setOpen((o) => !o)}>
          <GlassSurface tone="theme" interactive style={styles.reveal}>
            <T variant="bodyStrong">{open ? 'Done' : 'Add'}</T>
            <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
              <Icon name="down" size={12} color={c.textSecondary} />
            </View>
          </GlassSurface>
        </Tap>
      </View>
      {open && rest.length > 0 ? (
        <Animated.View entering={FadeIn.duration(duration.fast)} style={[styles.chips, { marginTop: space.md }]}>
          {rest.map((o) => (
            <Chip key={o.key} label={o.label} selected={false} onPress={() => onToggle(o.key)} />
          ))}
        </Animated.View>
      ) : null}
    </Section>
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
        const text = MED_STATE[state];
        const bad = state === 'not_recognised' || state === 'no_label' || state === 'failed';
        return (
          <Animated.View key={name} entering={FadeIn.duration(duration.base)} layout={LinearTransition.springify().damping(22)}>
            {i > 0 ? <View style={[styles.divider, { backgroundColor: c.hairline }]} /> : null}
            <View style={styles.med}>
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="bodyStrong">{name}</T>
                {text ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {state === 'pending' ? <ActivityIndicator size="small" color={c.textSecondary} /> : null}
                    <T variant="caption" color={bad ? c.okay : c.textSecondary}>
                      {text}
                    </T>
                  </View>
                ) : null}
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

const describe = (r: Rule) => `${LEVEL_LABEL[r.level]} ${tagLabel(r.tag)} (${r.from.label})`;

/**
 * Add a rule of the person's own (rules.addCustom): pick a food or ingredient from the fixed tag list, then how
 * strict. A custom rule replaces whatever rule is already on that tag, so the form says what it would replace, and
 * will not swap a stronger rule from the profile (an allergy, a medicine's label) for a weaker one.
 */
function AddRule({ rules, onAdd }: { rules: ProfileRule[]; onAdd: (tag: string, level: RuleLevel) => void }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [level, setLevel] = useState<RuleLevel | null>(null);

  const reset = () => {
    setOpen(false);
    setTerm('');
    setTag(null);
    setLevel(null);
  };

  if (!open) {
    return (
      <Tap accessibilityRole="button" accessibilityLabel="Add your own rule" feedback="tap" scaleTo={0.98} onPress={() => setOpen(true)} style={[styles.addRule, { borderColor: c.hairline }]}>
        <Icon name="plus" size={15} color={c.textSecondary} />
        <T variant="bodyStrong" tone="secondary">
          Add your own rule
        </T>
      </Tap>
    );
  }

  const q = term.trim().toLowerCase();
  const matches = q.length < 2 ? [] : TAGS.filter((t) => t.label.toLowerCase().includes(q) || t.id.replace(/_/g, ' ').includes(q)).slice(0, 6);
  const levels = tag ? customLevelsFor(tag) : [];
  const check = tag && level ? checkCustomRule(rules, tag, level) : null;

  return (
    <Animated.View entering={FadeIn.duration(duration.fast)} style={{ marginTop: space.md, gap: space.md }}>
      {tag ? (
        <View style={styles.picked}>
          <T variant="bodyStrong" style={{ flex: 1 }}>
            {capital(tagLabel(tag))}
          </T>
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Choose something else"
            feedback="tap"
            onPress={() => {
              setTag(null);
              setLevel(null);
            }}
            hitSlop={10}
            style={[styles.remove, { backgroundColor: c.cardMuted }]}>
            <Icon name="close" size={11} color={c.textSecondary} weight="bold" />
          </Tap>
        </View>
      ) : (
        <View>
          <View style={[styles.search, { backgroundColor: c.card, borderColor: c.hairline }]}>
            <Icon name="plus" size={15} color={c.textSecondary} />
            <TextInput
              value={term}
              onChangeText={setTerm}
              placeholder="A food or ingredient, such as pork"
              placeholderTextColor={c.textTertiary}
              autoCorrect={false}
              autoCapitalize="none"
              autoFocus
              returnKeyType="done"
              style={[styles.input, { color: c.text }]}
              accessibilityLabel="Food or ingredient for your rule"
            />
          </View>
          {matches.length > 0 ? (
            <View style={[styles.results, { backgroundColor: c.card, borderColor: c.hairline }]}>
              {matches.map((t, i) => (
                <Tap
                  key={t.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${t.label}`}
                  feedback="select"
                  scaleTo={0.98}
                  onPress={() => {
                    const allowed = customLevelsFor(t.id);
                    setTag(t.id);
                    setLevel(allowed.length === 1 ? allowed[0] : null);
                  }}
                  style={[styles.result, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline } : null]}>
                  <T variant="body">{capital(t.label)}</T>
                  <Icon name="chevron" size={13} color={c.textTertiary} />
                </Tap>
              ))}
            </View>
          ) : q.length >= 2 ? (
            <T variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>
              Nothing by that name yet. Rules can only be about foods and ingredients Second Look knows how to look for.
            </T>
          ) : null}
        </View>
      )}

      {tag ? (
        <View style={styles.chips}>
          {levels.map((l) => (
            <Chip key={l} label={LEVEL_LABEL[l]} selected={level === l} onPress={() => setLevel(l)} />
          ))}
        </View>
      ) : null}

      {check?.weakens ? (
        <T variant="caption" color={c.okay}>
          You already have a stronger rule: {describe(check.weakens)}. If you no longer need it, switch it off in the list above.
        </T>
      ) : check?.replaces.length ? (
        <T variant="caption" tone="secondary">
          This replaces {check.replaces.map(describe).join(' and ')}.
        </T>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Tap accessibilityRole="button" accessibilityLabel="Cancel" feedback="tap" onPress={reset} style={[styles.formButton, { backgroundColor: c.card, borderWidth: 1.5, borderColor: c.hairline }]}>
          <T variant="bodyStrong">Cancel</T>
        </Tap>
        <Tap
          accessibilityRole="button"
          accessibilityLabel="Add rule"
          feedback="tap"
          disabled={!check || !!check.weakens}
          onPress={() => {
            if (!tag || !level) return;
            onAdd(tag, level);
            reset();
          }}
          style={[styles.formButton, { backgroundColor: c.primary, opacity: !check || check.weakens ? 0.4 : 1 }]}>
          <T variant="bodyStrong" color={c.onPrimary}>
            Add rule
          </T>
        </Tap>
      </View>
    </Animated.View>
  );
}

function RuleRow({ rule, onToggle, onRemove }: { rule: Rule; onToggle: (on: boolean) => void; onRemove?: () => void }) {
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
      {onRemove ? (
        <Tap accessibilityRole="button" accessibilityLabel={`Remove your rule about ${name}`} feedback="tap" onPress={onRemove} hitSlop={10} style={[styles.remove, { backgroundColor: c.cardMuted }]}>
          <Icon name="close" size={11} color={c.textSecondary} weight="bold" />
        </Tap>
      ) : null}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xxl },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.chip },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  reveal: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: space.lg },
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
  addRule: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, height: 48, borderRadius: radius.button, borderWidth: 1.5, borderStyle: 'dashed', marginTop: space.md },
  picked: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  formButton: { flex: 1, height: 48, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
});

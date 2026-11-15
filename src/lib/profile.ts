import { useMutation, useQuery } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { api } from '@convex/_generated/api';
import { compileRules } from '@engine/compileRules';
import { tagLabel } from '@engine/tags';
import type { MedicationStatus, Profile, Rule, RuleLevel } from '@engine/types';
import { HAS_BACKEND, useDeviceId } from './backend';

export type MedStatus = MedicationStatus & { ruleCount: number };

/** A rule as the Your rules list shows it. `custom` marks one the person added themselves, which they can remove. */
export type ProfileRule = Rule & { custom?: boolean };

export type ProfileState = {
  /** False until the stored profile has loaded (never shows a placeholder as if it were the user's). */
  ready: boolean;
  profile: Profile;
  /** Compiled and custom rules, strongest first. Medication rules arrive a few seconds after saving (read from FDA labels). */
  rules: ProfileRule[];
  /** Per medication: whether its label is still being read (PLAN 7.1 profile.medications). */
  meds: MedStatus[];
  update: (fn: (p: Profile) => Profile) => void;
  setRuleEnabled: (ruleId: string, enabled: boolean) => void;
  /** Add the person's own rule (rules.addCustom). It replaces any rule already on that tag. */
  addRule: (tag: string, level: RuleLevel) => void;
  /** Remove a rule the person added (rules.removeCustom). A profile rule it replaced comes back. */
  removeRule: (ruleId: string) => void;
  /** True for a moment after a change is saved. */
  saved: boolean;
};

const EMPTY: Profile = { medications: [], conditions: [], allergies: [], diets: [] };

/** A new device starts with a realistic profile so the first scan shows what the app does. Editable in Me. */
export const STARTER_PROFILE: Profile = {
  medications: [{ name: 'Simvastatin' }],
  conditions: [{ name: 'High blood pressure', key: 'hypertension' }],
  allergies: ['tree_nuts'],
  diets: [],
};
const SEEDED_KEY = 'fit.profileSeeded';

const isEmpty = (p: Profile) => p.allergies.length + p.diets.length + p.medications.length + p.conditions.length === 0;

const LEVEL_ORDER = { never: 0, avoid: 1, limit: 2, keep_steady: 3 } as const;

/**
 * The same merge the backend does in `recompileRules`: rules compiled from the profile, minus any tag the person's
 * own rule owns, plus the rules only the backend can make (read from medication labels) and the person's own ones.
 * `kept` are those rules; `off` are the ids switched off. Same engine and same data as the backend, so the list it
 * produces for an edited profile is the list that comes back from the save.
 */
function mergeRules(profile: Profile, kept: ProfileRule[], off: Set<string>): ProfileRule[] {
  const owned = new Set(kept.filter((r) => r.custom || r.from.type === 'user').map((r) => r.tag));
  return [...compileRules(profile).filter((r) => !owned.has(r.tag)), ...kept]
    .map((r) => ({ ...r, enabled: !off.has(r.id) }))
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.tag.localeCompare(b.tag));
}

function useProfileLive(): ProfileState {
  const deviceId = useDeviceId();
  const args = deviceId ? { deviceId } : 'skip';
  const remote = useQuery(api.profile.get, args);
  const remoteRules = useQuery(api.rules.list, args);
  const remoteMeds = useQuery(api.profile.medications, args);
  const save = useMutation(api.profile.save);
  const updateRule = useMutation(api.rules.update);
  const addCustom = useMutation(api.rules.addCustom);
  const removeCustom = useMutation(api.rules.removeCustom);

  const [draft, setDraft] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seeding = useRef(false);

  // First launch on this device: save the starter profile once, so the backend compiles real rules for it.
  useEffect(() => {
    if (!deviceId || remote === undefined || !isEmpty(remote) || seeding.current) return;
    seeding.current = true;
    SecureStore.getItemAsync(SEEDED_KEY)
      .then((done) => {
        if (done) return;
        return save({ deviceId, profile: STARTER_PROFILE }).then(() => SecureStore.setItemAsync(SEEDED_KEY, '1'));
      })
      .catch(() => {});
  }, [deviceId, remote, save]);

  const profile = draft ?? remote ?? EMPTY;
  const stored = useMemo(() => (remoteRules ?? []) as ProfileRule[], [remoteRules]);
  // While an edit is held locally, compile its rules here too. Without this the list only changes when the debounced
  // save comes back about a second after the tap, and the screen resizes under the person's finger out of nowhere.
  const rules = useMemo(() => {
    if (draft === null) return stored;
    const kept = stored.filter((r) => r.custom || r.from.type === 'medication');
    const off = new Set(stored.filter((r) => !r.enabled).map((r) => r.id));
    return mergeRules(draft, kept, off);
  }, [stored, draft]);
  const meds = useMemo(() => remoteMeds ?? [], [remoteMeds]);

  const flashSaved = useCallback(() => {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1400);
  }, []);

  const update = useCallback(
    (fn: (p: Profile) => Profile) => {
      // Never save an edit made on top of a placeholder before the stored profile has loaded.
      if (remote === undefined && draft === null) return;
      const next = fn(profile);
      setDraft(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (!deviceId) return;
        save({ deviceId, profile: next })
          .then(flashSaved)
          .catch(() => {});
      }, 450);
    },
    [profile, deviceId, save, remote, draft, flashSaved],
  );

  const setRuleEnabled = useCallback(
    (ruleId: string, enabled: boolean) => {
      if (!deviceId) return;
      updateRule({ deviceId, ruleId, enabled })
        .then(flashSaved)
        .catch(() => {});
    },
    [deviceId, updateRule, flashSaved],
  );

  const addRule = useCallback(
    (tag: string, level: RuleLevel) => {
      if (!deviceId) return;
      addCustom({ deviceId, tag, level })
        .then(flashSaved)
        .catch(() => {});
    },
    [deviceId, addCustom, flashSaved],
  );

  const removeRule = useCallback(
    (ruleId: string) => {
      if (!deviceId) return;
      removeCustom({ deviceId, ruleId })
        .then(flashSaved)
        .catch(() => {});
    },
    [deviceId, removeCustom, flashSaved],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  return { ready: remote !== undefined, profile, rules, meds, update, setRuleEnabled, addRule, removeRule, saved };
}

// Without a backend the profile lives in memory for the session, shared by every screen. Rules come from the engine
// (allergies, diets, conditions); medication rules need the backend's FDA label reading.
const localRules = (profile: Profile, off: string[], custom: ProfileRule[]) => mergeRules(profile, custom, new Set(off));

let local = { profile: STARTER_PROFILE, off: [] as string[], custom: [] as ProfileRule[], rules: localRules(STARTER_PROFILE, [], []) };
const localListeners = new Set<() => void>();
function setLocal(profile: Profile, off: string[], custom: ProfileRule[] = local.custom) {
  local = { profile, off, custom, rules: localRules(profile, off, custom) };
  localListeners.forEach((l) => l());
}
function subscribeLocal(l: () => void) {
  localListeners.add(l);
  return () => {
    localListeners.delete(l);
  };
}

function customRule(tag: string, level: RuleLevel): ProfileRule {
  return {
    id: `custom:${tag}`,
    level,
    tag,
    reason: `You added a rule about ${tagLabel(tag)}.`,
    source: { title: 'Your own rule', url: 'app://profile' },
    from: { type: 'user', label: 'your own rule' },
    status: 'library',
    enabled: true,
    custom: true,
  };
}

function useProfileLocal(): ProfileState {
  const state = useSyncExternalStore(subscribeLocal, () => local, () => local);
  return {
    ready: true,
    profile: state.profile,
    rules: state.rules,
    meds: [],
    update: (fn) => setLocal(fn(local.profile), local.off),
    setRuleEnabled: (id, enabled) => setLocal(local.profile, enabled ? local.off.filter((x) => x !== id) : [...local.off, id]),
    addRule: (tag, level) => setLocal(local.profile, local.off, [...local.custom.filter((r) => r.tag !== tag), customRule(tag, level)]),
    removeRule: (id) => setLocal(local.profile, local.off, local.custom.filter((r) => r.id !== id)),
    saved: false,
  };
}

export const useProfile: () => ProfileState = HAS_BACKEND ? useProfileLive : useProfileLocal;

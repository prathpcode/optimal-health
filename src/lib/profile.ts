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
  const rules = useMemo(() => (remoteRules ?? []) as ProfileRule[], [remoteRules]);
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
const LEVEL_ORDER = { never: 0, avoid: 1, limit: 2, keep_steady: 3 } as const;

/** The same merge the backend does: a rule the person wrote wins over a profile rule on the same tag. */
function localRules(profile: Profile, off: string[], custom: ProfileRule[]): ProfileRule[] {
  const mine = new Set(custom.map((r) => r.tag));
  const compiled: ProfileRule[] = compileRules(profile).filter((r) => !mine.has(r.tag));
  return [...compiled, ...custom]
    .map((r) => ({ ...r, enabled: !off.includes(r.id) }))
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.tag.localeCompare(b.tag));
}

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

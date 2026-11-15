import { StyleSheet, View } from 'react-native';

import type { Finding, Rule } from '@engine/types';
import { radius, space, useTheme, type Colors } from '@/theme';
import { Icon, type IconName } from './Icon';
import { T } from './T';

const OUTCOME: Record<Finding['outcome'], { icon: IconName; color: (c: Colors) => string }> = {
  blocked: { icon: 'block', color: (c) => c.notFit },
  ask: { icon: 'question', color: (c) => c.cantTell },
  confirm: { icon: 'server', color: (c) => c.okay },
  note: { icon: 'note', color: (c) => c.textSecondary },
};

const RANK: Record<Finding['outcome'], number> = { blocked: 0, ask: 1, confirm: 2, note: 3 };

/**
 * The reasons behind a verdict. Each shows where it comes from (PLAN 7.1): the person's rule (with its status), the
 * product's own label (`source` + `about`), or the assistant's own unsourced note, labelled as such.
 */
export function FindingList({ findings, rules, muted = true }: { findings: Finding[]; rules: Rule[]; muted?: boolean }) {
  const { c } = useTheme();
  const sorted = [...findings].sort((a, b) => RANK[a.outcome] - RANK[b.outcome]);
  return (
    <View style={[styles.group, { backgroundColor: muted ? c.cardMuted : c.card }]}>
      {sorted.map((f, i) => {
        const o = OUTCOME[f.outcome];
        const rule = f.ruleId ? rules.find((r) => r.id === f.ruleId) : undefined;
        return (
          <View key={`${f.ruleId ?? f.about ?? 'note'}-${i}`} style={[styles.finding, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline } : null]}>
            <Icon name={o.icon} size={17} color={o.color(c)} />
            <View style={{ flex: 1, gap: 4 }}>
              <T variant="body">{f.because}</T>
              {f.unsourced ? (
                <T variant="caption" tone="tertiary">
                  Noted by the assistant, no cited source
                </T>
              ) : f.source ? (
                <View style={{ gap: 4 }}>
                  {f.about ? (
                    <T variant="caption" tone="secondary">
                      {f.about}
                    </T>
                  ) : null}
                  <View style={[styles.quote, { borderLeftColor: c.hairline }]}>
                    <T variant="caption" tone="tertiary">
                      {f.source.title}: “{f.source.quote}”
                    </T>
                  </View>
                </View>
              ) : rule ? (
                <View style={styles.meta}>
                  <T variant="caption" tone="secondary">
                    {rule.from.label}
                  </T>
                  {rule.status !== 'library' ? (
                    <View style={[styles.badge, { backgroundColor: rule.status === 'unverified' ? c.okaySoft : c.cantTellSoft }]}>
                      <T variant="micro" color={rule.status === 'unverified' ? c.okay : c.textSecondary}>
                        {rule.status === 'unverified' ? 'Unverified' : rule.status === 'from_label' ? 'FDA label' : 'Sourced'}
                      </T>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radius.md, overflow: 'hidden' },
  finding: { flexDirection: 'row', gap: space.md, padding: space.lg, alignItems: 'flex-start' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  badge: { borderRadius: radius.chip, paddingHorizontal: 7, paddingVertical: 3 },
  quote: { borderLeftWidth: 2, paddingLeft: space.sm },
});

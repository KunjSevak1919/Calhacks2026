import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import {
  api,
  VfcAuthorizeResponse,
  VfcRule,
} from "../../api";
import { colors, spacing, radius, font } from "../../theme";

// ── Scenario definitions ───────────────────────────────────────────────────

const SCENARIOS = [
  { label: "Whole Foods", amount: 84.5, mcc: 5411, amountLabel: "$84.50" },
  { label: "Shell", amount: 40, mcc: 5541, amountLabel: "$40" },
  { label: "Best Buy", amount: 450, mcc: 5732, amountLabel: "$450" },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

function usd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return "$" + n.toFixed(2);
}

function fundingColor(funding: VfcAuthorizeResponse["funding"] | null): string {
  if (funding === "credit") return colors.mint;
  if (funding === "debit") return colors.blue;
  if (funding === "installments") return colors.amber;
  return colors.muted;
}

function fundingLabel(result: VfcAuthorizeResponse): string {
  if (result.funding === "credit") return `Credit · ${result.card_name ?? "card"}`;
  if (result.funding === "debit") return "Debit · Checking";
  return "Pay in 4";
}

function formatDate(iso: string): string {
  // "2026-10-23" → "Oct 23"
  const [, m, d] = iso.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

// ── Simulation screen ──────────────────────────────────────────────────────

export default function SimulationScreen() {
  const [debtGuard, setDebtGuard] = useState(false);
  const [result, setResult] = useState<VfcAuthorizeResponse | null>(null);
  const [rules, setRules] = useState<VfcRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeScenario, setActiveScenario] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track previous funding type to know when chip needs to animate
  const prevFunding = useRef<string | null>(null);

  // Animated chip: scale + translateY bounce when funding changes
  const chipScale = useRef(new Animated.Value(1)).current;
  const chipY = useRef(new Animated.Value(0)).current;

  const animateChip = useCallback(() => {
    chipScale.setValue(0.82);
    chipY.setValue(6);
    Animated.parallel([
      Animated.spring(chipScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 90,
        friction: 7,
      }),
      Animated.spring(chipY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 90,
        friction: 7,
      }),
    ]).start();
  }, [chipScale, chipY]);

  // ── Load on focus ────────────────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        try {
          const [settingsRes, rulesRes] = await Promise.all([
            api.settings(),
            api.vfcRules(),
          ]);
          if (!cancelled) {
            setDebtGuard(settingsRes.debt_guard);
            setRules(rulesRes.rules);
          }
        } catch {
          // silently ignore — rules stay empty, switch stays off
        }
      }

      load();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  // ── Debt Guard toggle ────────────────────────────────────────────────────

  const handleDebtGuard = async (val: boolean) => {
    setDebtGuard(val);
    try {
      await api.setSettings(val);
    } catch {
      setDebtGuard(!val); // revert on failure
    }
  };

  // ── Authorize ────────────────────────────────────────────────────────────

  const handleScenario = async (idx: number) => {
    if (loading) return;
    const s = SCENARIOS[idx];
    setActiveScenario(idx);
    setLoading(true);
    setError(null);
    try {
      const res = await api.vfcAuthorize(s.label, s.mcc, s.amount);
      // Animate chip whenever the funding type changes
      if (prevFunding.current !== res.funding) {
        animateChip();
        prevFunding.current = res.funding;
      }
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const chipAccent = result ? fundingColor(result.funding) : colors.muted;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Simulation</Text>
            <Text style={styles.subtitle}>
              Virtual Funding Controller — how Pocket Pilot routes each purchase.
            </Text>
          </View>
        </View>

        {/* Pocket Pilot Visa card */}
        <View style={styles.visaCard}>
          <View style={styles.visaTop}>
            <View style={styles.visaChipIcon}>
              <Ionicons name="hardware-chip-outline" size={22} color="#C8A84B" />
            </View>
            <Text style={styles.visaSimBadge}>SIMULATION</Text>
          </View>
          <Text style={styles.visaNumber}>•••• •••• •••• 0042</Text>
          <View style={styles.visaBottom}>
            <View>
              <Text style={styles.visaLabel}>CARD HOLDER</Text>
              <Text style={styles.visaName}>Pocket Pilot</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.visaCardDesc}>
                Pocket Pilot · Visa Flexible Credential (simulated)
              </Text>
            </View>
          </View>

          {/* Funding chip — animates on change */}
          <Animated.View
            style={[
              styles.fundingChip,
              {
                borderColor: chipAccent + "88",
                backgroundColor: chipAccent + "18",
                transform: [
                  { scale: chipScale },
                  { translateY: chipY },
                ],
              },
            ]}
          >
            <View style={[styles.fundingDot, { backgroundColor: chipAccent }]} />
            <Text style={[styles.fundingText, { color: chipAccent }]}>
              {result ? fundingLabel(result) : "Tap a scenario below"}
            </Text>
          </Animated.View>
        </View>

        {/* Debt Guard switch */}
        <View style={styles.debtRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.debtLabel}>Debt Guard</Text>
            <Text style={styles.debtSub}>
              {debtGuard
                ? "On · credit blocked while carrying a balance"
                : "Off · credit allowed (pay-in-full assumed)"}
            </Text>
          </View>
          <Switch
            value={debtGuard}
            onValueChange={handleDebtGuard}
            thumbColor={debtGuard ? colors.mint : colors.muted}
            trackColor={{ true: colors.mint + "55", false: colors.border }}
          />
        </View>

        {/* Scenario buttons */}
        <Text style={styles.sectionLabel}>Run a scenario</Text>
        <View style={styles.scenarioRow}>
          {SCENARIOS.map((s, idx) => {
            const active = activeScenario === idx;
            return (
              <TouchableOpacity
                key={s.label}
                style={[
                  styles.scenarioBtn,
                  active && styles.scenarioBtnActive,
                ]}
                onPress={() => handleScenario(idx)}
                disabled={loading}
              >
                {loading && active ? (
                  <ActivityIndicator size="small" color={colors.mint} />
                ) : (
                  <>
                    <Text
                      style={[
                        styles.scenarioBtnLabel,
                        active && styles.scenarioBtnLabelActive,
                      ]}
                    >
                      {s.label}
                    </Text>
                    <Text
                      style={[
                        styles.scenarioBtnAmount,
                        active && styles.scenarioBtnAmountActive,
                      ]}
                    >
                      {s.amountLabel}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="warning-outline" size={14} color={colors.amber} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Result */}
        {result && !loading && (
          <View style={styles.resultCard}>
            {/* Reason */}
            <Text style={styles.reasonText}>{result.reason}</Text>

            {/* MCC preserved badge */}
            {result.mcc_preserved && (
              <View style={styles.mccRow}>
                <Ionicons name="checkmark-circle" size={14} color={colors.mint} />
                <Text style={styles.mccText}>
                  MCC {result.mcc} kept, category bonus kept
                </Text>
              </View>
            )}

            {/* Installment schedule */}
            {result.funding === "installments" && result.installments && (
              <View style={styles.scheduleBlock}>
                <Text style={styles.scheduleTitle}>Payment schedule</Text>
                {result.installments.schedule.map((item, i) => (
                  <View key={i} style={styles.scheduleRow}>
                    <Text style={styles.scheduleNum}>{i + 1}</Text>
                    <Text style={styles.scheduleDate}>{formatDate(item.date)}</Text>
                    <Text style={styles.scheduleAmount}>{usd(item.amount)}</Text>
                  </View>
                ))}
                <View style={styles.scheduleDivider} />
                <View style={styles.scheduleRow}>
                  <Text style={[styles.scheduleNum, { color: "transparent" }]}>—</Text>
                  <Text style={[styles.scheduleDate, { color: colors.muted }]}>Total</Text>
                  <Text style={[styles.scheduleAmount, { color: colors.text, fontWeight: "700" }]}>
                    {usd(result.installments.each * result.installments.count)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Rules */}
        <Text style={styles.sectionLabel}>Decision rules</Text>
        {rules.length === 0 ? (
          <ActivityIndicator color={colors.mint} style={{ marginTop: spacing.md }} />
        ) : (
          rules.map((rule) => {
            const matched = result?.rule_id === rule.id;
            return (
              <View
                key={rule.id}
                style={[
                  styles.ruleCard,
                  matched && styles.ruleCardMatched,
                ]}
              >
                {matched && (
                  <View style={styles.ruleMatchBadge}>
                    <Ionicons name="flash" size={11} color={colors.bg} />
                    <Text style={styles.ruleMatchText}>Applied</Text>
                  </View>
                )}
                <View style={styles.ruleRow}>
                  <Text style={styles.ruleRowLabel}>When</Text>
                  <Text style={styles.ruleRowValue}>{rule.when}</Text>
                </View>
                <View style={[styles.ruleRow, { marginTop: spacing.sm }]}>
                  <Text style={styles.ruleRowLabel}>Then</Text>
                  <Text style={[styles.ruleRowValue, { color: matched ? colors.mint : colors.text }]}>
                    {rule.then}
                  </Text>
                </View>
                <View style={[styles.ruleRow, { marginTop: spacing.sm }]}>
                  <Text style={styles.ruleRowLabel}>Why</Text>
                  <Text style={[styles.ruleRowValue, { color: colors.muted }]}>{rule.why}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl * 2 },

  headerRow: {
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: font.xxl,
    fontWeight: "800",
    marginBottom: spacing.xs,
  },
  subtitle: { color: colors.muted, fontSize: font.sm, lineHeight: 20 },

  // ── Visa card ──────────────────────────────────────────────────────────
  visaCard: {
    backgroundColor: "#1A1F2E",
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: "#2A3148",
    // shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  visaTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  visaChipIcon: {
    width: 38,
    height: 30,
    borderRadius: 6,
    backgroundColor: "#C8A84B22",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#C8A84B44",
  },
  visaSimBadge: {
    color: colors.muted,
    fontSize: font.xs,
    fontWeight: "700",
    letterSpacing: 2,
  },
  visaNumber: {
    color: "#D0D8E8",
    fontSize: font.lg,
    fontWeight: "600",
    letterSpacing: 3,
    marginBottom: spacing.lg,
  },
  visaBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: spacing.md,
  },
  visaLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  visaName: {
    color: colors.text,
    fontSize: font.md,
    fontWeight: "700",
  },
  visaCardDesc: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "500",
    textAlign: "right",
    maxWidth: 160,
    lineHeight: 13,
  },
  fundingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  fundingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  fundingText: {
    fontSize: font.sm,
    fontWeight: "700",
  },

  // ── Debt Guard ─────────────────────────────────────────────────────────
  debtRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  debtLabel: { color: colors.text, fontSize: font.md, fontWeight: "700" },
  debtSub: { color: colors.muted, fontSize: font.xs, marginTop: 2, lineHeight: 16 },

  // ── Scenarios ──────────────────────────────────────────────────────────
  sectionLabel: {
    color: colors.muted,
    fontSize: font.xs,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  scenarioRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  scenarioBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 60,
    gap: 2,
  },
  scenarioBtnActive: {
    borderColor: colors.mint + "88",
    backgroundColor: colors.mint + "10",
  },
  scenarioBtnLabel: {
    color: colors.text,
    fontSize: font.sm,
    fontWeight: "700",
  },
  scenarioBtnLabelActive: { color: colors.mint },
  scenarioBtnAmount: {
    color: colors.muted,
    fontSize: font.xs,
  },
  scenarioBtnAmountActive: { color: colors.mint + "BB" },

  // ── Error ──────────────────────────────────────────────────────────────
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.amber + "15",
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.amber + "44",
  },
  errorText: { color: colors.amber, fontSize: font.sm, flex: 1 },

  // ── Result card ────────────────────────────────────────────────────────
  resultCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  reasonText: {
    color: colors.text,
    fontSize: font.sm,
    lineHeight: 20,
  },
  mccRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  mccText: {
    color: colors.mint,
    fontSize: font.xs,
    fontWeight: "600",
  },

  // Installment schedule
  scheduleBlock: {
    marginTop: spacing.xs,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  scheduleTitle: {
    color: colors.muted,
    fontSize: font.xs,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  scheduleNum: {
    color: colors.muted,
    fontSize: font.xs,
    width: 16,
    textAlign: "right",
  },
  scheduleDate: {
    color: colors.text,
    fontSize: font.sm,
    flex: 1,
  },
  scheduleAmount: {
    color: colors.amber,
    fontSize: font.sm,
    fontWeight: "600",
  },
  scheduleDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },

  // ── Rule cards ─────────────────────────────────────────────────────────
  ruleCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ruleCardMatched: {
    borderColor: colors.mint + "66",
    backgroundColor: colors.mint + "08",
  },
  ruleMatchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.mint,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginBottom: spacing.sm,
  },
  ruleMatchText: {
    color: colors.bg,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  ruleRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  ruleRowLabel: {
    color: colors.muted,
    fontSize: font.xs,
    fontWeight: "700",
    width: 38,
    paddingTop: 2,
  },
  ruleRowValue: {
    color: colors.text,
    fontSize: font.sm,
    lineHeight: 20,
    flex: 1,
  },
});

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import Animated, {
  FadeInDown,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  api,
  VfcAuthorizeResponse,
  VfcRule,
} from "../../api";
import Skeleton from "../../components/Skeleton";
import PressScale from "../../components/PressScale";
import { usd } from "../../format";
import { lightTap } from "../../haptics";
import { colors, spacing, radius, font, type, shadow, hit } from "../../theme";

// ── Scenario definitions ──────────────────────────────────────────────────

const SCENARIOS = [
  { label: "Whole Foods", amount: 84.5,  mcc: 5411, amountLabel: "$84.50" },
  { label: "Shell",       amount: 40,    mcc: 5541, amountLabel: "$40" },
  { label: "Best Buy",    amount: 450,   mcc: 5732, amountLabel: "$450" },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────

function fundingAccent(funding: VfcAuthorizeResponse["funding"] | null): string {
  if (funding === "credit") return colors.good;
  if (funding === "debit") return colors.coach;
  if (funding === "installments") return colors.warn;
  return colors.muted;
}

function fundingFill(funding: VfcAuthorizeResponse["funding"] | null): string {
  if (funding === "credit") return colors.goodFill;
  if (funding === "debit") return colors.coachFill;
  if (funding === "installments") return colors.warnFill;
  return colors.surfaceSubtle;
}

function fundingLabel(result: VfcAuthorizeResponse): string {
  if (result.funding === "credit") return `Credit · ${result.card_name ?? "card"}`;
  if (result.funding === "debit") return "Debit · Checking";
  return "Pay in 4";
}

function formatDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

// ── Funding chip (Reanimated spring on change) ────────────────────────────

function FundingChip({ result }: { result: VfcAuthorizeResponse | null }) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const prevFunding = useRef<string | null>(null);

  useEffect(() => {
    if (!result) return;
    if (prevFunding.current !== result.funding && !reduce) {
      scale.value = withSequence(
        withTiming(0.84, { duration: 80 }),
        withSpring(1, { damping: 14, stiffness: 280, mass: 0.5 })
      );
      translateY.value = withSequence(
        withTiming(8, { duration: 80 }),
        withSpring(0, { damping: 14, stiffness: 280, mass: 0.5 })
      );
    }
    prevFunding.current = result.funding;
  }, [result?.funding]); // eslint-disable-line react-hooks/exhaustive-deps

  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  const accent = fundingAccent(result?.funding ?? null);
  const fill = fundingFill(result?.funding ?? null);

  return (
    <Animated.View
      style={[
        styles.fundingChip,
        { backgroundColor: fill, borderColor: accent + "55" },
        anim,
      ]}
    >
      <View style={[styles.fundingDot, { backgroundColor: accent }]} />
      <Text style={[styles.fundingText, { color: accent }]}>
        {result ? fundingLabel(result) : "Tap a scenario below"}
      </Text>
    </Animated.View>
  );
}

// ── Rule card (highlights with interpolated color when matched) ───────────

function RuleCard({ rule, matched }: { rule: VfcRule; matched: boolean }) {
  const reduce = useReducedMotion();
  const progress = useSharedValue(matched ? 1 : 0);

  useEffect(() => {
    if (reduce) {
      progress.value = matched ? 1 : 0;
      return;
    }
    if (matched) {
      progress.value = withSequence(
        withTiming(1, { duration: 180 }),
        withTiming(0.7, { duration: 320 }),
        withTiming(1, { duration: 180 })
      );
    } else {
      progress.value = withTiming(0, { duration: 220 });
    }
  }, [matched]); // eslint-disable-line react-hooks/exhaustive-deps

  const anim = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], [colors.border, colors.good + "88"]),
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.surface, colors.goodFill]),
  }));

  return (
    <Animated.View style={[styles.ruleCard, anim]}>
      {matched && (
        <View style={styles.ruleMatchBadge}>
          <Ionicons name="flash" size={11} color={colors.onPrimary} />
          <Text style={styles.ruleMatchText}>Applied</Text>
        </View>
      )}
      <View style={styles.ruleRow}>
        <Text style={styles.ruleRowLabel}>When</Text>
        <Text style={styles.ruleRowValue}>{rule.when}</Text>
      </View>
      <View style={[styles.ruleRow, { marginTop: spacing.sm }]}>
        <Text style={styles.ruleRowLabel}>Then</Text>
        <Text style={[styles.ruleRowValue, matched && { color: colors.good }]}>
          {rule.then}
        </Text>
      </View>
      <View style={[styles.ruleRow, { marginTop: spacing.sm }]}>
        <Text style={styles.ruleRowLabel}>Why</Text>
        <Text style={[styles.ruleRowValue, { color: colors.muted }]}>{rule.why}</Text>
      </View>
    </Animated.View>
  );
}

// ── Installment schedule (rows enter staggered) ───────────────────────────

function InstallmentSchedule({ result }: { result: VfcAuthorizeResponse }) {
  const reduce = useReducedMotion();
  if (!result.installments) return null;

  return (
    <View style={styles.scheduleBlock}>
      <Text style={styles.scheduleTitle}>Payment schedule</Text>
      {result.installments.schedule.map((item, i) => (
        <Animated.View
          key={i}
          entering={reduce ? undefined : FadeInDown.delay(i * 70).duration(220)}
          style={styles.scheduleRow}
        >
          <Text style={styles.scheduleNum}>{i + 1}</Text>
          <Text style={styles.scheduleDate}>{formatDate(item.date)}</Text>
          <Text style={styles.scheduleAmount}>{usd(item.amount)}</Text>
        </Animated.View>
      ))}
      <View style={styles.scheduleDivider} />
      <View style={styles.scheduleRow}>
        <Text style={[styles.scheduleNum, { color: "transparent" }]}>—</Text>
        <Text style={[styles.scheduleDate, { color: colors.muted }]}>Total</Text>
        <Text style={[styles.scheduleAmount, { color: colors.text, fontFamily: type.monoBold }]}>
          {usd(result.installments.each * result.installments.count)}
        </Text>
      </View>
    </View>
  );
}

// ── Simulation screen ─────────────────────────────────────────────────────

export default function SimulationScreen() {
  const reduce = useReducedMotion();
  const [debtGuard, setDebtGuard] = useState(false);
  const [result, setResult] = useState<VfcAuthorizeResponse | null>(null);
  const [rules, setRules] = useState<VfcRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeScenario, setActiveScenario] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Load on focus ─────────────────────────────────────────────────────

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
          //
        }
      }
      load();
      return () => { cancelled = true; };
    }, [])
  );

  // ── Debt Guard toggle ─────────────────────────────────────────────────

  const handleDebtGuard = async (val: boolean) => {
    lightTap();
    setDebtGuard(val);
    try {
      await api.setSettings(val);
    } catch {
      setDebtGuard(!val);
    }
  };

  // ── Authorize ─────────────────────────────────────────────────────────

  const handleScenario = async (idx: number) => {
    if (loading) return;
    lightTap();
    const s = SCENARIOS[idx];
    setActiveScenario(idx);
    setLoading(true);
    setError(null);
    try {
      const res = await api.vfcAuthorize(s.label, s.mcc, s.amount);
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Header */}
        <Text style={styles.title}>Simulation</Text>
        <Text style={styles.subtitle}>
          Virtual Funding Controller — how Pocket Pilot routes each purchase.
        </Text>

        {/* Pocket Pilot card */}
        <View style={styles.visaCard}>
          <View style={styles.visaTop}>
            <View style={styles.visaChip}>
              <Ionicons name="hardware-chip-outline" size={20} color={colors.onPrimary} style={{ opacity: 0.6 }} />
            </View>
            <Text style={styles.visaSimBadge}>SIMULATION</Text>
          </View>
          <Text style={styles.visaNumber}>•••• •••• •••• 0042</Text>
          <View style={styles.visaBottom}>
            <View>
              <Text style={styles.visaFieldLabel}>CARD HOLDER</Text>
              <Text style={styles.visaName}>Pocket Pilot</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.visaDesc}>
                Pocket Pilot · Visa Flexible Credential (simulated)
              </Text>
            </View>
          </View>
          <FundingChip result={result} />
        </View>

        {/* Debt Guard */}
        <View style={styles.guardRow}>
          <View style={[styles.guardIconWrap, debtGuard ? styles.guardIconOn : styles.guardIconOff]}>
            <Ionicons
              name={debtGuard ? "shield-checkmark" : "shield-outline"}
              size={17}
              color={debtGuard ? colors.good : colors.muted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.guardTitle}>Debt Guard</Text>
            <Text style={styles.guardStatus} numberOfLines={1}>
              {debtGuard
                ? "On · credit blocked while carrying a balance"
                : "Off · credit allowed (pay-in-full assumed)"}
            </Text>
          </View>
          <View style={styles.switchHit}>
            <Switch
              value={debtGuard}
              onValueChange={handleDebtGuard}
              trackColor={{ false: colors.border, true: colors.good }}
              thumbColor={colors.surface}
              ios_backgroundColor={colors.border}
              accessibilityLabel="Debt Guard"
            />
          </View>
        </View>

        {/* Scenarios */}
        <Text style={styles.sectionLabel}>Run a scenario</Text>
        <View style={styles.scenarioRow}>
          {SCENARIOS.map((s, idx) => {
            const active = activeScenario === idx;
            const isLoading = loading && active;
            return (
              <PressScale
                key={s.label}
                onPress={() => handleScenario(idx)}
                disabled={loading}
                accessibilityLabel={`${s.label} ${s.amountLabel}`}
                style={[styles.scenarioBtn, active && styles.scenarioBtnActive]}
              >
                {isLoading ? (
                  <Skeleton height={14} width={40} r={6} />
                ) : (
                  <>
                    <Text style={[styles.scenarioBtnLabel, active && styles.scenarioBtnLabelActive]}>
                      {s.label}
                    </Text>
                    <Text style={[styles.scenarioBtnAmount, active && styles.scenarioBtnAmountActive]}>
                      {s.amountLabel}
                    </Text>
                  </>
                )}
              </PressScale>
            );
          })}
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="warning" size={14} color={colors.warn} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Result */}
        {result && !loading && (
          <Animated.View
            entering={reduce ? undefined : FadeInDown.duration(260).springify()}
            style={styles.resultCard}
          >
            <Text style={styles.reasonText}>{result.reason}</Text>

            {result.mcc_preserved && (
              <View style={styles.mccRow}>
                <Ionicons name="checkmark-circle" size={14} color={colors.good} />
                <Text style={styles.mccText}>
                  MCC {result.mcc} kept, category bonus kept
                </Text>
              </View>
            )}

            {result.funding === "installments" && result.installments && (
              <InstallmentSchedule result={result} />
            )}
          </Animated.View>
        )}

        {/* Rules */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>Decision rules</Text>
        {rules.length === 0 ? (
          <View style={{ gap: spacing.md }}>
            {[110, 100, 110, 100].map((h, i) => (
              <Skeleton key={i} height={h} r={radius.xl} />
            ))}
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {rules.map((rule, i) => {
              const matched = result?.rule_id === rule.id;
              return (
                <Animated.View
                  key={rule.id}
                  entering={reduce ? undefined : FadeInDown.delay(i * 60).duration(260)}
                >
                  <RuleCard rule={rule} matched={matched} />
                </Animated.View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl * 2,
  },

  title: {
    color: colors.text,
    fontSize: font.screen,
    fontFamily: type.uiBold,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.ui,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },

  // ── Card ──────────────────────────────────────────────────────────────
  visaCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.stack,
  },
  visaTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  visaChip: {
    width: 36,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  visaSimBadge: {
    color: colors.onPrimary,
    opacity: 0.45,
    fontSize: font.label,
    fontFamily: type.uiBold,
    letterSpacing: 2,
  },
  visaNumber: {
    color: colors.onPrimary,
    fontSize: font.title,
    fontFamily: type.mono,
    letterSpacing: 3,
    marginBottom: spacing.lg,
    opacity: 0.9,
  },
  visaBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: spacing.md,
  },
  visaFieldLabel: {
    color: colors.onPrimary,
    opacity: 0.45,
    fontSize: 9,
    fontFamily: type.uiMedium,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  visaName: {
    color: colors.onPrimary,
    fontSize: font.body,
    fontFamily: type.uiBold,
  },
  visaDesc: {
    color: colors.onPrimary,
    opacity: 0.45,
    fontSize: 9,
    fontFamily: type.ui,
    textAlign: "right",
    maxWidth: 160,
    lineHeight: 13,
  },

  // Funding chip (on card face)
  fundingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  fundingDot: { width: 7, height: 7, borderRadius: 3.5 },
  fundingText: { fontSize: font.label, fontFamily: type.uiSemi },

  // ── Debt Guard ────────────────────────────────────────────────────────
  guardRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    gap: spacing.md,
    ...shadow.soft,
  },
  guardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  guardIconOn: { backgroundColor: colors.goodFill },
  guardIconOff: { backgroundColor: colors.surfaceSubtle },
  guardTitle: { color: colors.text, fontSize: font.body, fontFamily: type.uiSemi },
  guardStatus: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.ui,
    marginTop: 2,
  },
  switchHit: {
    minWidth: hit.min,
    minHeight: hit.min,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Scenarios ─────────────────────────────────────────────────────────
  sectionLabel: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.uiMedium,
    letterSpacing: 0.8,
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
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 64,
    gap: 2,
    ...shadow.soft,
  },
  scenarioBtnActive: {
    borderColor: colors.good + "66",
    backgroundColor: colors.goodFill,
  },
  scenarioBtnLabel: {
    color: colors.text,
    fontSize: font.label,
    fontFamily: type.uiSemi,
  },
  scenarioBtnLabelActive: { color: colors.good },
  scenarioBtnAmount: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.mono,
  },
  scenarioBtnAmountActive: {
    color: colors.good,
    fontFamily: type.monoSemi,
  },

  // ── Error ─────────────────────────────────────────────────────────────
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.warnFill,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.warn + "44",
  },
  errorText: { color: colors.warn, fontSize: font.body, fontFamily: type.ui, flex: 1 },

  // ── Result card ───────────────────────────────────────────────────────
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
    ...shadow.soft,
  },
  reasonText: {
    color: colors.text,
    fontSize: font.body,
    fontFamily: type.ui,
    lineHeight: 22,
  },
  mccRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  mccText: {
    color: colors.good,
    fontSize: font.label,
    fontFamily: type.uiSemi,
  },

  // Schedule
  scheduleBlock: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  scheduleTitle: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.uiMedium,
    letterSpacing: 0.8,
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
    fontSize: font.label,
    fontFamily: type.mono,
    width: 16,
    textAlign: "right",
  },
  scheduleDate: {
    color: colors.text,
    fontSize: font.body,
    fontFamily: type.ui,
    flex: 1,
  },
  scheduleAmount: {
    color: colors.warn,
    fontSize: font.body,
    fontFamily: type.monoSemi,
  },
  scheduleDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },

  // ── Rule cards ────────────────────────────────────────────────────────
  ruleCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    // backgroundColor and borderColor are animated via useAnimatedStyle
  },
  ruleMatchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.good,
    borderRadius: 99,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginBottom: spacing.md,
  },
  ruleMatchText: {
    color: colors.onPrimary,
    fontSize: font.label,
    fontFamily: type.uiBold,
    letterSpacing: 0.4,
  },
  ruleRow: { flexDirection: "row", gap: spacing.sm },
  ruleRowLabel: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.uiMedium,
    width: 36,
    paddingTop: 2,
  },
  ruleRowValue: {
    color: colors.text,
    fontSize: font.body,
    fontFamily: type.ui,
    lineHeight: 22,
    flex: 1,
  },
});

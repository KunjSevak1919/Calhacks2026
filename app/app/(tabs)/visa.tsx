import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
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
  type VfcAuthorizeResponse,
  type VfcRule,
} from "../../api";
import { useTheme } from "../../ThemeContext";
import { font, type, spacing, radius, shadow } from "../../theme";
import DebtGuardSwitch from "../../components/DebtGuardSwitch";
import Skeleton from "../../components/Skeleton";
import { useLayout } from "../../hooks/useLayout";
import { supabase } from "../../lib/supabase";

// ── Scenario definitions ──────────────────────────────────────────────────────

const SCENARIOS = [
  { label: "Whole Foods", amount: 84.5, mcc: 5411, amountLabel: "$84.50" },
  { label: "Shell", amount: 40, mcc: 5541, amountLabel: "$40" },
  { label: "Best Buy", amount: 450, mcc: 5732, amountLabel: "$450" },
] as const;

// ── VFC card with animated funding chip ───────────────────────────────────────

function FundingBadge({ result }: { result: VfcAuthorizeResponse | null }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const prevFunding = useRef<string | null>(null);

  useEffect(() => {
    if (!result) return;
    if (prevFunding.current !== result.funding && !reduceMotion) {
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

  const accent =
    result?.funding === "credit"
      ? colors.good
      : result?.funding === "debit"
      ? colors.coach
      : result?.funding === "installments"
      ? colors.warn
      : "rgba(255,255,255,0.5)";

  const fill =
    result?.funding === "credit"
      ? colors.goodFill + "CC"
      : result?.funding === "debit"
      ? colors.coachFill + "CC"
      : result?.funding === "installments"
      ? colors.warnFill + "CC"
      : "rgba(255,255,255,0.08)";

  const label = result
    ? result.funding === "credit"
      ? `Credit · ${result.card_name ?? "card"}`
      : result.funding === "debit"
      ? "Debit · Checking"
      : "Pay in 4"
    : "Tap a scenario below";

  return (
    <Animated.View
      style={[
        styles.fundingBadge,
        { backgroundColor: fill, borderColor: accent + "55" },
        anim,
      ]}
    >
      <View style={[styles.fundingDot, { backgroundColor: accent }]} />
      <Text style={[styles.fundingText, { color: result ? accent : "rgba(255,255,255,0.5)" }]}>
        {label}
      </Text>
    </Animated.View>
  );
}

// ── Decision rule card ────────────────────────────────────────────────────────

function RuleCard({ rule, matched }: { rule: VfcRule; matched: boolean }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(matched ? 1 : 0);

  // Capture colors as local variables for worklet
  const borderIdle = colors.border;
  const borderActive = colors.good + "88";
  const bgIdle = colors.surface;
  const bgActive = colors.goodFill;

  useEffect(() => {
    if (reduceMotion) {
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
    borderColor: interpolateColor(progress.value, [0, 1], [borderIdle, borderActive]),
    backgroundColor: interpolateColor(progress.value, [0, 1], [bgIdle, bgActive]),
  }));

  return (
    <Animated.View style={[styles.ruleCard, anim]}>
      {matched && (
        <View style={[styles.ruleMatchBadge, { backgroundColor: colors.good }]}>
          <Ionicons name="flash" size={11} color="#fff" />
          <Text style={styles.ruleMatchText}>Applied</Text>
        </View>
      )}
      <View style={styles.ruleRow}>
        <Text style={[styles.ruleRowLabel, { color: colors.muted }]}>When</Text>
        <Text style={[styles.ruleRowValue, { color: colors.text }]}>{rule.when}</Text>
      </View>
      <View style={[styles.ruleRow, { marginTop: spacing.sm }]}>
        <Text style={[styles.ruleRowLabel, { color: colors.muted }]}>Then</Text>
        <Text style={[styles.ruleRowValue, { color: matched ? colors.good : colors.text }]}>
          {rule.then}
        </Text>
      </View>
      <View style={[styles.ruleRow, { marginTop: spacing.sm }]}>
        <Text style={[styles.ruleRowLabel, { color: colors.muted }]}>Why</Text>
        <Text style={[styles.ruleRowValue, { color: colors.muted }]}>{rule.why}</Text>
      </View>
    </Animated.View>
  );
}

// ── Installment schedule ──────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

function InstallmentSchedule({ result }: { result: VfcAuthorizeResponse }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  if (!result.installments) return null;

  return (
    <View style={[styles.scheduleBlock, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
      <Text style={[styles.scheduleTitle, { color: colors.text }]}>Payment schedule</Text>
      {result.installments.schedule.map((item, i) => (
        <Animated.View
          key={i}
          entering={reduceMotion ? undefined : FadeInDown.delay(i * 70).duration(220)}
          style={[styles.scheduleRow, { borderTopColor: colors.border }]}
        >
          <Text style={[styles.scheduleNum, { color: colors.muted }]}>{i + 1}</Text>
          <Text style={[styles.scheduleDate, { color: colors.textSecondary }]}>{formatDate(item.date)}</Text>
          <Text style={[styles.scheduleAmount, { color: colors.text, fontFamily: type.monoSemi }]}>
            ${item.amount.toFixed(2)}
          </Text>
        </Animated.View>
      ))}
      <View style={[styles.scheduleRow, { borderTopColor: colors.border }]}>
        <Text style={[styles.scheduleNum, { color: "transparent" }]}>—</Text>
        <Text style={[styles.scheduleDate, { color: colors.muted }]}>Total</Text>
        <Text style={[styles.scheduleAmount, { color: colors.text, fontFamily: type.monoBold }]}>
          ${(result.installments.each * result.installments.count).toFixed(2)}
        </Text>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SimulationScreen() {
  const { colors } = useTheme();
  const { isDesktop } = useLayout();
  const reduceMotion = useReducedMotion();

  const [debtGuard, setDebtGuard] = useState(false);
  const [result, setResult] = useState<VfcAuthorizeResponse | null>(null);
  const [rules, setRules] = useState<VfcRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeScenario, setActiveScenario] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardLoading, setGuardLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([api.settings(), api.vfcRules()])
        .then(([s, r]) => {
          if (cancelled) return;
          setDebtGuard(s.debt_guard);
          setRules(r.rules);
        })
        .catch(() => {});
      return () => { cancelled = true; };
    }, [])
  );

  const handleDebtGuard = useCallback(async (val: boolean) => {
    setGuardLoading(true);
    setDebtGuard(val);
    try {
      await api.setSettings(val);
      if (supabase) {
        supabase.auth.getUser().then(async ({ data }) => {
          const userId = data.user?.id;
          if (!userId) return;
          await supabase!.from("user_settings").upsert(
            { user_id: userId, debt_guard: val, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );
        }).catch(() => {});
      }
    } catch {
      setDebtGuard(!val);
    } finally {
      setGuardLoading(false);
    }
  }, []);

  const handleScenario = useCallback(async (idx: number) => {
    if (loading) return;
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
  }, [loading]);

  const cardAndScenariosEl = (
    <>
      <LinearGradient
        colors={["#111827", "#1E3A5F"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.vfcCard}
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.15)" }]} pointerEvents="none" />
        <View style={styles.vfcCardSheen} pointerEvents="none" />
        <View style={styles.vfcTop}>
          <View style={styles.vfcChip}>
            <Ionicons name="hardware-chip-outline" size={20} color="#fff" style={{ opacity: 0.6 }} />
          </View>
          <Text style={styles.vfcSimBadge}>SIMULATION</Text>
        </View>
        <Text style={styles.vfcNumber}>•••• •••• •••• 0042</Text>
        <View style={styles.vfcBottom}>
          <View>
            <Text style={styles.vfcFieldLabel}>CARD HOLDER</Text>
            <Text style={styles.vfcName}>Pocket Pilot</Text>
          </View>
          <Text style={styles.vfcDesc}>
            Virtual Funding Controller
          </Text>
        </View>
        <FundingBadge result={result} />
      </LinearGradient>
      <DebtGuardSwitch
        value={debtGuard}
        onValueChange={handleDebtGuard}
        explainer={
          debtGuard
            ? "Credit blocked while carrying a balance — routing to debit or installments."
            : "Pay-in-full mode — credit allowed for max rewards."
        }
      />
      <Text style={[styles.sectionLabel, { color: colors.muted }]}>Run a scenario</Text>
      <View style={styles.scenarioRow}>
        {SCENARIOS.map((s, idx) => {
          const active = activeScenario === idx;
          const isLoading = loading && active;
          return (
            <Pressable
              key={s.label}
              onPress={() => handleScenario(idx)}
              disabled={loading}
              accessibilityLabel={`${s.label} ${s.amountLabel}`}
              style={({ pressed }) => [
                styles.scenarioBtn,
                {
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderColor: active ? "transparent" : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              {isLoading ? (
                <Skeleton height={14} width={40} borderRadius={6} />
              ) : (
                <>
                  <Text style={[styles.scenarioBtnLabel, { color: active ? colors.onPrimary : colors.text }]}>
                    {s.label}
                  </Text>
                  <Text style={[styles.scenarioBtnAmount, { color: active ? colors.onPrimary : colors.muted, opacity: 0.8 }]}>
                    {s.amountLabel}
                  </Text>
                </>
              )}
            </Pressable>
          );
        })}
      </View>
      {error && (
        <View style={[styles.errorBox, { backgroundColor: colors.warnFill, borderColor: colors.warn + "44" }]}>
          <Ionicons name="warning" size={14} color={colors.warn} />
          <Text style={[styles.errorText, { color: colors.warn }]}>{error}</Text>
        </View>
      )}
      {result && !loading && (
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(260).springify()}
          style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.reasonText, { color: colors.text }]}>{result.reason}</Text>
          {result.mcc_preserved && (
            <View style={styles.mccRow}>
              <Ionicons name="checkmark-circle" size={14} color={colors.good} />
              <Text style={[styles.mccText, { color: colors.good }]}>
                MCC {result.mcc} kept — category bonus preserved
              </Text>
            </View>
          )}
          {result.funding === "installments" && result.installments && (
            <InstallmentSchedule result={result} />
          )}
        </Animated.View>
      )}
    </>
  );

  const rulesEl = (
    <>
      <Text style={[styles.sectionLabel, { color: colors.muted }]}>Decision rules</Text>
      {rules.length === 0 ? (
        <View style={{ gap: spacing.md }}>
          {[110, 100, 110, 100].map((h, i) => (
            <Skeleton key={i} height={h} borderRadius={radius.xl} />
          ))}
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          {rules.map((rule, i) => (
            <Animated.View
              key={rule.id}
              entering={reduceMotion ? undefined : FadeInDown.delay(i * 60).duration(260)}
            >
              <RuleCard rule={rule} matched={result?.rule_id === rule.id} />
            </Animated.View>
          ))}
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <ScrollView
        contentContainerStyle={isDesktop ? styles.scrollDesktop : styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {isDesktop ? (
          <View style={styles.desktopWrap}>
            <View style={styles.pageHeader}>
              <Text style={[styles.pageTitle, { color: colors.text }]}>One Card</Text>
              <View style={[styles.simChip, { backgroundColor: colors.warnFill, borderColor: colors.warn + "44" }]}>
                <Ionicons name="flask-outline" size={12} color={colors.warn} />
                <Text style={[styles.simChipText, { color: colors.warn }]}>Simulated</Text>
              </View>
            </View>
            <View style={styles.desktopColumns}>
              <View style={styles.desktopLeft}>{rulesEl}</View>
              <View style={styles.desktopRight}>{cardAndScenariosEl}</View>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.pageHeader}>
              <Text style={[styles.pageTitle, { color: colors.text }]}>One Card</Text>
              <View style={[styles.simChip, { backgroundColor: colors.warnFill, borderColor: colors.warn + "44" }]}>
                <Ionicons name="flask-outline" size={12} color={colors.warn} />
                <Text style={[styles.simChipText, { color: colors.warn }]}>Simulated</Text>
              </View>
            </View>
            {cardAndScenariosEl}
            {rulesEl}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 96 },
  scrollDesktop: { paddingBottom: 96, alignItems: "center" },
  desktopWrap: { maxWidth: 1120, width: "100%", paddingHorizontal: 40, paddingTop: spacing.lg, gap: spacing.lg },
  desktopColumns: { flexDirection: "row", gap: 32, alignItems: "flex-start" },
  desktopLeft: { flex: 1, gap: spacing.md },
  desktopRight: { flex: 1, gap: spacing.lg },

  // Page header
  pageHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: spacing.sm },
  pageTitle: { fontSize: font.screen, fontFamily: type.uiBold, letterSpacing: -0.4, flex: 1 },
  simChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  simChipText: { fontSize: font.label, fontFamily: type.uiBold },

  // VFC card
  vfcCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    overflow: "hidden",
    ...shadow.stack,
  },
  vfcCardSheen: {
    position: "absolute",
    top: -48,
    right: -32,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  vfcTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  vfcChip: {
    width: 36,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  vfcSimBadge: {
    color: "rgba(255,255,255,0.45)",
    fontSize: font.label,
    fontFamily: type.uiBold,
    letterSpacing: 2,
  },
  vfcNumber: {
    color: "rgba(255,255,255,0.9)",
    fontSize: font.title,
    fontFamily: type.mono,
    letterSpacing: 3,
    marginBottom: spacing.lg,
  },
  vfcBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: spacing.md,
  },
  vfcFieldLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 9,
    fontFamily: type.uiMedium,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  vfcName: {
    color: "#fff",
    fontSize: font.body,
    fontFamily: type.uiBold,
  },
  vfcDesc: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 9,
    fontFamily: type.ui,
    textAlign: "right",
    maxWidth: 140,
  },

  // Funding badge
  fundingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  fundingDot: { width: 7, height: 7, borderRadius: 3.5 },
  fundingText: { fontSize: font.label, fontFamily: type.uiSemi },

  // Section label
  sectionLabel: {
    fontSize: font.label,
    fontFamily: type.uiMedium,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  // Scenarios
  scenarioRow: { flexDirection: "row", gap: spacing.sm },
  scenarioBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    minHeight: 64,
    ...shadow.soft,
  },
  scenarioBtnLabel: { fontSize: font.body, fontFamily: type.uiSemi },
  scenarioBtnAmount: { fontSize: font.label, fontFamily: type.mono, marginTop: 2 },

  // Error
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  errorText: { fontSize: font.body, fontFamily: type.ui, flex: 1 },

  // Result
  resultCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.soft,
  },
  reasonText: { fontSize: font.body, fontFamily: type.uiMedium, lineHeight: 22 },
  mccRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  mccText: { fontSize: font.label, fontFamily: type.uiSemi },

  // Rule card
  ruleCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  ruleMatchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginBottom: spacing.xs,
  },
  ruleMatchText: { color: "#fff", fontSize: font.label, fontFamily: type.uiBold },
  ruleRow: { flexDirection: "row", gap: spacing.sm },
  ruleRowLabel: { fontSize: font.label, fontFamily: type.uiBold, width: 36, paddingTop: 1 },
  ruleRowValue: { flex: 1, fontSize: font.label, fontFamily: type.uiMedium, lineHeight: 18 },

  // Schedule
  scheduleBlock: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  scheduleTitle: { fontSize: font.label, fontFamily: type.uiBold, padding: spacing.md, paddingBottom: spacing.sm },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  scheduleNum: { fontSize: font.label, fontFamily: type.uiMedium, width: 20 },
  scheduleDate: { flex: 1, fontSize: font.label, fontFamily: type.uiMedium },
  scheduleAmount: { fontSize: font.label, fontFamily: type.monoSemi },
});

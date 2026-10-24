import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { api, PickResponse, RankedCard } from "../../api";
import UsageBar from "../../components/UsageBar";
import PressScale from "../../components/PressScale";
import Skeleton from "../../components/Skeleton";
import { usd } from "../../format";
import { lightTap } from "../../haptics";
import { colors, spacing, radius, font, type, shadow, hit } from "../../theme";

// Card color/text_color looked up from /api/wallet by card_id
type ColorMap = Record<string, { color: string; text_color: string }>;

// ── Quick-pick stores ─────────────────────────────────────────────────────

const QUICK_PICKS: { label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: "Whole Foods", icon: "leaf-outline" },
  { label: "Shell",       icon: "flame-outline" },
  { label: "Target",      icon: "storefront-outline" },
  { label: "Costco",      icon: "cube-outline" },
  { label: "Chipotle",    icon: "restaurant-outline" },
];

// ── Ranked row ────────────────────────────────────────────────────────────

function RankedRow({
  card,
  rank,
  debtGuard,
}: {
  card: RankedCard;
  rank: number;
  debtGuard: boolean;
}) {
  const reduce = useReducedMotion();
  const isBest = rank === 0;
  const entering = reduce
    ? undefined
    : FadeInDown.delay(rank * 60).duration(260).springify();

  return (
    <Animated.View
      entering={entering}
      style={[styles.rankedRow, isBest && styles.rankedBest]}
    >
      <View
        style={[
          styles.rankBadge,
          { backgroundColor: isBest ? colors.goodFill : colors.surfaceSubtle },
        ]}
      >
        <Text style={[styles.rankNum, { color: isBest ? colors.good : colors.muted }]}>
          #{rank + 1}
        </Text>
      </View>

      <View style={styles.rankedInfo}>
        <Text style={[styles.rankedName, { color: isBest ? colors.text : colors.muted }]}>
          {card.name}
        </Text>
        <Text style={styles.rankedLabel}>{card.rate_label}</Text>
        {card.bonus_note ? (
          <Text style={styles.bonusNote} numberOfLines={2}>{card.bonus_note}</Text>
        ) : null}
        {card.warnings.length > 0 ? (
          <Text style={styles.warningNote} numberOfLines={1}>{card.warnings[0]}</Text>
        ) : null}
      </View>

      <View style={styles.rankedValue}>
        <Text style={[styles.netValue, { color: card.net >= 0 ? colors.good : colors.warn }]}>
          {card.net >= 0 ? "+" : ""}{usd(card.net)}
        </Text>
        <Text style={styles.rankedSub}>net</Text>
        <Text style={styles.rewardValue}>+{usd(card.reward)} back</Text>
        {debtGuard && card.interest > 0 ? (
          <Text style={styles.interestValue}>−{usd(card.interest)} interest</Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

// ── Hero skeleton ─────────────────────────────────────────────────────────

function HeroSkeleton() {
  return (
    <View style={styles.heroSkeletonWrap}>
      <Skeleton height={160} r={radius.xl} />
      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        <Skeleton height={20} width="70%" r={8} />
        <Skeleton height={16} width="90%" r={6} />
      </View>
    </View>
  );
}

// ── Best-card hero ────────────────────────────────────────────────────────

function BestHero({
  result,
  debtGuard,
  bestColors,
}: {
  result: PickResponse;
  debtGuard: boolean;
  bestColors: { color: string; text_color: string };
}) {
  const reduce = useReducedMotion();
  const translateY = useSharedValue(reduce ? 0 : 28);
  const opacity = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    translateY.value = withSpring(0, { damping: 16, stiffness: 180, mass: 0.65 });
    opacity.value = withSpring(1, { damping: 20, stiffness: 200 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.best.card_id]);

  const anim = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const bg = bestColors.color;
  const fg = bestColors.text_color;

  return (
    <Animated.View style={[styles.bestCard, { backgroundColor: bg }, anim]}>
      <View style={styles.bestHeader}>
        <Text style={[styles.bestBadge, { color: fg, opacity: 0.7 }]}>Best Pick</Text>
        {result.uncertain && (
          <View style={styles.uncertainChip}>
            <Ionicons name="help-circle" size={13} color={colors.warn} />
            <Text style={styles.uncertainText}>Low confidence</Text>
          </View>
        )}
      </View>

      <Text style={[styles.bestName, { color: fg, fontFamily: type.uiBold }]}>
        {result.best.name}
      </Text>
      <Text style={[styles.bestRate, { color: fg, opacity: 0.72, fontFamily: type.ui }]}>
        {result.best.rate_label}
      </Text>

      <View style={styles.bestNumbers}>
        <View style={styles.bestNumCol}>
          <Text style={[styles.bestValue, { color: fg, fontFamily: type.monoBold }]}>
            {result.best.net >= 0 ? "+" : ""}{usd(result.best.net)}
          </Text>
          <Text style={[styles.bestValueLabel, { color: fg, opacity: 0.65, fontFamily: type.ui }]}>
            net value
          </Text>
        </View>
        <View style={[styles.bestDivider, { backgroundColor: fg + "33" }]} />
        <View style={styles.bestNumCol}>
          <Text style={[styles.bestValue, { color: fg, fontFamily: type.monoBold }]}>
            +{usd(result.best.reward)}
          </Text>
          <Text style={[styles.bestValueLabel, { color: fg, opacity: 0.65, fontFamily: type.ui }]}>
            back
          </Text>
        </View>
        {debtGuard && result.best.interest > 0 && (
          <>
            <View style={[styles.bestDivider, { backgroundColor: fg + "33" }]} />
            <View style={styles.bestNumCol}>
              <Text style={[styles.bestValue, { color: colors.warnFill, fontFamily: type.monoBold }]}>
                −{usd(result.best.interest)}
              </Text>
              <Text style={[styles.bestValueLabel, { color: fg, opacity: 0.65, fontFamily: type.ui }]}>
                interest
              </Text>
            </View>
          </>
        )}
      </View>

      {result.best.bonus_note ? (
        <Text style={[styles.bonusHero, { color: fg, opacity: 0.72, fontFamily: type.ui }]}>
          {result.best.bonus_note}
        </Text>
      ) : null}
    </Animated.View>
  );
}

// ── Pick screen ───────────────────────────────────────────────────────────

export default function PickScreen() {
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [foreign, setForeign] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PickResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debtGuard, setDebtGuard] = useState(false);
  const [colorMap, setColorMap] = useState<ColorMap>({});

  useFocusEffect(
    useCallback(() => {
      Promise.all([api.settings(), api.wallet()])
        .then(([s, w]) => {
          setDebtGuard(s.debt_guard);
          const map: ColorMap = {};
          for (const c of w.cards) {
            map[c.id] = { color: c.color, text_color: c.text_color };
          }
          setColorMap(map);
        })
        .catch(() => {});
    }, [])
  );

  const canSubmit = merchant.trim().length > 0 && parseFloat(amount) > 0;

  const submit = async (overrideMerchant?: string) => {
    const m = (overrideMerchant ?? merchant).trim();
    if (!m || !(parseFloat(amount) > 0) || loading) return;
    lightTap();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.pick(m, parseFloat(amount), foreign);
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickPick = (label: string) => {
    lightTap();
    setMerchant(label);
    if (parseFloat(amount) > 0) submit(label);
  };

  const bestColors = result
    ? (colorMap[result.best.card_id] ?? { color: colors.primary, text_color: colors.onPrimary })
    : { color: colors.primary, text_color: colors.onPrimary };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <Text style={styles.title}>Pick a Card</Text>
          <Text style={styles.subtitle}>
            Enter where you're shopping and we'll pick the best card.
          </Text>

          {/* Debt Guard chip */}
          <View style={[styles.guardChip, debtGuard && styles.guardChipOn]}>
            <Ionicons
              name={debtGuard ? "shield-checkmark" : "shield-outline"}
              size={14}
              color={debtGuard ? colors.good : colors.muted}
            />
            <Text style={[styles.guardChipText, { color: debtGuard ? colors.good : colors.muted }]}>
              Debt Guard {debtGuard ? "On" : "Off"}
            </Text>
            <Text style={styles.guardChipSub}>
              {debtGuard ? "· interest-first picks" : "· points-first picks"}
            </Text>
          </View>

          {/* Form card */}
          <View style={styles.formCard}>
            {/* Quick-pick pills */}
            <Text style={styles.fieldLabel}>Quick Pick</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRow}
            >
              {QUICK_PICKS.map((q) => {
                const active = merchant === q.label;
                return (
                  <PressScale
                    key={q.label}
                    onPress={() => handleQuickPick(q.label)}
                    style={[styles.quickChip, active && styles.quickChipActive]}
                    accessibilityLabel={q.label}
                  >
                    <Ionicons
                      name={q.icon}
                      size={14}
                      color={active ? colors.onPrimary : colors.muted}
                    />
                    <Text style={[styles.quickChipText, active && styles.quickChipTextActive]}>
                      {q.label}
                    </Text>
                  </PressScale>
                );
              })}
            </ScrollView>

            {/* Store input */}
            <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Store / Merchant</Text>
            <TextInput
              style={styles.input}
              value={merchant}
              onChangeText={setMerchant}
              placeholder="e.g. Whole Foods, Amazon…"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              returnKeyType="next"
            />

            {/* Amount input */}
            <Text style={styles.fieldLabel}>Amount ($)</Text>
            <TextInput
              style={[styles.input, styles.amountInput]}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={() => submit()}
            />

            {/* Foreign transaction toggle */}
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>Foreign transaction</Text>
                <Text style={styles.switchSub}>Shopping outside the US?</Text>
              </View>
              <View style={styles.switchHit}>
                <Switch
                  value={foreign}
                  onValueChange={setForeign}
                  trackColor={{ false: colors.border, true: colors.good }}
                  thumbColor={colors.surface}
                  ios_backgroundColor={colors.border}
                />
              </View>
            </View>

            {/* Submit */}
            <PressScale
              onPress={() => submit()}
              disabled={!canSubmit || loading}
              style={[styles.submitBtn, (!canSubmit || loading) && styles.submitDisabled]}
              accessibilityLabel="Find best card"
            >
              {loading ? (
                <View style={styles.submitInner}>
                  <Skeleton height={18} width={18} r={9} />
                  <Text style={styles.submitText}>Finding…</Text>
                </View>
              ) : (
                <View style={styles.submitInner}>
                  <Ionicons
                    name="flash"
                    size={17}
                    color={canSubmit ? colors.onPrimary : colors.muted}
                  />
                  <Text style={[styles.submitText, !canSubmit && styles.submitTextDim]}>
                    Find Best Card
                  </Text>
                </View>
              )}
            </PressScale>
          </View>

          {/* Error */}
          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.warn} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Loading skeleton */}
          {loading && <HeroSkeleton />}

          {/* Result */}
          {result && !loading && (
            <View style={styles.result}>
              {/* Uncertain banner */}
              {result.uncertain && (
                <View style={styles.uncertainBanner}>
                  <Ionicons name="help-circle" size={16} color={colors.warn} />
                  <Text style={styles.uncertainBannerText}>
                    Not sure what this store is — showing safest card.
                  </Text>
                </View>
              )}

              {/* Best card hero */}
              <BestHero result={result} debtGuard={debtGuard} bestColors={bestColors} />

              {/* Store row */}
              <View style={styles.storeRow}>
                <Ionicons name="storefront-outline" size={14} color={colors.muted} />
                <Text style={styles.storeText}>
                  {result.store.label} · {result.store.category}
                </Text>
                <View style={styles.confBar}>
                  <UsageBar usage={result.store.confidence} height={4} />
                </View>
                <Text style={styles.confPct}>
                  {(result.store.confidence * 100).toFixed(0)}%
                </Text>
              </View>

              {/* Reason */}
              <View style={styles.reasonBox}>
                <Text style={styles.reasonText}>{result.reason}</Text>
              </View>

              {/* Ranked list */}
              <Text style={styles.rankedTitle}>All Cards Ranked</Text>
              {result.ranked.map((c, i) => (
                <RankedRow key={c.card_id} card={c} rank={i} debtGuard={debtGuard} />
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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

  // Debt Guard chip
  guardChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 99,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: "flex-start",
    minHeight: hit.min,
  },
  guardChipOn: {
    borderColor: colors.good + "55",
    backgroundColor: colors.goodFill,
  },
  guardChipText: {
    fontSize: font.label,
    fontFamily: type.uiSemi,
  },
  guardChipSub: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.ui,
  },

  // Form
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.soft,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.uiMedium,
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  quickRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  quickChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 99,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: hit.min,
  },
  quickChipActive: {
    backgroundColor: colors.primary,
  },
  quickChipText: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.uiSemi,
  },
  quickChipTextActive: { color: colors.onPrimary },

  input: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: font.body,
    fontFamily: type.ui,
    marginBottom: spacing.md,
    minHeight: hit.min,
    borderWidth: 1,
    borderColor: colors.border,
  },
  amountInput: {
    fontFamily: type.mono,
    fontSize: font.title,
    letterSpacing: 0.4,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  switchSub: {
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
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: hit.min,
    alignItems: "center",
    justifyContent: "center",
  },
  submitDisabled: { backgroundColor: colors.surfaceSubtle },
  submitInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  submitText: {
    color: colors.onPrimary,
    fontSize: font.body,
    fontFamily: type.uiSemi,
  },
  submitTextDim: { color: colors.muted },

  // Error
  errorBox: {
    backgroundColor: colors.warnFill,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.warn + "44",
  },
  errorText: {
    color: colors.warn,
    fontSize: font.body,
    fontFamily: type.ui,
    flex: 1,
  },

  // Loading skeleton
  heroSkeletonWrap: { marginBottom: spacing.lg },

  // Result
  result: { gap: spacing.md },

  uncertainBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.warnFill,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warn + "44",
    padding: spacing.md,
  },
  uncertainBannerText: {
    color: colors.warn,
    fontSize: font.body,
    fontFamily: type.uiSemi,
    flex: 1,
  },

  // Best card hero
  bestCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.stack,
  },
  bestHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  bestBadge: {
    fontSize: font.label,
    fontFamily: type.uiBold,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  uncertainChip: { flexDirection: "row", alignItems: "center", gap: 3 },
  uncertainText: {
    color: colors.warn,
    fontSize: font.label,
    fontFamily: type.uiSemi,
  },
  bestName: {
    fontSize: font.screen,
    marginBottom: 3,
  },
  bestRate: { fontSize: font.label, marginBottom: spacing.md },
  bestNumbers: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  bestNumCol: { alignItems: "flex-start" },
  bestDivider: { width: StyleSheet.hairlineWidth, height: 36 },
  bestValue: { fontSize: font.title },
  bestValueLabel: { fontSize: font.label, marginTop: 2 },
  bonusHero: { fontSize: font.label, marginTop: spacing.sm, lineHeight: 18 },

  // Store
  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.soft,
  },
  storeText: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.ui,
    flex: 1,
  },
  confBar: { width: 56 },
  confPct: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.mono,
    width: 28,
  },

  // Reason
  reasonBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.good,
    ...shadow.soft,
  },
  reasonText: {
    color: colors.text,
    fontSize: font.body,
    fontFamily: type.ui,
    lineHeight: 22,
  },

  // Ranked list
  rankedTitle: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.uiMedium,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  rankedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.soft,
  },
  rankedBest: {
    borderWidth: 1,
    borderColor: colors.good + "55",
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rankNum: { fontSize: font.label, fontFamily: type.uiBold },
  rankedInfo: { flex: 1 },
  rankedName: { fontSize: font.body, fontFamily: type.uiSemi },
  rankedLabel: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.ui,
    marginTop: 2,
  },
  bonusNote: {
    color: colors.good,
    fontSize: font.label,
    fontFamily: type.uiMedium,
    marginTop: 3,
    lineHeight: 16,
  },
  warningNote: {
    color: colors.warn,
    fontSize: font.label,
    fontFamily: type.uiMedium,
    marginTop: 3,
  },
  rankedValue: { alignItems: "flex-end", flexShrink: 0 },
  netValue: { fontSize: font.body, fontFamily: type.monoBold },
  rankedSub: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.ui,
  },
  rewardValue: {
    color: colors.good,
    fontSize: font.label,
    fontFamily: type.monoSemi,
    marginTop: 2,
  },
  interestValue: {
    color: colors.warn,
    fontSize: font.label,
    fontFamily: type.monoSemi,
    marginTop: 1,
  },
});

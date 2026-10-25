import React, { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { api, type PickResponse, type RankedCard } from "../../api";
import { useTheme } from "../../ThemeContext";
import { cardArt, font, type, spacing, radius, shadow, hit } from "../../theme";
import RankedCardRow from "../../components/RankedCardRow";
import StoreChip from "../../components/StoreChip";
import Skeleton from "../../components/Skeleton";

// ── Quick-pick stores ─────────────────────────────────────────────────────────

const QUICK_PICKS: { label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: "Whole Foods", icon: "leaf-outline" },
  { label: "Shell", icon: "flame-outline" },
  { label: "Target", icon: "storefront-outline" },
  { label: "Costco", icon: "cube-outline" },
  { label: "Chipotle", icon: "restaurant-outline" },
];

// ── Best-card hero ────────────────────────────────────────────────────────────

function BestHero({ result, debtGuard }: { result: PickResponse; debtGuard: boolean }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(reduceMotion ? 0 : 28);
  const opacityV = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    translateY.value = withSpring(0, { damping: 16, stiffness: 180, mass: 0.65 });
    opacityV.value = withSpring(1, { damping: 20, stiffness: 200 });
  }, [result.best.card_id]);

  const anim = useAnimatedStyle(() => ({
    opacity: opacityV.value,
    transform: [{ translateY: translateY.value }],
  }));

  const art = cardArt[result.best.card_id];
  const gradient: [string, string] = art ? art.gradient : ["#111827", "#374151"];

  return (
    <Animated.View style={[styles.heroOuter, anim]}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        {/* Overlay */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.cardOverlay }]} pointerEvents="none" />
        {/* Sheen */}
        <View style={styles.sheen} pointerEvents="none" />

        <View style={styles.heroHeader}>
          <Text style={[styles.heroBadge, { color: colors.cardTextSecondary }]}>BEST PICK</Text>
          {result.uncertain && (
            <View style={[styles.uncertainChip, { backgroundColor: colors.warnFill }]}>
              <Ionicons name="help-circle" size={12} color={colors.warn} />
              <Text style={[styles.uncertainText, { color: colors.warn }]}>Low confidence</Text>
            </View>
          )}
        </View>

        <Text style={[styles.heroName, { color: colors.cardText }]}>{result.best.name}</Text>
        <Text style={[styles.heroRate, { color: colors.cardTextSecondary }]}>{result.best.rate_label}</Text>

        <View style={styles.heroNumbers}>
          <View style={styles.heroNumCol}>
            <Text style={[styles.heroValue, { color: colors.cardText }]}>
              {result.best.net >= 0 ? "+" : ""}${Math.abs(result.best.net).toFixed(2)}
            </Text>
            <Text style={[styles.heroValueLabel, { color: colors.cardTextSecondary }]}>net value</Text>
          </View>
          <View style={[styles.heroDivider, { backgroundColor: "rgba(255,255,255,0.2)" }]} />
          <View style={styles.heroNumCol}>
            <Text style={[styles.heroValue, { color: colors.cardText }]}>
              +${result.best.reward.toFixed(2)}
            </Text>
            <Text style={[styles.heroValueLabel, { color: colors.cardTextSecondary }]}>back</Text>
          </View>
          {debtGuard && result.best.interest > 0 && (
            <>
              <View style={[styles.heroDivider, { backgroundColor: "rgba(255,255,255,0.2)" }]} />
              <View style={styles.heroNumCol}>
                <Text style={[styles.heroValue, { color: colors.warnFill }]}>
                  −${result.best.interest.toFixed(2)}
                </Text>
                <Text style={[styles.heroValueLabel, { color: colors.cardTextSecondary }]}>interest</Text>
              </View>
            </>
          )}
        </View>

        {result.best.bonus_note ? (
          <Text style={[styles.heroBonusNote, { color: colors.cardTextSecondary }]}>
            {result.best.bonus_note}
          </Text>
        ) : null}
      </LinearGradient>
    </Animated.View>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function HeroSkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      <Skeleton height={180} borderRadius={radius.xl} />
      <Skeleton height={20} width="60%" />
      <Skeleton height={16} width="80%" />
    </View>
  );
}

// ── Pick screen ───────────────────────────────────────────────────────────────

export default function PickScreen() {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [foreign, setForeign] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PickResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debtGuard, setDebtGuard] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api.settings().then((s) => setDebtGuard(s.debt_guard)).catch(() => {});
    }, [])
  );

  const canSubmit = merchant.trim().length > 0 && parseFloat(amount) > 0;

  const submit = useCallback(
    async (overrideMerchant?: string) => {
      const m = (overrideMerchant ?? merchant).trim();
      if (!m || !(parseFloat(amount) > 0) || loading) return;
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
    },
    [merchant, amount, foreign, loading]
  );

  const handleQuickPick = useCallback(
    (label: string) => {
      setMerchant(label);
      if (parseFloat(amount) > 0) submit(label);
    },
    [amount, submit]
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Debt Guard status chip */}
          <View
            style={[
              styles.guardChip,
              {
                backgroundColor: debtGuard ? colors.goodFill : colors.surface,
                borderColor: debtGuard ? colors.good + "55" : colors.border,
              },
            ]}
          >
            <Ionicons
              name={debtGuard ? "shield-checkmark" : "shield-outline"}
              size={14}
              color={debtGuard ? colors.good : colors.muted}
            />
            <Text style={[styles.guardChipText, { color: debtGuard ? colors.good : colors.muted }]}>
              Debt Guard {debtGuard ? "On · interest-first" : "Off · rewards-first"}
            </Text>
          </View>

          {/* Form card */}
          <View style={[styles.formCard, { backgroundColor: colors.surface }]}>
            {/* Quick picks */}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Quick Pick</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRow}
            >
              {QUICK_PICKS.map((q) => (
                <StoreChip
                  key={q.label}
                  label={q.label}
                  selected={merchant === q.label}
                  onPress={() => handleQuickPick(q.label)}
                />
              ))}
            </ScrollView>

            {/* Store input */}
            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: spacing.lg }]}>
              Store / Merchant
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceSubtle, color: colors.text, borderColor: colors.border }]}
              value={merchant}
              onChangeText={setMerchant}
              placeholder="e.g. Whole Foods, Amazon…"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              returnKeyType="next"
            />

            {/* Amount */}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Amount ($)</Text>
            <TextInput
              style={[styles.input, styles.amountInput, { backgroundColor: colors.surfaceSubtle, color: colors.text, borderColor: colors.border }]}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={() => submit()}
            />

            {/* Foreign toggle */}
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.muted, marginBottom: 0 }]}>
                  Foreign transaction
                </Text>
                <Text style={[styles.switchSub, { color: colors.muted }]}>Shopping outside the US?</Text>
              </View>
              <Switch
                value={foreign}
                onValueChange={setForeign}
                trackColor={{ false: colors.border, true: colors.good }}
                thumbColor={colors.surface}
                ios_backgroundColor={colors.border}
              />
            </View>

            {/* Submit */}
            <Pressable
              onPress={() => submit()}
              disabled={!canSubmit || loading}
              accessibilityLabel="Find best card"
              style={({ pressed }) => [
                styles.submitBtn,
                {
                  backgroundColor: canSubmit && !loading ? colors.primary : colors.surfaceSubtle,
                  opacity: pressed ? 0.88 : 1,
                },
              ]}
            >
              <View style={styles.submitInner}>
                {loading ? (
                  <Skeleton height={16} width={16} borderRadius={8} />
                ) : (
                  <Ionicons name="flash" size={17} color={canSubmit ? colors.onPrimary : colors.muted} />
                )}
                <Text
                  style={[styles.submitText, { color: canSubmit && !loading ? colors.onPrimary : colors.muted }]}
                >
                  {loading ? "Finding…" : "Find Best Card"}
                </Text>
              </View>
            </Pressable>
          </View>

          {/* Error */}
          {error && (
            <View style={[styles.errorBox, { backgroundColor: colors.warnFill, borderColor: colors.warn + "44" }]}>
              <Ionicons name="alert-circle" size={16} color={colors.warn} />
              <Text style={[styles.errorText, { color: colors.warn }]}>{error}</Text>
            </View>
          )}

          {/* Loading skeleton */}
          {loading && <HeroSkeleton />}

          {/* Result */}
          {result && !loading && (
            <View style={{ gap: spacing.md }}>
              {/* Uncertain banner */}
              {result.uncertain && (
                <View style={[styles.uncertainBanner, { backgroundColor: colors.warnFill, borderColor: colors.warn + "44" }]}>
                  <Ionicons name="help-circle" size={16} color={colors.warn} />
                  <Text style={[styles.uncertainBannerText, { color: colors.warn }]}>
                    Not sure what this store is — showing safest card.
                  </Text>
                </View>
              )}

              {/* Best card hero */}
              <BestHero result={result} debtGuard={debtGuard} />

              {/* Store info row */}
              <View style={[styles.storeRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="storefront-outline" size={14} color={colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.storeLabel, { color: colors.text }]}>{result.store.label}</Text>
                  {result.store.note ? (
                    <Text style={[styles.storeNote, { color: colors.muted }]}>{result.store.note}</Text>
                  ) : null}
                </View>
                <View style={[styles.confBadge, { backgroundColor: colors.surfaceSubtle }]}>
                  <Text style={[styles.confText, { color: colors.muted }]}>
                    {(result.store.confidence * 100).toFixed(0)}% conf.
                  </Text>
                </View>
              </View>

              {/* Reason */}
              <View style={[styles.reasonBox, { backgroundColor: colors.surface, borderLeftColor: colors.accent }]}>
                <Text style={[styles.reasonText, { color: colors.text }]}>{result.reason}</Text>
              </View>

              {/* Ranked list */}
              <Text style={[styles.rankedTitle, { color: colors.muted }]}>All Cards Ranked</Text>
              {result.ranked.map((c: RankedCard, i) => (
                <Animated.View
                  key={c.card_id}
                  entering={reduceMotion ? undefined : FadeInDown.delay(i * 60).duration(260).springify()}
                >
                  <RankedCardRow
                    rank={i + 1}
                    card={c}
                    isWinner={i === 0}
                    dimmed={i > 0}
                  />
                </Animated.View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 48 },

  // Guard chip
  guardChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    borderWidth: 1,
    alignSelf: "flex-start",
    minHeight: hit.min,
  },
  guardChipText: { fontSize: font.label, fontFamily: type.uiSemi },

  // Form
  formCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.soft,
  },
  fieldLabel: {
    fontSize: font.label,
    fontFamily: type.uiMedium,
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  quickRow: { flexDirection: "row", gap: spacing.sm, paddingBottom: spacing.xs },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: font.body,
    fontFamily: type.ui,
    marginBottom: spacing.md,
    minHeight: hit.min,
    borderWidth: 1,
  },
  amountInput: { fontFamily: type.mono, fontSize: font.title, letterSpacing: 0.4 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  switchSub: { fontSize: font.label, fontFamily: type.ui, marginTop: 2 },
  submitBtn: {
    borderRadius: radius.md,
    minHeight: hit.min,
    alignItems: "center",
    justifyContent: "center",
  },
  submitInner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  submitText: { fontSize: font.body, fontFamily: type.uiSemi },

  // Error
  errorBox: {
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
  },
  errorText: { fontSize: font.body, fontFamily: type.ui, flex: 1 },

  // Hero
  heroOuter: { borderRadius: radius.xl, ...shadow.stack },
  hero: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    overflow: "hidden",
    gap: spacing.sm,
  },
  sheen: {
    position: "absolute",
    top: -48,
    right: -32,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  heroHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroBadge: { fontSize: font.label, fontFamily: type.uiBold, letterSpacing: 1 },
  uncertainChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  uncertainText: { fontSize: font.label, fontFamily: type.uiSemi },
  heroName: { fontSize: font.screen, fontFamily: type.uiBold },
  heroRate: { fontSize: font.label, fontFamily: type.uiMedium },
  heroNumbers: { flexDirection: "row", alignItems: "center", gap: spacing.lg, marginTop: spacing.sm },
  heroNumCol: {},
  heroDivider: { width: StyleSheet.hairlineWidth, height: 36 },
  heroValue: { fontSize: font.title, fontFamily: type.monoBold },
  heroValueLabel: { fontSize: font.label, fontFamily: type.uiMedium, marginTop: 2 },
  heroBonusNote: { fontSize: font.label, fontFamily: type.uiMedium, lineHeight: 18 },

  // Uncertain
  uncertainBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  uncertainBannerText: { fontSize: font.body, fontFamily: type.uiSemi, flex: 1 },

  // Store row
  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  storeLabel: { fontSize: font.body, fontFamily: type.uiMedium },
  storeNote: { fontSize: font.label, fontFamily: type.ui, marginTop: 2 },
  confBadge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  confText: { fontSize: font.label, fontFamily: type.mono },

  // Reason
  reasonBox: {
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    ...shadow.soft,
  },
  reasonText: { fontSize: font.body, fontFamily: type.ui, lineHeight: 22 },

  // Ranked
  rankedTitle: {
    fontSize: font.label,
    fontFamily: type.uiMedium,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, PickResponse, RankedCard } from "../../api";
import UsageBar from "../../components/UsageBar";
import { colors, spacing, radius, font } from "../../theme";

// Safe formatter — never crashes on undefined / NaN
const usd = (n: number | undefined | null): string => {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
};

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
  const isBest = rank === 0;
  return (
    <View style={[styles.rankedRow, isBest && styles.rankedBest]}>
      <View
        style={[
          styles.rankBadge,
          { backgroundColor: isBest ? colors.mint + "22" : colors.border },
        ]}
      >
        <Text style={[styles.rankNum, { color: isBest ? colors.mint : colors.muted }]}>
          #{rank + 1}
        </Text>
      </View>

      <View style={styles.rankedInfo}>
        <Text style={[styles.rankedName, { color: isBest ? colors.text : colors.muted }]}>
          {card.name}
        </Text>
        <Text style={styles.rankedLabel}>{card.rate_label}</Text>
        {card.bonus_note ? (
          <Text style={styles.bonusNote} numberOfLines={2}>
            {card.bonus_note}
          </Text>
        ) : null}
        {card.warnings.length > 0 ? (
          <Text style={styles.warningNote} numberOfLines={1}>
            {card.warnings[0]}
          </Text>
        ) : null}
      </View>

      <View style={styles.rankedValue}>
        {/* net value */}
        <Text style={[styles.netValue, { color: card.net >= 0 ? colors.mint : colors.amber }]}>
          {card.net >= 0 ? "+" : ""}
          {usd(card.net)}
        </Text>
        <Text style={styles.rankedSub}>net</Text>
        {/* reward */}
        <Text style={styles.rewardValue}>+{usd(card.reward)} back</Text>
        {/* interest only when debt_guard is on */}
        {debtGuard && card.interest > 0 ? (
          <Text style={styles.interestValue}>−{usd(card.interest)} interest</Text>
        ) : null}
      </View>
    </View>
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
  // Color/text_color by card_id, fetched from /api/wallet
  const [colorMap, setColorMap] = useState<ColorMap>({});

  // Spring animation for the winning-card hero
  const cardAnim = useRef(new Animated.Value(0)).current;

  // On focus: re-read settings (so Wallet toggle is reflected) + wallet colors
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

  // Animate in the result card each time a new result arrives
  useEffect(() => {
    if (!result) return;
    cardAnim.setValue(0);
    Animated.spring(cardAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 90,
      friction: 7,
    }).start();
  }, [result, cardAnim]);

  const canSubmit = merchant.trim().length > 0 && parseFloat(amount) > 0;

  const submit = async (overrideMerchant?: string) => {
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
  };

  const handleQuickPick = (label: string) => {
    setMerchant(label);
    if (parseFloat(amount) > 0) {
      submit(label);
    }
  };

  const cardTranslate = cardAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });

  // Look up colors for the best card; fall back to dark card defaults
  const bestColors = result
    ? (colorMap[result.best.card_id] ?? { color: colors.card, text_color: colors.text })
    : { color: colors.card, text_color: colors.text };

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
          <Text style={styles.title}>Pick a Card</Text>
          <Text style={styles.subtitle}>
            Enter where you're shopping and we'll pick the best card.
          </Text>

          {/* Debt Guard status chip — reflects Wallet toggle via useFocusEffect */}
          <View style={[styles.guardChip, debtGuard && styles.guardChipOn]}>
            <Ionicons
              name={debtGuard ? "shield" : "shield-outline"}
              size={14}
              color={debtGuard ? colors.mint : colors.muted}
            />
            <Text style={[styles.guardChipText, { color: debtGuard ? colors.mint : colors.muted }]}>
              Debt Guard {debtGuard ? "On" : "Off"}
            </Text>
            <Text style={styles.guardChipSub}>
              {debtGuard ? "· interest-first picks" : "· points-first picks"}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Quick-pick buttons */}
            <Text style={styles.label}>Quick Pick</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRow}
            >
              {QUICK_PICKS.map((q) => {
                const active = merchant === q.label;
                return (
                  <TouchableOpacity
                    key={q.label}
                    style={[styles.quickBtn, active && styles.quickBtnActive]}
                    onPress={() => handleQuickPick(q.label)}
                  >
                    <Ionicons
                      name={q.icon}
                      size={15}
                      color={active ? colors.bg : colors.muted}
                    />
                    <Text
                      style={[styles.quickBtnText, active && styles.quickBtnTextActive]}
                    >
                      {q.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={[styles.label, { marginTop: spacing.md }]}>
              Store / Merchant
            </Text>
            <TextInput
              style={styles.input}
              value={merchant}
              onChangeText={setMerchant}
              placeholder="e.g. Whole Foods, Amazon…"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              returnKeyType="next"
            />

            <Text style={styles.label}>Amount ($)</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={() => submit()}
            />

            <View style={styles.switchRow}>
              <View>
                <Text style={styles.label}>Foreign transaction</Text>
                <Text style={styles.switchSub}>Shopping outside the US?</Text>
              </View>
              <Switch
                value={foreign}
                onValueChange={setForeign}
                trackColor={{ false: colors.border, true: colors.mint + "66" }}
                thumbColor={foreign ? colors.mint : colors.muted}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && styles.submitDisabled]}
              onPress={() => submit()}
              disabled={!canSubmit || loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <>
                  <Ionicons
                    name="flash"
                    size={18}
                    color={canSubmit ? colors.bg : colors.muted}
                  />
                  <Text
                    style={[styles.submitText, !canSubmit && { color: colors.muted }]}
                  >
                    Find Best Card
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Error */}
          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.amber} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Result */}
          {result && (
            <View style={styles.result}>
              {/* Uncertain store banner */}
              {result.uncertain && (
                <View style={styles.uncertainBanner}>
                  <Ionicons name="help-circle" size={18} color={colors.amber} />
                  <Text style={styles.uncertainBannerText}>
                    Not sure what this store is — showing safest card.
                  </Text>
                </View>
              )}

              {/* Best card hero — spring in on each new result */}
              <Animated.View
                style={{
                  opacity: cardAnim,
                  transform: [{ translateY: cardTranslate }],
                }}
              >
                <View
                  style={[
                    styles.bestCard,
                    { backgroundColor: bestColors.color },
                  ]}
                >
                  <View style={styles.bestHeader}>
                    <Text
                      style={[styles.bestBadge, { color: bestColors.text_color }]}
                    >
                      Best Pick
                    </Text>
                    {result.uncertain && (
                      <View style={styles.uncertainChip}>
                        <Ionicons name="help-circle" size={13} color={colors.amber} />
                        <Text style={styles.uncertainText}>Low confidence</Text>
                      </View>
                    )}
                  </View>

                  <Text style={[styles.bestName, { color: bestColors.text_color }]}>
                    {result.best.name}
                  </Text>
                  <Text
                    style={[styles.bestRate, { color: bestColors.text_color + "CC" }]}
                  >
                    {result.best.rate_label}
                  </Text>

                  {/* net + reward breakdown */}
                  <View style={styles.bestNumbers}>
                    <View style={styles.bestNumCol}>
                      <Text style={[styles.bestValue, { color: colors.mint }]}>
                        {result.best.net >= 0 ? "+" : ""}
                        {usd(result.best.net)}
                      </Text>
                      <Text
                        style={[
                          styles.bestValueLabel,
                          { color: bestColors.text_color + "88" },
                        ]}
                      >
                        net value
                      </Text>
                    </View>
                    <View style={styles.bestDivider} />
                    <View style={styles.bestNumCol}>
                      <Text
                        style={[styles.bestValue, { color: bestColors.text_color }]}
                      >
                        +{usd(result.best.reward)}
                      </Text>
                      <Text
                        style={[
                          styles.bestValueLabel,
                          { color: bestColors.text_color + "88" },
                        ]}
                      >
                        back
                      </Text>
                    </View>
                    {debtGuard && result.best.interest > 0 && (
                      <>
                        <View style={styles.bestDivider} />
                        <View style={styles.bestNumCol}>
                          <Text style={[styles.bestValue, { color: colors.amber }]}>
                            −{usd(result.best.interest)}
                          </Text>
                          <Text
                            style={[
                              styles.bestValueLabel,
                              { color: bestColors.text_color + "88" },
                            ]}
                          >
                            interest
                          </Text>
                        </View>
                      </>
                    )}
                  </View>

                  {result.best.bonus_note ? (
                    <Text
                      style={[
                        styles.bonusHero,
                        { color: bestColors.text_color + "BB" },
                      ]}
                    >
                      {result.best.bonus_note}
                    </Text>
                  ) : null}
                </View>
              </Animated.View>

              {/* Store row */}
              <View style={styles.storeRow}>
                <Ionicons name="storefront-outline" size={15} color={colors.muted} />
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
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },

  title: {
    color: colors.text,
    fontSize: font.xxl,
    fontWeight: "800",
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.muted,
    fontSize: font.sm,
    marginBottom: spacing.md,
    lineHeight: 20,
  },

  // Debt Guard chip
  guardChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: "flex-start",
  },
  guardChipOn: { borderColor: colors.mint + "44" },
  guardChipText: { fontSize: font.sm, fontWeight: "700" },
  guardChipSub: { color: colors.muted, fontSize: font.xs },

  // Form
  form: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  label: {
    color: colors.muted,
    fontSize: font.xs,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  quickRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  quickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickBtnActive: { backgroundColor: colors.mint, borderColor: colors.mint },
  quickBtnText: { color: colors.muted, fontSize: font.sm, fontWeight: "600" },
  quickBtnTextActive: { color: colors.bg },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: font.md,
    marginBottom: spacing.md,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  switchSub: { color: colors.muted, fontSize: font.xs, marginTop: 2 },
  submitBtn: {
    backgroundColor: colors.mint,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  submitDisabled: { backgroundColor: colors.border },
  submitText: { color: colors.bg, fontSize: font.md, fontWeight: "700" },

  // Error
  errorBox: {
    backgroundColor: colors.amber + "22",
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  errorText: { color: colors.amber, fontSize: font.sm, flex: 1 },

  // Result
  result: { gap: spacing.md },

  // Uncertain banner
  uncertainBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.amber + "18",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.amber + "44",
    padding: spacing.md,
  },
  uncertainBannerText: {
    color: colors.amber,
    fontSize: font.sm,
    fontWeight: "600",
    flex: 1,
  },

  // Best card hero
  bestCard: { borderRadius: radius.xl, padding: spacing.lg },
  bestHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  bestBadge: {
    fontSize: font.xs,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    opacity: 0.7,
  },
  uncertainChip: { flexDirection: "row", alignItems: "center", gap: 3 },
  uncertainText: { color: colors.amber, fontSize: font.xs, fontWeight: "600" },
  bestName: { fontSize: font.xxl, fontWeight: "800" },
  bestRate: { fontSize: font.sm, marginTop: 2, marginBottom: spacing.md },
  bestNumbers: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  bestNumCol: { alignItems: "flex-start" },
  bestDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  bestValue: { fontSize: font.xl, fontWeight: "800" },
  bestValueLabel: { fontSize: font.xs, marginTop: 2 },
  bonusHero: { fontSize: font.xs, marginTop: spacing.sm, lineHeight: 16 },

  // Store
  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  storeText: { color: colors.muted, fontSize: font.sm, flex: 1 },
  confBar: { width: 60 },
  confPct: { color: colors.muted, fontSize: font.xs, width: 28 },

  // Reason
  reasonBox: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.mint,
  },
  reasonText: { color: colors.text, fontSize: font.sm, lineHeight: 20 },

  // Ranked list
  rankedTitle: {
    color: colors.muted,
    fontSize: font.xs,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  rankedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  rankedBest: { borderWidth: 1, borderColor: colors.mint + "44" },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rankNum: { fontSize: font.xs, fontWeight: "800" },
  rankedInfo: { flex: 1 },
  rankedName: { fontSize: font.sm, fontWeight: "700" },
  rankedLabel: { color: colors.muted, fontSize: font.xs, marginTop: 2 },
  bonusNote: {
    color: colors.mint,
    fontSize: font.xs,
    marginTop: 3,
    lineHeight: 15,
  },
  warningNote: {
    color: colors.amber,
    fontSize: font.xs,
    marginTop: 3,
  },
  rankedValue: { alignItems: "flex-end", flexShrink: 0 },
  netValue: { fontSize: font.md, fontWeight: "700" },
  rankedSub: { color: colors.muted, fontSize: font.xs },
  rewardValue: { color: colors.mint, fontSize: font.xs, marginTop: 2 },
  interestValue: { color: colors.amber, fontSize: font.xs, marginTop: 1 },
});

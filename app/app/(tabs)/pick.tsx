import React, { useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, PickResponse, RankedCard } from "../../api";
import UsageBar from "../../components/UsageBar";
import { colors, spacing, radius, font } from "../../theme";

const usd = (n: number) => `$${n.toFixed(2)}`;

function RankedRow({
  card,
  rank,
}: {
  card: RankedCard;
  rank: number;
}) {
  const isBest = rank === 0;
  return (
    <View style={[styles.rankedRow, isBest && styles.rankedBest]}>
      <View style={[styles.rankBadge, { backgroundColor: isBest ? colors.mint + "22" : colors.border }]}>
        <Text style={[styles.rankNum, { color: isBest ? colors.mint : colors.muted }]}>
          #{rank + 1}
        </Text>
      </View>
      <View style={styles.rankedInfo}>
        <Text style={[styles.rankedName, { color: isBest ? colors.text : colors.muted }]}>
          {card.name}
        </Text>
        <Text style={styles.rankedLabel}>{card.rate_label}</Text>
      </View>
      <View style={styles.rankedValue}>
        <Text style={[styles.netValue, { color: card.net_value >= 0 ? colors.mint : colors.amber }]}>
          {card.net_value >= 0 ? "+" : ""}{usd(card.net_value)}
        </Text>
        <Text style={styles.rankedSub}>net value</Text>
      </View>
    </View>
  );
}

export default function PickScreen() {
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [foreign, setForeign] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PickResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = merchant.trim().length > 0 && parseFloat(amount) > 0;

  const submit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.pick(merchant.trim(), parseFloat(amount), foreign);
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Pick a Card</Text>
          <Text style={styles.subtitle}>Enter where you're shopping and we'll pick the best card.</Text>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.label}>Store / Merchant</Text>
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
              onSubmitEditing={submit}
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
              onPress={submit}
              disabled={!canSubmit || loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <>
                  <Ionicons name="flash" size={18} color={canSubmit ? colors.bg : colors.muted} />
                  <Text style={[styles.submitText, !canSubmit && { color: colors.muted }]}>
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
              {/* Best card hero */}
              <View style={[styles.bestCard, { backgroundColor: result.best.color || colors.card }]}>
                <View style={styles.bestHeader}>
                  <Text style={[styles.bestBadge, { color: result.best.text_color }]}>Best Pick</Text>
                  {result.uncertain && (
                    <View style={styles.uncertainChip}>
                      <Ionicons name="help-circle" size={13} color={colors.amber} />
                      <Text style={styles.uncertainText}>Low confidence</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.bestName, { color: result.best.text_color }]}>
                  {result.best.name}
                </Text>
                <Text style={[styles.bestRate, { color: result.best.text_color + "CC" }]}>
                  {result.best.rate_label}
                </Text>
                <View style={styles.bestValueRow}>
                  <Text style={[styles.bestValue, { color: colors.mint }]}>
                    +{usd(result.best.net_value)}
                  </Text>
                  <Text style={[styles.bestValueLabel, { color: result.best.text_color + "99" }]}>
                    net value
                  </Text>
                </View>
              </View>

              {/* Store */}
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

              {/* Why */}
              <View style={styles.reasonBox}>
                <Text style={styles.reasonText}>{result.reason}</Text>
              </View>

              {/* Ranked list */}
              <Text style={styles.rankedTitle}>All Cards Ranked</Text>
              {result.ranked.map((c, i) => (
                <RankedRow key={c.id} card={c} rank={i} />
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },

  title: { color: colors.text, fontSize: font.xxl, fontWeight: "800", marginBottom: spacing.xs },
  subtitle: { color: colors.muted, fontSize: font.sm, marginBottom: spacing.lg, lineHeight: 20 },

  form: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  label: { color: colors.muted, fontSize: font.xs, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: spacing.xs },
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

  result: { gap: spacing.md },

  bestCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  bestHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  bestBadge: { fontSize: font.xs, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", opacity: 0.7 },
  uncertainChip: { flexDirection: "row", alignItems: "center", gap: 3 },
  uncertainText: { color: colors.amber, fontSize: font.xs, fontWeight: "600" },
  bestName: { fontSize: font.xxl, fontWeight: "800" },
  bestRate: { fontSize: font.sm, marginTop: 2, marginBottom: spacing.md },
  bestValueRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs },
  bestValue: { fontSize: font.xl, fontWeight: "800" },
  bestValueLabel: { fontSize: font.sm },

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

  reasonBox: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.mint,
  },
  reasonText: { color: colors.text, fontSize: font.sm, lineHeight: 20 },

  rankedTitle: {
    color: colors.muted,
    fontSize: font.xs,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  rankedRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  rankedBest: { borderWidth: 1, borderColor: colors.mint + "44" },
  rankBadge: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  rankNum: { fontSize: font.xs, fontWeight: "800" },
  rankedInfo: { flex: 1 },
  rankedName: { fontSize: font.sm, fontWeight: "700" },
  rankedLabel: { color: colors.muted, fontSize: font.xs, marginTop: 2 },
  rankedValue: { alignItems: "flex-end" },
  netValue: { fontSize: font.md, fontWeight: "700" },
  rankedSub: { color: colors.muted, fontSize: font.xs },
});

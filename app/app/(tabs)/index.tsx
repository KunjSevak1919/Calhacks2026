import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, CardInfo, PaybackResponse, WalletResponse } from "../../api";
import CardTile from "../../components/CardTile";
import UsageBar from "../../components/UsageBar";
import { colors, spacing, radius, font } from "../../theme";

const usd = (n: number) => `$${n.toFixed(2)}`;

// ── Payback modal ─────────────────────────────────────────────────────────

function PaybackModal({
  card,
  onClose,
}: {
  card: CardInfo | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<PaybackResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!card) return;
    setData(null);
    setLoading(true);
    api
      .payback(card.id)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [card]);

  if (!card) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>{card.name}</Text>
        <Text style={styles.sheetSub}>Payback options for {usd(card.balance)}</Text>

        {loading && <ActivityIndicator color={colors.mint} style={{ marginTop: spacing.lg }} />}

        {data && (
          <View style={styles.paybackRows}>
            <View style={[styles.paybackCard, { borderColor: colors.mint + "55" }]}>
              <Text style={styles.paybackLabel}>Pay in Full</Text>
              <Text style={[styles.paybackAmt, { color: colors.mint }]}>
                {usd(data.pay_in_full)}
              </Text>
              <Text style={styles.paybackNote}>No interest. Best option.</Text>
            </View>

            <View style={[styles.paybackCard, { borderColor: colors.amber + "55" }]}>
              <Text style={styles.paybackLabel}>Minimum Payment</Text>
              <Text style={[styles.paybackAmt, { color: colors.amber }]}>
                {usd(data.minimum)}
              </Text>
              {data.months_minimum && data.interest_if_minimum != null && (
                <Text style={styles.paybackNote}>
                  {data.months_minimum} months · {usd(data.interest_if_minimum)} in interest
                </Text>
              )}
            </View>
          </View>
        )}

        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Wallet screen ─────────────────────────────────────────────────────────

export default function WalletScreen() {
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardInfo | null>(null);
  const [debtGuard, setDebtGuard] = useState(false);
  const [togglingGuard, setTogglingGuard] = useState(false);

  const load = useCallback(async () => {
    try {
      const w = await api.wallet();
      setWallet(w);
      setDebtGuard(w.settings.debt_guard);
    } catch {
      // server offline — keep stale data if any
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const toggleGuard = async () => {
    if (togglingGuard) return;
    setTogglingGuard(true);
    try {
      const res = await api.setSettings(!debtGuard);
      setDebtGuard(res.debt_guard);
    } catch {
      //
    } finally {
      setTogglingGuard(false);
    }
  };

  if (!wallet) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.mint} />
          <Text style={styles.loadingText}>Loading wallet…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const imp = wallet.impact;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.mint}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>My Wallet</Text>
            {wallet.source === "demo" && (
              <Text style={styles.demoTag}>DEMO DATA</Text>
            )}
          </View>
          <TouchableOpacity onPress={toggleGuard} style={styles.guardBtn}>
            <Ionicons
              name={debtGuard ? "shield" : "shield-outline"}
              size={20}
              color={debtGuard ? colors.mint : colors.muted}
            />
            <Text style={[styles.guardLabel, { color: debtGuard ? colors.mint : colors.muted }]}>
              Debt Guard
            </Text>
          </TouchableOpacity>
        </View>

        {/* Total balance summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Balance</Text>
          <Text style={styles.summaryAmt}>{usd(wallet.total_balance)}</Text>
          <Text style={styles.summaryLimit}>
            of {usd(wallet.total_limit)} total limit
          </Text>
          <View style={styles.usageWrap}>
            <UsageBar usage={wallet.usage} height={8} />
          </View>
          <Text style={styles.usagePct}>
            {(wallet.usage * 100).toFixed(0)}% utilization
          </Text>
        </View>

        {/* Impact row */}
        {(imp.rewards_this_month || imp.late_fees_avoided || imp.interest_avoided) ? (
          <View style={styles.impactRow}>
            {imp.rewards_this_month ? (
              <View style={styles.impactChip}>
                <Ionicons name="trending-up" size={14} color={colors.mint} />
                <Text style={[styles.impactAmt, { color: colors.mint }]}>
                  +{usd(imp.rewards_this_month)}
                </Text>
                <Text style={styles.impactLbl}>rewards</Text>
              </View>
            ) : null}
            {imp.late_fees_avoided ? (
              <View style={styles.impactChip}>
                <Ionicons name="checkmark-circle" size={14} color={colors.mint} />
                <Text style={[styles.impactAmt, { color: colors.mint }]}>
                  {usd(imp.late_fees_avoided)}
                </Text>
                <Text style={styles.impactLbl}>fees avoided</Text>
              </View>
            ) : null}
            {imp.interest_avoided ? (
              <View style={styles.impactChip}>
                <Ionicons name="shield-checkmark" size={14} color={colors.mint} />
                <Text style={[styles.impactAmt, { color: colors.mint }]}>
                  {usd(imp.interest_avoided)}
                </Text>
                <Text style={styles.impactLbl}>interest saved</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Cards */}
        <Text style={styles.sectionTitle}>Your Cards</Text>
        {wallet.cards.map((c) => (
          <CardTile key={c.id} card={c} onPress={() => setSelectedCard(c)} />
        ))}

        <Text style={styles.hint}>Tap a card for payback options</Text>
      </ScrollView>

      <PaybackModal card={selectedCard} onClose={() => setSelectedCard(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md },
  loadingText: { color: colors.muted, fontSize: font.md },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.lg,
  },
  greeting: { color: colors.text, fontSize: font.xxl, fontWeight: "800" },
  demoTag: {
    color: colors.amber,
    fontSize: font.xs,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 2,
  },
  guardBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  guardLabel: { fontSize: font.sm, fontWeight: "600" },

  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  summaryLabel: { color: colors.muted, fontSize: font.sm, marginBottom: spacing.xs },
  summaryAmt: {
    color: colors.text,
    fontSize: font.hero,
    fontWeight: "800",
    letterSpacing: -1,
  },
  summaryLimit: { color: colors.muted, fontSize: font.sm, marginTop: 2, marginBottom: spacing.md },
  usageWrap: { marginBottom: spacing.xs },
  usagePct: { color: colors.muted, fontSize: font.xs },

  impactRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  impactChip: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: "center",
    gap: 2,
  },
  impactAmt: { fontSize: font.md, fontWeight: "700" },
  impactLbl: { color: colors.muted, fontSize: font.xs },

  sectionTitle: {
    color: colors.muted,
    fontSize: font.sm,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: spacing.md,
  },
  hint: {
    color: colors.muted,
    fontSize: font.xs,
    textAlign: "center",
    marginTop: spacing.xs,
  },

  // Modal
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#00000088",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl + spacing.lg,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  sheetTitle: { color: colors.text, fontSize: font.xl, fontWeight: "700" },
  sheetSub: { color: colors.muted, fontSize: font.sm, marginBottom: spacing.lg },
  paybackRows: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  paybackCard: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
  },
  paybackLabel: { color: colors.muted, fontSize: font.xs, fontWeight: "600", marginBottom: spacing.xs },
  paybackAmt: { fontSize: font.xl, fontWeight: "800", marginBottom: 4 },
  paybackNote: { color: colors.muted, fontSize: font.xs },
  closeBtn: {
    backgroundColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
  },
  closeBtnText: { color: colors.text, fontSize: font.md, fontWeight: "600" },
});

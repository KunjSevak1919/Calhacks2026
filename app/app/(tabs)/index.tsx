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
  Switch,
  LayoutAnimation,
  UIManager,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, CardInfo, PaybackResponse, WalletResponse } from "../../api";
import UsageBar from "../../components/UsageBar";
import { colors, spacing, radius, font } from "../../theme";

// LayoutAnimation needs an Android flag in older RN; safe to call in newer
if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const usd = (n: number | undefined | null): string => {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
};

const STRIP_H = 72;   // height of a collapsed card (the visible "peek" strip)
const OVERLAP = 14;   // how many px each card slides under the one above

// ── Debt Guard row ────────────────────────────────────────────────────────

function DebtGuardRow({
  value,
  onToggle,
  loading,
}: {
  value: boolean;
  onToggle: () => void;
  loading: boolean;
}) {
  return (
    <View style={styles.guardRow}>
      <Ionicons
        name={value ? "shield" : "shield-outline"}
        size={22}
        color={value ? colors.mint : colors.muted}
        style={{ marginRight: spacing.sm }}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.guardTitle}>Debt Guard</Text>
        <Text style={styles.guardStatus} numberOfLines={1}>
          {value
            ? "On · picking for interest, not points"
            : "Off · paying in full"}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={colors.mint} />
      ) : (
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: colors.border, true: colors.mint + "55" }}
          thumbColor={value ? colors.mint : colors.muted}
        />
      )}
    </View>
  );
}

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
        {loading && (
          <ActivityIndicator color={colors.mint} style={{ marginTop: spacing.lg }} />
        )}
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
              {data.months_minimum != null && data.interest_if_minimum != null && (
                <Text style={styles.paybackNote}>
                  {data.months_minimum} months ·{" "}
                  {usd(data.interest_if_minimum)} in interest
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

// ── Single stacked card ───────────────────────────────────────────────────

function StackedCard({
  card,
  expanded,
  stackIndex,
  stackTotal,
  onPress,
  onPayback,
}: {
  card: CardInfo;
  expanded: boolean;
  stackIndex: number;
  stackTotal: number;
  onPress: () => void;
  onPayback: () => void;
}) {
  const bg = card.color || colors.card;
  const fg = card.text_color || "#ffffff";
  const daysUntilDue = card.due
    ? Math.ceil((new Date(card.due).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <View
      style={[
        styles.cardClip,
        // Clip to strip height when collapsed
        !expanded && { height: STRIP_H },
        // Cards 2-N slide under the card above them
        stackIndex > 0 && { marginTop: -OVERLAP },
        // Earlier cards sit on top visually
        { zIndex: stackTotal - stackIndex },
        // Lift expanded card with a stronger shadow
        expanded && { elevation: 8 },
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.88}
        style={[styles.cardContent, { backgroundColor: bg }]}
      >
        {/* ── Strip (always visible) ── */}
        <View style={styles.stripRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.stripName, { color: fg }]} numberOfLines={1}>
              {card.name}
            </Text>
            <Text style={[styles.stripLast4, { color: fg + "99" }]}>
              •••• {card.last4}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.stripBalance, { color: fg }]}>
              {usd(card.balance)}
            </Text>
            {daysUntilDue != null && (
              <Text
                style={[
                  styles.stripDue,
                  { color: daysUntilDue <= 7 ? colors.amber : fg + "88" },
                ]}
              >
                Due in {daysUntilDue}d
              </Text>
            )}
          </View>
        </View>

        {/* ── Expanded body ── */}
        <View style={styles.expandedBody}>
          <Text style={[styles.expandLimit, { color: fg + "99" }]}>
            of {usd(card.limit)} limit
          </Text>
          <View style={styles.expandBarWrap}>
            <UsageBar usage={card.usage} height={5} />
          </View>
          <View style={styles.expandMeta}>
            <Text style={[styles.expandMetaText, { color: fg + "BB" }]}>
              {(card.usage * 100).toFixed(0)}% used
            </Text>
            <Text style={[styles.expandMetaText, { color: fg + "BB" }]}>
              {card.apr.toFixed(1)}% APR
            </Text>
            {card.rewards_ytd > 0 && (
              <Text style={[styles.expandMetaText, { color: colors.mint }]}>
                +{usd(card.rewards_ytd)} rewards YTD
              </Text>
            )}
          </View>
          {card.usage_tip ? (
            <Text style={[styles.usageTip, { color: fg + "77" }]} numberOfLines={2}>
              {card.usage_tip}
            </Text>
          ) : null}
          <TouchableOpacity
            style={[styles.paybackTrigger, { borderColor: fg + "33" }]}
            onPress={(e) => {
              // Prevent the card's onPress from also firing
              e.stopPropagation?.();
              onPayback();
            }}
          >
            <Text style={[styles.paybackTriggerText, { color: fg + "DD" }]}>
              View payback plan
            </Text>
            <Ionicons name="chevron-forward" size={13} color={fg + "DD"} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ── Wallet screen ─────────────────────────────────────────────────────────

export default function WalletScreen() {
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Display order: IDs from top of stack to bottom
  const [displayOrder, setDisplayOrder] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardInfo | null>(null);
  const [debtGuard, setDebtGuard] = useState(false);
  const [togglingGuard, setTogglingGuard] = useState(false);

  const load = useCallback(async () => {
    try {
      const w = await api.wallet();
      setWallet(w);
      setDebtGuard(w.settings.debt_guard);
      // Preserve any user-reordered stack; only init if empty
      setDisplayOrder((prev) =>
        prev.length === 0 ? w.cards.map((c) => c.id) : prev
      );
    } catch {
      // server offline — keep stale data
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

  const toggleCard = useCallback(
    (id: string) => {
      LayoutAnimation.configureNext({
        duration: 380,
        create: {
          type: LayoutAnimation.Types.spring,
          property: LayoutAnimation.Properties.scaleXY,
          springDamping: 0.78,
        },
        update: {
          type: LayoutAnimation.Types.spring,
          springDamping: 0.78,
        },
        delete: {
          type: LayoutAnimation.Types.spring,
          property: LayoutAnimation.Properties.scaleXY,
          springDamping: 0.78,
        },
      });

      if (expandedId === id) {
        // Collapse — keep in current position
        setExpandedId(null);
      } else {
        // Expand and bring to top of stack
        setExpandedId(id);
        setDisplayOrder((prev) => [id, ...prev.filter((x) => x !== id)]);
      }
    },
    [expandedId]
  );

  // ── Render ──

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
  const cardMap = Object.fromEntries(wallet.cards.map((c) => [c.id, c]));
  const orderedCards = displayOrder
    .map((id) => cardMap[id])
    .filter(Boolean) as CardInfo[];

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
          <Text style={styles.greeting}>My Wallet</Text>
          {wallet.source === "demo" && (
            <Text style={styles.demoTag}>DEMO DATA</Text>
          )}
        </View>

        {/* Debt Guard — prominent switch near the top */}
        <DebtGuardRow
          value={debtGuard}
          onToggle={toggleGuard}
          loading={togglingGuard}
        />

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
        {(imp.rewards_this_month ||
          imp.late_fees_avoided ||
          imp.interest_avoided) ? (
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

        {/* Stacked cards */}
        <Text style={styles.sectionTitle}>Your Cards</Text>
        <View style={styles.stack}>
          {orderedCards.map((card, i) => (
            <StackedCard
              key={card.id}
              card={card}
              expanded={expandedId === card.id}
              stackIndex={i}
              stackTotal={orderedCards.length}
              onPress={() => toggleCard(card.id)}
              onPayback={() => setSelectedCard(card)}
            />
          ))}
        </View>
        <Text style={styles.hint}>
          Tap a card to expand · tap again to collapse
        </Text>
      </ScrollView>

      <PaybackModal
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl + spacing.lg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md },
  loadingText: { color: colors.muted, fontSize: font.md },

  header: { marginBottom: spacing.sm },
  greeting: { color: colors.text, fontSize: font.xxl, fontWeight: "800" },
  demoTag: {
    color: colors.amber,
    fontSize: font.xs,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 2,
  },

  // Debt Guard row
  guardRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  guardTitle: {
    color: colors.text,
    fontSize: font.md,
    fontWeight: "700",
  },
  guardStatus: {
    color: colors.muted,
    fontSize: font.xs,
    marginTop: 2,
  },

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
  summaryLimit: {
    color: colors.muted,
    fontSize: font.sm,
    marginTop: 2,
    marginBottom: spacing.md,
  },
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
    fontSize: font.xs,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: spacing.md,
  },
  hint: {
    color: colors.muted,
    fontSize: font.xs,
    textAlign: "center",
    marginTop: spacing.md,
  },

  // Card stack
  stack: {
    // overflow visible so shadows/elevations show
    overflow: "visible",
  },
  cardClip: {
    borderRadius: radius.xl,
    overflow: "hidden",
    // Shadow for depth (iOS)
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  cardContent: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },

  // Strip
  stripRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    minHeight: STRIP_H - spacing.lg * 2,
  },
  stripName: {
    fontSize: font.lg,
    fontWeight: "700",
    marginBottom: 3,
  },
  stripLast4: {
    fontSize: font.sm,
    fontWeight: "500",
  },
  stripBalance: {
    fontSize: font.xl,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  stripDue: {
    fontSize: font.xs,
    fontWeight: "600",
    marginTop: 3,
  },

  // Expanded body
  expandedBody: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.15)",
  },
  expandLimit: { fontSize: font.sm, marginBottom: spacing.xs },
  expandBarWrap: { marginBottom: spacing.sm },
  expandMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  expandMetaText: { fontSize: font.xs },
  usageTip: { fontSize: font.xs, lineHeight: 16, marginBottom: spacing.sm },

  paybackTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  paybackTriggerText: { fontSize: font.sm, fontWeight: "600" },

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
  paybackRows: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  paybackCard: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
  },
  paybackLabel: {
    color: colors.muted,
    fontSize: font.xs,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
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

import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import Animated, {
  FadeIn,
  useReducedMotion,
} from "react-native-reanimated";
import { api, type CardInfo, type PaybackResponse, type WalletResponse } from "../../api";
import { useTheme } from "../../ThemeContext";
import { font, type, spacing, radius, shadow } from "../../theme";
import CardStack from "../../components/CardStack";
import PaybackComparison from "../../components/PaybackComparison";
import DebtGuardSwitch from "../../components/DebtGuardSwitch";
import ImpactStrip, { type ImpactItem } from "../../components/ImpactStrip";
import Skeleton from "../../components/Skeleton";

// ── Greeting ──────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Payback Modal ─────────────────────────────────────────────────────────────

function PaybackModal({ card, onClose }: { card: CardInfo | null; onClose: () => void }) {
  const { colors } = useTheme();
  const [data, setData] = useState<PaybackResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!card) return;
    setData(null);
    setErr(null);
    setLoading(true);
    api.payback(card.id)
      .then(setData)
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [card?.id]);

  if (!card) return null;

  return (
    <Modal
      visible={!!card}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.modalSafe, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            {card.name} ••{card.last4}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.modalContent}>
          {/* Balance summary */}
          <View style={[styles.balanceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.balanceLabel, { color: colors.muted }]}>Current balance</Text>
            <Text style={[styles.balanceAmt, { color: colors.text }]}>
              ${card.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </Text>
            <Text style={[styles.balanceMeta, { color: colors.muted }]}>
              {card.apr}% APR
            </Text>
          </View>

          {/* Payback comparison */}
          {loading && (
            <View style={{ gap: spacing.sm }}>
              <Skeleton height={20} width="40%" />
              <Skeleton height={100} />
            </View>
          )}
          {err && (
            <Text style={[styles.errText, { color: colors.error }]}>{err}</Text>
          )}
          {data && <PaybackComparison data={data} />}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Skeleton loading state ────────────────────────────────────────────────────

function WalletSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      <Skeleton height={188} borderRadius={radius.xl} />
      <View style={{ gap: spacing.sm }}>
        <Skeleton height={18} width="50%" />
        <Skeleton height={88} borderRadius={radius.lg} />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={72} borderRadius={radius.lg} style={{ flex: 1 }} />
        ))}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function WalletScreen() {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>(undefined);
  const [paybackCard, setPaybackCard] = useState<CardInfo | null>(null);
  const [guardLoading, setGuardLoading] = useState(false);
  const [dataBadge, setDataBadge] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, health] = await Promise.all([
        api.wallet(),
        fetch(`${require("../../config").SERVER_URL}/health`).then((r) => r.json()).catch(() => null),
      ]);
      setWallet(w);
      setLoadError(null);
      if (health?.data_source === "nessie") {
        setDataBadge("Live · Capital One Nessie");
      } else {
        setDataBadge(null);
      }
    } catch (e) {
      setLoadError(String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const toggleDebtGuard = useCallback(async () => {
    if (!wallet || guardLoading) return;
    const next = !wallet.settings.debt_guard;
    setGuardLoading(true);
    try {
      await api.setSettings(next);
      setWallet((w) => w ? { ...w, settings: { debt_guard: next } } : w);
    } catch {
      // revert
    } finally {
      setGuardLoading(false);
    }
  }, [wallet, guardLoading]);

  const impactItems: ImpactItem[] = wallet
    ? [
        { id: "rewards", amount: wallet.impact.rewards_this_month ?? 0, label: "Rewards this month" },
        { id: "interest", amount: wallet.impact.interest_avoided ?? 0, label: "Interest avoided" },
        { id: "fees", amount: wallet.impact.late_fees_avoided ?? 0, label: "Late fees avoided" },
      ].filter((i) => i.amount > 0)
    : [];

  // Error state
  if (!wallet && loadError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.errorWrap}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>Can't reach the server</Text>
          <Text style={[styles.errorSub, { color: colors.muted }]}>{loadError}</Text>
          <Pressable
            onPress={load}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            accessibilityLabel="Retry"
          >
            <Text style={[styles.retryText, { color: colors.onPrimary }]}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.muted}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.text }]}>{greeting()}</Text>
            {dataBadge && (
              <View style={[styles.dataBadge, { backgroundColor: colors.goodFill }]}>
                <Ionicons name="radio-button-on" size={8} color={colors.good} />
                <Text style={[styles.dataBadgeText, { color: colors.good }]}>{dataBadge}</Text>
              </View>
            )}
          </View>
        </View>

        {!wallet ? (
          <WalletSkeleton />
        ) : (
          <Animated.View
            entering={reduceMotion ? undefined : FadeIn.duration(300)}
            style={{ gap: spacing.lg }}
          >
            {/* Card stack */}
            <CardStack
              cards={wallet.cards}
              expanded={expanded}
              selectedCardId={selectedCardId}
              onCardPress={(card) => {
                setSelectedCardId(card.id);
                setPaybackCard(card);
              }}
              onToggle={() => setExpanded((e) => !e)}
            />

            {/* Summary row */}
            <View style={[styles.summaryRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: colors.text }]}>
                  ${Math.round(wallet.total_balance).toLocaleString("en-US")}
                </Text>
                <Text style={[styles.summaryLabel, { color: colors.muted }]}>Total balance</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: colors.text }]}>
                  {(wallet.usage * 100).toFixed(0)}%
                </Text>
                <Text style={[styles.summaryLabel, { color: colors.muted }]}>Utilization</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: colors.text }]}>
                  ${Math.round(wallet.total_limit).toLocaleString("en-US")}
                </Text>
                <Text style={[styles.summaryLabel, { color: colors.muted }]}>Total limit</Text>
              </View>
            </View>

            {/* Impact strip — only if there's something to show */}
            {impactItems.length > 0 && (
              <ImpactStrip title="Money kept" items={impactItems} />
            )}

            {/* Debt Guard */}
            <DebtGuardSwitch
              value={wallet.settings.debt_guard}
              onValueChange={toggleDebtGuard}
              explainer={
                wallet.settings.debt_guard
                  ? "Routing to low-APR cards to reduce interest."
                  : "Routing for max rewards. Carrying a balance? Turn this on."
              }
            />

            {/* Data source footer */}
            <Text style={[styles.source, { color: colors.muted }]}>
              Source: {wallet.source}
            </Text>
          </Animated.View>
        )}
      </ScrollView>

      {/* Payback modal */}
      <PaybackModal card={paybackCard} onClose={() => setPaybackCard(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 48 },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  greeting: { fontSize: font.screen, fontFamily: type.uiBold },
  dataBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    alignSelf: "flex-start",
  },
  dataBadgeText: { fontSize: font.label, fontFamily: type.uiSemi },

  // Summary row
  summaryRow: {
    flexDirection: "row",
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    ...shadow.soft,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryValue: { fontSize: font.title, fontFamily: type.monoBold },
  summaryLabel: { fontSize: font.label, fontFamily: type.uiMedium, marginTop: 2 },
  summaryDivider: { width: 1, marginVertical: 4 },

  // Footer
  source: { fontSize: font.label, fontFamily: type.uiMedium, textAlign: "center" },

  // Error
  errorWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xxl, gap: spacing.lg },
  errorTitle: { fontSize: font.title, fontFamily: type.uiBold },
  errorSub: { fontSize: font.body, fontFamily: type.uiMedium, textAlign: "center" },
  retryBtn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md, minHeight: 44, justifyContent: "center" },
  retryText: { fontSize: font.body, fontFamily: type.uiBold },

  // Modal
  modalSafe: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: font.title, fontFamily: type.uiBold },
  modalContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 48 },
  balanceCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    ...shadow.soft,
  },
  balanceLabel: { fontSize: font.label, fontFamily: type.uiMedium },
  balanceAmt: { fontSize: font.hero, fontFamily: type.monoBold, marginTop: 2 },
  balanceMeta: { fontSize: font.label, fontFamily: type.uiMedium, marginTop: spacing.xs },
  errText: { fontSize: font.body, fontFamily: type.uiMedium },
});

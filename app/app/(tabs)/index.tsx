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
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import Animated, {
  FadeIn,
  useReducedMotion,
} from "react-native-reanimated";
import { api, type CardInfo, type PaybackResponse, type WalletResponse } from "../../api";
import { useTheme } from "../../ThemeContext";
import { font, type, spacing, radius, shadow } from "../../theme";
import { useLayout } from "../../hooks/useLayout";
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
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            {card.name} ••{card.last4}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <View style={[styles.balanceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.balanceLabel, { color: colors.muted }]}>Current balance</Text>
            <Text style={[styles.balanceAmt, { color: colors.text }]}>
              ${card.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </Text>
            <Text style={[styles.balanceMeta, { color: colors.muted }]}>{card.apr}% APR</Text>
          </View>
          {loading && (
            <View style={{ gap: spacing.sm }}>
              <Skeleton height={20} width="40%" />
              <Skeleton height={100} />
            </View>
          )}
          {err && <Text style={[styles.errText, { color: colors.error }]}>{err}</Text>}
          {data && <PaybackComparison data={data} />}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function WalletSkeleton() {
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
  const { isDesktop } = useLayout();

  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>(undefined);
  const [paybackCard, setPaybackCard] = useState<CardInfo | null>(null);
  const [guardLoading, setGuardLoading] = useState(false);
  const [dataBadge, setDataBadge] = useState<string | null>(null);
  const [nextDue, setNextDue] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, health] = await Promise.all([
        api.wallet(),
        fetch(`${require("../../config").SERVER_URL}/health`).then((r) => r.json()).catch(() => null),
      ]);
      setWallet(w);
      setLoadError(null);
      if (health?.data_source === "nessie") {
        setDataBadge("Live data · Capital One Nessie");
      } else {
        setDataBadge("Demo data");
      }
      // Find next due card
      const upcoming = w.cards
        .filter((c) => c.due)
        .sort((a, b) => new Date(a.due!).getTime() - new Date(b.due!).getTime());
      if (upcoming.length > 0) {
        const c = upcoming[0];
        const due = new Date(c.due!).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        setNextDue(`${c.name}, ${due}`);
      }
    } catch (e) {
      setLoadError(String(e));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
        { id: "rewards", amount: wallet.impact.rewards_this_month ?? 0, label: "Rewards earned" },
        { id: "interest", amount: wallet.impact.interest_avoided ?? 0, label: "Interest avoided" },
        { id: "fees", amount: wallet.impact.late_fees_avoided ?? 0, label: "Late fees avoided" },
      ].filter((i) => i.amount > 0)
    : [];

  if (!wallet && loadError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.errorWrap}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>Can't reach the server</Text>
          <Text style={[styles.errorSub, { color: colors.muted }]}>{loadError}</Text>
          <Pressable onPress={load} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryText, { color: colors.onPrimary }]}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Reusable content blocks ──────────────────────────────────────────────────

  const headerEl = (
    <View style={styles.header}>
      <LinearGradient
        colors={["#0E7A58", "#07402F"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.avatar}
      >
        <Text style={styles.avatarInitial}>K</Text>
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={[styles.hi, { color: colors.muted }]}>{greeting()}</Text>
      </View>
      <Pressable
        onPress={load}
        accessibilityLabel="Refresh"
        style={[styles.bellBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Ionicons name="notifications-outline" size={20} color={colors.text} />
      </Pressable>
    </View>
  );

  const chipsEl = (
    <View style={styles.chipsRow}>
      {dataBadge && (
        <View style={[
          styles.chip,
          { backgroundColor: dataBadge.startsWith("Live") ? colors.goodFill : colors.surfaceSubtle,
            borderColor: dataBadge.startsWith("Live") ? colors.good + "44" : colors.border },
        ]}>
          {dataBadge.startsWith("Live") && (
            <View style={[styles.dot, { backgroundColor: colors.good }]} />
          )}
          <Text style={[styles.chipText, {
            color: dataBadge.startsWith("Live") ? colors.good : colors.muted,
          }]}>
            {dataBadge}
          </Text>
        </View>
      )}
      {nextDue && (
        <View style={[styles.chip, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
          <Ionicons name="time-outline" size={13} color={colors.muted} />
          <Text style={[styles.chipText, { color: colors.muted }]}>Next due · {nextDue}</Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <ScrollView
        contentContainerStyle={isDesktop ? styles.scrollDesktop : styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        showsVerticalScrollIndicator={false}
      >
        {isDesktop ? (
          // ── Desktop layout ────────────────────────────────────────────────────
          <View style={styles.desktopWrap}>
            {headerEl}
            {chipsEl}
            {!wallet ? (
              <WalletSkeleton />
            ) : (
              <Animated.View
                entering={reduceMotion ? undefined : FadeIn.duration(300)}
                style={styles.desktopColumns}
              >
                {/* Left: card stack constrained to 430 so cards never stretch */}
                <View style={styles.desktopLeft}>
                  <View style={styles.cardsHeading}>
                    <Text style={[styles.cardsTitle, { color: colors.text }]}>Your cards</Text>
                    <Text style={[styles.cardsTotals, { color: colors.muted }]}>
                      ${Math.round(wallet.total_balance).toLocaleString("en-US")} of ${Math.round(wallet.total_limit).toLocaleString("en-US")} · {(wallet.usage * 100).toFixed(0)}% used
                    </Text>
                  </View>
                  {/* Width-clamped wrapper fixes card alignment on web */}
                  <View style={styles.stackWrap}>
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
                  </View>
                  <Text style={[styles.caption, { color: colors.muted }]}>
                    {expanded ? "Tap a card to see payback · tap background to collapse" : "Tap the stack to fan out all cards"}
                  </Text>
                </View>

                {/* Right: impact + debt guard */}
                <View style={styles.desktopRight}>
                  {impactItems.length > 0 && (
                    <ImpactStrip title="Money kept this month" items={impactItems} />
                  )}
                  <DebtGuardSwitch
                    value={wallet.settings.debt_guard}
                    onValueChange={toggleDebtGuard}
                    explainer={
                      wallet.settings.debt_guard
                        ? "On when you carry a balance: picks the card that costs you least, not the one with the most points."
                        : "Routing for max rewards. Carrying a balance? Turn this on."
                    }
                  />
                  <Text style={[styles.source, { color: colors.muted }]}>Source: {wallet.source}</Text>
                </View>
              </Animated.View>
            )}
          </View>
        ) : (
          // ── Mobile layout (identical to original) ─────────────────────────────
          <>
            {headerEl}
            {chipsEl}
            {!wallet ? (
              <WalletSkeleton />
            ) : (
              <Animated.View
                entering={reduceMotion ? undefined : FadeIn.duration(300)}
                style={{ gap: spacing.lg }}
              >
                {impactItems.length > 0 && (
                  <ImpactStrip title="Money kept this month" items={impactItems} />
                )}
                <View style={styles.cardsHeading}>
                  <Text style={[styles.cardsTitle, { color: colors.text }]}>Your cards</Text>
                  <Text style={[styles.cardsTotals, { color: colors.muted }]}>
                    ${Math.round(wallet.total_balance).toLocaleString("en-US")} of ${Math.round(wallet.total_limit).toLocaleString("en-US")} · {(wallet.usage * 100).toFixed(0)}% used
                  </Text>
                </View>
                {/* stackWrap also fixes the Zero Intro width issue on mobile web */}
                <View style={styles.stackWrap}>
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
                </View>
                <Text style={[styles.caption, { color: colors.muted }]}>
                  {expanded ? "Tap a card to see payback · tap background to collapse" : "Tap the stack to fan out all cards"}
                </Text>
                <DebtGuardSwitch
                  value={wallet.settings.debt_guard}
                  onValueChange={toggleDebtGuard}
                  explainer={
                    wallet.settings.debt_guard
                      ? "On when you carry a balance: picks the card that costs you least, not the one with the most points."
                      : "Routing for max rewards. Carrying a balance? Turn this on."
                  }
                />
                <Text style={[styles.source, { color: colors.muted }]}>Source: {wallet.source}</Text>
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>

      <PaybackModal card={paybackCard} onClose={() => setPaybackCard(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 96 },

  // Desktop
  scrollDesktop: { paddingBottom: 96, alignItems: "center" },
  desktopWrap: { maxWidth: 1120, width: "100%", paddingHorizontal: 40, gap: spacing.lg },
  desktopColumns: { flexDirection: "row", gap: 32, alignItems: "flex-start" },
  desktopLeft: { flex: 1, maxWidth: 430, gap: spacing.lg },
  desktopRight: { flex: 1, gap: spacing.lg },

  // CardStack wrapper — ensures all absolute-positioned cards share the same
  // parent width on web, fixing the Zero Intro card being wider/shifted.
  stackWrap: { alignSelf: "stretch", width: "100%" },

  // Header
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarInitial: {
    color: "#E6F7EE",
    fontSize: 17,
    fontFamily: type.uiBold,
  },
  hi: { fontSize: 21, fontFamily: type.uiBold, letterSpacing: -0.02 * 21, lineHeight: 1.15 * 21 },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },

  // Chips row
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    minHeight: 32,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  chipText: { fontSize: 12.5, fontFamily: type.uiBold },

  // Cards section
  cardsHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  cardsTitle: { fontSize: font.title, fontFamily: type.uiBold },
  cardsTotals: { fontSize: 13, fontFamily: type.uiBold, fontVariant: ["tabular-nums"] },
  caption: { fontSize: 12.5, fontFamily: type.uiBold, textAlign: "center" },

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
  balanceCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, ...shadow.soft },
  balanceLabel: { fontSize: font.label, fontFamily: type.uiMedium },
  balanceAmt: { fontSize: font.hero, fontFamily: type.monoBold, marginTop: 2, fontVariant: ["tabular-nums"] },
  balanceMeta: { fontSize: font.label, fontFamily: type.uiMedium, marginTop: spacing.xs },
  errText: { fontSize: font.body, fontFamily: type.uiMedium },
});

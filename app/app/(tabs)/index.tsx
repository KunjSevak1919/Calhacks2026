import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Modal,
  TouchableOpacity,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import Animated, {
  FadeIn,
  LinearTransition,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { api, CardInfo, PaybackResponse, WalletResponse } from "../../api";
import UsageBar from "../../components/UsageBar";
import PressScale from "../../components/PressScale";
import Skeleton from "../../components/Skeleton";
import MoneyText from "../../components/MoneyText";
import { usd, pct } from "../../format";
import { lightTap } from "../../haptics";
import { colors, spacing, radius, font, type, shadow, hit } from "../../theme";

const STRIP_H = 92;
const EXPANDED_EXTRA = 168;
const OVERLAP = 28;

function layoutAnim(reduce: boolean) {
  return reduce
    ? LinearTransition.duration(0)
    : LinearTransition.springify().damping(18).stiffness(170).mass(0.7);
}

// ── Debt Guard ────────────────────────────────────────────────────────────

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
      <View style={[styles.guardIcon, value ? styles.guardIconOn : styles.guardIconOff]}>
        <Ionicons
          name={value ? "shield-checkmark" : "shield-outline"}
          size={18}
          color={value ? colors.good : colors.muted}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.guardTitle}>Debt Guard</Text>
        <Text style={styles.guardStatus} numberOfLines={1}>
          {value ? "On · picking for interest, not points" : "Off · paying in full"}
        </Text>
      </View>
      <View style={styles.switchHit}>
        <Switch
          value={value}
          onValueChange={onToggle}
          disabled={loading}
          accessibilityLabel="Debt Guard"
          accessibilityState={{ checked: value, busy: loading }}
          trackColor={{ false: colors.border, true: colors.good }}
          thumbColor={colors.surface}
          ios_backgroundColor={colors.border}
        />
      </View>
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
          <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
            <Skeleton height={96} />
            <Skeleton height={96} />
          </View>
        )}
        {data && (
          <View style={styles.paybackRows}>
            <View style={[styles.paybackCard, { backgroundColor: colors.goodFill }]}>
              <View style={styles.paybackHead}>
                <Ionicons name="checkmark-circle" size={16} color={colors.good} />
                <Text style={[styles.paybackLabel, { color: colors.good }]}>Pay in full</Text>
              </View>
              <Text style={[styles.paybackAmt, { color: colors.good }]}>
                {usd(data.pay_in_full)}
              </Text>
              <Text style={styles.paybackNote}>No interest. Best option.</Text>
            </View>
            <View style={[styles.paybackCard, { backgroundColor: colors.warnFill }]}>
              <View style={styles.paybackHead}>
                <Ionicons name="alert-circle" size={16} color={colors.warn} />
                <Text style={[styles.paybackLabel, { color: colors.warn }]}>Minimum payment</Text>
              </View>
              <Text style={[styles.paybackAmt, { color: colors.warn }]}>
                {usd(data.minimum)}
              </Text>
              {data.months_minimum != null && data.interest_if_minimum != null && (
                <Text style={styles.paybackNote}>
                  {data.months_minimum} months · {usd(data.interest_if_minimum)} in interest
                </Text>
              )}
            </View>
          </View>
        )}
        <PressScale onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
          <Text style={styles.closeBtnText}>Close</Text>
        </PressScale>
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
  const reduce = useReducedMotion();
  const bg = card.color || colors.primary;
  const fg = card.text_color || colors.onPrimary;
  const daysUntilDue = card.due
    ? Math.ceil((new Date(card.due).getTime() - Date.now()) / 86_400_000)
    : null;

  const expandedSV = useSharedValue(expanded ? 1 : 0);
  const indexSV = useSharedValue(stackIndex);

  useEffect(() => {
    expandedSV.value = reduce
      ? expanded
        ? 1
        : 0
      : withSpring(expanded ? 1 : 0, { damping: 16, stiffness: 180, mass: 0.65 });
  }, [expanded, reduce, expandedSV]);

  useEffect(() => {
    indexSV.value = reduce
      ? stackIndex
      : withSpring(stackIndex, { damping: 16, stiffness: 180, mass: 0.65 });
  }, [stackIndex, reduce, indexSV]);

  const motion = useAnimatedStyle(() => {
    const t = expandedSV.value;
    const i = indexSV.value;
    return {
      height: STRIP_H + t * EXPANDED_EXTRA,
      transform: [
        {
          scale: interpolate(i, [0, 1, Math.max(stackTotal - 1, 1)], [1, 0.97, 0.94]),
        },
      ],
    };
  });

  const dueSoon = daysUntilDue != null && daysUntilDue <= 7;

  return (
    <Animated.View
      layout={layoutAnim(reduce)}
      style={[
        styles.cardLift,
        stackIndex > 0 && { marginTop: -OVERLAP },
        { zIndex: stackTotal - stackIndex },
      ]}
    >
      <Animated.View style={[styles.cardClip, motion]}>
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.92}
          accessibilityRole="button"
          accessibilityLabel={`${card.name}, ${usd(card.balance)}`}
          style={[styles.cardContent, { backgroundColor: bg, minHeight: hit.min }]}
        >
          <View style={styles.stripRow}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={[styles.stripName, { color: fg }]} numberOfLines={1}>
                {card.name}
              </Text>
              <Text style={[styles.stripLast4, { color: fg, opacity: 0.72 }]}>
                •••• {card.last4}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.stripBalance, { color: fg }]}>{usd(card.balance)}</Text>
              {daysUntilDue != null && (
                <View style={styles.dueRow}>
                  <Ionicons
                    name={dueSoon ? "time" : "calendar-outline"}
                    size={12}
                    color={dueSoon ? colors.warnFill : fg}
                  />
                  <Text
                    style={[
                      styles.stripDue,
                      { color: dueSoon ? colors.warnFill : fg, opacity: dueSoon ? 1 : 0.72 },
                    ]}
                  >
                    Due in {daysUntilDue}d
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.expandedBody}>
            <Text style={[styles.expandLimit, { color: fg, opacity: 0.72 }]}>
              of {usd(card.limit)} limit
            </Text>
            <View style={styles.expandBarWrap}>
              <UsageBar usage={card.usage} height={5} trackColor="rgba(255,255,255,0.28)" />
            </View>
            <View style={styles.expandMeta}>
              <Text style={[styles.expandMetaText, { color: fg, opacity: 0.8 }]}>
                {pct(card.usage)} used
              </Text>
              <Text style={[styles.expandMetaText, { color: fg, opacity: 0.8 }]}>
                {card.apr.toFixed(1)}% APR
              </Text>
              {card.rewards_ytd > 0 && (
                <Text style={[styles.expandMetaText, { color: colors.goodFill }]}>
                  +{usd(card.rewards_ytd)} rewards YTD
                </Text>
              )}
            </View>
            {card.usage_tip ? (
              <Text style={[styles.usageTip, { color: fg, opacity: 0.7 }]} numberOfLines={2}>
                {card.usage_tip}
              </Text>
            ) : null}
            <PressScale
              style={[styles.paybackTrigger, { borderColor: "rgba(255,255,255,0.28)" }]}
              onPress={(e) => {
                e.stopPropagation?.();
                onPayback();
              }}
              accessibilityLabel="View payback plan"
            >
              <Text style={[styles.paybackTriggerText, { color: fg }]}>View payback plan</Text>
              <Ionicons name="chevron-forward" size={13} color={fg} />
            </PressScale>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

function WalletSkeleton() {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.scroll}>
        <Skeleton height={22} width="40%" r={8} />
        <View style={[styles.summaryCard, { marginTop: spacing.lg }]}>
          <Skeleton height={13} width="30%" r={6} />
          <Skeleton height={36} width="55%" r={8} style={{ marginTop: spacing.md }} />
          <Skeleton height={8} style={{ marginTop: spacing.lg }} />
        </View>
        <View style={styles.impactRow}>
          <Skeleton height={88} r={radius.xl} style={{ flex: 1 }} />
          <Skeleton height={88} r={radius.xl} style={{ flex: 1 }} />
          <Skeleton height={88} r={radius.xl} style={{ flex: 1 }} />
        </View>
        <Skeleton height={72} r={radius.xl} />
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Skeleton height={STRIP_H} r={radius.xl} />
          <Skeleton height={STRIP_H} r={radius.xl} />
          <Skeleton height={STRIP_H} r={radius.xl} />
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── Wallet screen ─────────────────────────────────────────────────────────

export default function WalletScreen() {
  const reduce = useReducedMotion();
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [displayOrder, setDisplayOrder] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardInfo | null>(null);
  const [debtGuard, setDebtGuard] = useState(false);
  const [togglingGuard, setTogglingGuard] = useState(false);
  const [countKey, setCountKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const w = await api.wallet();
      setWallet(w);
      setDebtGuard(w.settings.debt_guard);
      setDisplayOrder((prev) => (prev.length === 0 ? w.cards.map((c) => c.id) : prev));
    } catch {
      // server offline — keep stale data
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      setCountKey((k) => k + 1);
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const toggleGuard = async () => {
    if (togglingGuard) return;
    lightTap();
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
      if (expandedId === id) {
        setExpandedId(null);
      } else {
        setExpandedId(id);
        setDisplayOrder((prev) => [id, ...prev.filter((x) => x !== id)]);
      }
    },
    [expandedId]
  );

  if (!wallet) {
    return <WalletSkeleton />;
  }

  const imp = wallet.impact;
  const cardMap = Object.fromEntries(wallet.cards.map((c) => [c.id, c]));
  const orderedCards = displayOrder.map((id) => cardMap[id]).filter(Boolean) as CardInfo[];
  const feeCards = wallet.cards.filter((c) => c.annual_fee > 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.good}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>My wallet</Text>
          {wallet.source === "demo" && (
            <View style={styles.demoPill}>
              <Text style={styles.demoTag}>Demo data</Text>
            </View>
          )}
        </View>

        <Animated.View
          style={styles.summaryCard}
          entering={reduce ? undefined : FadeIn.duration(400)}
        >
          <Text style={styles.summaryLabel}>Total balance</Text>
          <MoneyText
            key={`bal-${countKey}`}
            value={wallet.total_balance}
            countUp
            style={styles.summaryAmt}
          />
          <Text style={styles.summaryLimit}>of {usd(wallet.total_limit)} total limit</Text>
          <View style={styles.usageWrap}>
            <UsageBar usage={wallet.usage} height={8} />
          </View>
          <Text style={styles.usagePct}>{pct(wallet.usage)} utilization</Text>
        </Animated.View>

        {imp.rewards_this_month || imp.late_fees_avoided || imp.interest_avoided ? (
          <View style={styles.impactRow}>
            {imp.rewards_this_month ? (
              <View style={styles.impactChip}>
                <Ionicons name="trending-up" size={16} color={colors.good} />
                <MoneyText
                  key={`r-${countKey}`}
                  value={imp.rewards_this_month}
                  countUp
                  prefix="+"
                  style={styles.impactAmt}
                />
                <Text style={styles.impactLbl}>Rewards</Text>
              </View>
            ) : null}
            {imp.late_fees_avoided ? (
              <View style={styles.impactChip}>
                <Ionicons name="checkmark-circle" size={16} color={colors.good} />
                <MoneyText
                  key={`f-${countKey}`}
                  value={imp.late_fees_avoided}
                  countUp
                  style={styles.impactAmt}
                />
                <Text style={styles.impactLbl}>Fees avoided</Text>
              </View>
            ) : null}
            {imp.interest_avoided ? (
              <View style={styles.impactChip}>
                <Ionicons name="shield-checkmark" size={16} color={colors.good} />
                <MoneyText
                  key={`i-${countKey}`}
                  value={imp.interest_avoided}
                  countUp
                  style={styles.impactAmt}
                />
                <Text style={styles.impactLbl}>Interest saved</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <DebtGuardRow value={debtGuard} onToggle={toggleGuard} loading={togglingGuard} />

        <Text style={styles.sectionTitle}>Your cards</Text>
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
        <Text style={styles.hint}>Tap a card to expand · tap again to collapse</Text>

        {feeCards.length > 0 ? (
          <View style={styles.feeCard}>
            <View style={styles.feeHead}>
              <Ionicons name="calendar-outline" size={16} color={colors.warn} />
              <Text style={styles.feeTitle}>Annual fee</Text>
            </View>
            {feeCards.map((c) => (
              <View key={c.id} style={styles.feeRow}>
                <Text style={styles.feeName}>{c.name}</Text>
                <Text style={styles.feeAmt}>{usd(c.annual_fee)} / year</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <PaybackModal card={selectedCard} onClose={() => setSelectedCard(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl + spacing.lg },

  header: {
    marginBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: hit.min,
  },
  greeting: {
    color: colors.text,
    fontSize: font.screen,
    fontFamily: type.uiBold,
  },
  demoPill: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: hit.min,
    justifyContent: "center",
  },
  demoTag: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.uiMedium,
  },

  guardRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.soft,
  },
  guardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  guardIconOn: { backgroundColor: colors.goodFill },
  guardIconOff: { backgroundColor: colors.surfaceSubtle },
  guardTitle: {
    color: colors.text,
    fontSize: font.title,
    fontFamily: type.uiSemi,
  },
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

  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.soft,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.uiMedium,
    marginBottom: spacing.xs,
  },
  summaryAmt: {
    color: colors.text,
    fontSize: font.hero,
    fontFamily: type.monoBold,
    letterSpacing: -0.8,
  },
  summaryLimit: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.ui,
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  usageWrap: { marginBottom: spacing.xs },
  usagePct: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.mono,
  },

  impactRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  impactChip: {
    flex: 1,
    backgroundColor: colors.goodFill,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: 4,
    minHeight: 88,
  },
  impactAmt: {
    fontSize: font.body,
    fontFamily: type.monoBold,
    color: colors.good,
  },
  impactLbl: {
    color: colors.good,
    fontSize: font.label,
    fontFamily: type.uiMedium,
    textAlign: "center",
  },

  sectionTitle: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.uiMedium,
    marginBottom: spacing.md,
  },
  hint: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.ui,
    textAlign: "center",
    marginTop: spacing.lg,
  },

  stack: {
    overflow: "visible",
  },
  cardLift: {
    ...shadow.stack,
  },
  cardClip: {
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  cardContent: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },

  stripRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    minHeight: STRIP_H - spacing.lg * 2,
  },
  stripName: {
    fontSize: font.title,
    fontFamily: type.uiSemi,
    marginBottom: 3,
  },
  stripLast4: {
    fontSize: font.label,
    fontFamily: type.mono,
  },
  stripBalance: {
    fontSize: font.title,
    fontFamily: type.monoBold,
    letterSpacing: -0.4,
  },
  dueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  stripDue: {
    fontSize: font.label,
    fontFamily: type.uiMedium,
  },

  expandedBody: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  expandLimit: { fontSize: font.label, fontFamily: type.ui, marginBottom: spacing.xs },
  expandBarWrap: { marginBottom: spacing.sm },
  expandMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  expandMetaText: { fontSize: font.label, fontFamily: type.mono },
  usageTip: { fontSize: font.label, fontFamily: type.ui, lineHeight: 18, marginBottom: spacing.sm },

  paybackTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
    minHeight: hit.min,
  },
  paybackTriggerText: { fontSize: font.body, fontFamily: type.uiSemi },

  feeCard: {
    backgroundColor: colors.warnFill,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  feeHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  feeTitle: {
    color: colors.warn,
    fontSize: font.title,
    fontFamily: type.uiSemi,
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: hit.min,
  },
  feeName: {
    color: colors.text,
    fontSize: font.body,
    fontFamily: type.uiMedium,
  },
  feeAmt: {
    color: colors.warn,
    fontSize: font.body,
    fontFamily: type.monoSemi,
  },

  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl + spacing.lg,
    ...shadow.soft,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: font.screen,
    fontFamily: type.uiBold,
  },
  sheetSub: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.ui,
    marginBottom: spacing.lg,
  },
  paybackRows: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  paybackCard: {
    flex: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  paybackHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: spacing.sm,
  },
  paybackLabel: {
    fontSize: font.label,
    fontFamily: type.uiSemi,
  },
  paybackAmt: {
    fontSize: font.title,
    fontFamily: type.monoBold,
    marginBottom: 4,
  },
  paybackNote: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.ui,
  },
  closeBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "center",
    minHeight: hit.min,
    justifyContent: "center",
  },
  closeBtnText: {
    color: colors.onPrimary,
    fontSize: font.body,
    fontFamily: type.uiSemi,
  },
});

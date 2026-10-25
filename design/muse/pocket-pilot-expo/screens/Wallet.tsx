import React, { memo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { CreditCardData, MoneyKeptItem, Totals } from '../types';
import { formatMoneyWhole } from '../types';
import CardStack from '../components/CardStack';
import DebtGuardSwitch from '../components/DebtGuardSwitch';
import ImpactStrip from '../components/ImpactStrip';
import PrimaryButton from '../components/PrimaryButton';
import Skeleton from '../components/Skeleton';
import UsageBar from '../components/UsageBar';

export type WalletScreenProps = {
  /** Full greeting, e.g. "Good afternoon, Kirtan". */
  greeting: string;
  cards: CreditCardData[];
  totals: Totals;
  moneyKept: MoneyKeptItem[];
  debtGuard: boolean;
  onDebtGuardChange: (value: boolean) => void;
  nextDue: { cardName: string; date: string };
  onSelectCard?: (card: CreditCardData) => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};

function WalletScreen({
  greeting,
  cards,
  totals,
  moneyKept,
  debtGuard,
  onDebtGuardChange,
  nextDue,
  onSelectCard,
  loading,
  error,
  onRetry,
}: WalletScreenProps) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>(undefined);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: theme.spacing.lg,
      paddingBottom: theme.spacing.xxxl,
      gap: theme.spacing.lg,
    },
    greeting: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.title,
      fontWeight: theme.fontWeight.extrabold,
      lineHeight: theme.lineHeight.title,
    },
    tagline: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.bodySmall,
      marginTop: theme.spacing.xs,
    },
    totals: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.heading,
      fontWeight: theme.fontWeight.extrabold,
      lineHeight: theme.lineHeight.heading,
      fontVariant: ['tabular-nums'],
    },
    totalsLabel: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.bodySmall,
      marginTop: theme.spacing.xs,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.bold,
      lineHeight: theme.lineHeight.bodySmall,
      marginBottom: theme.spacing.md,
    },
    usageRow: {
      marginBottom: theme.spacing.md,
    },
    usageHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: theme.spacing.xs,
    },
    usageName: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.semibold,
      lineHeight: theme.lineHeight.bodySmall,
    },
    usagePercent: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.bodySmall,
      fontVariant: ['tabular-nums'],
    },
    chip: {
      alignSelf: 'flex-start',
      backgroundColor: theme.colors.elevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.full,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      minHeight: 44,
      justifyContent: 'center',
    },
    chipText: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.semibold,
      lineHeight: theme.lineHeight.bodySmall,
    },
    badge: {
      color: theme.colors.textMuted,
      fontSize: theme.fontSize.caption,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.caption,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      padding: theme.spacing.xl,
      gap: theme.spacing.lg,
    },
    centerText: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.body,
      textAlign: 'center',
    },
  });

  if (loading) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Skeleton height={34} width="70%" />
        <Skeleton height={120} borderRadius={theme.radius.lg} />
        <Skeleton height={188} borderRadius={theme.radius.xl} />
        <Skeleton height={56} borderRadius={theme.radius.lg} />
      </ScrollView>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.centerText}>Can&apos;t reach the server. Nothing was paid.</Text>
        {onRetry ? <PrimaryButton title="Try again" onPress={onRetry} /> : null}
      </View>
    );
  }

  if (cards.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.centerText}>No cards yet.</Text>
        <Text style={styles.centerText}>Add your first card to see balances, due dates, and Debt Guard picks here.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View>
        <Text style={styles.greeting}>{greeting}</Text>
        <Text style={styles.tagline}>
          Most apps help you earn points. Pocket Pilot makes sure you keep your money.
        </Text>
      </View>

      <ImpactStrip title="Money kept this month" items={moneyKept} />

      <View>
        <Text style={styles.totals}>
          {formatMoneyWhole(totals.balance)} of {formatMoneyWhole(totals.limit)}
        </Text>
        <Text style={styles.totalsLabel}>
          {Math.round(totals.utilization * 100)}% used across {cards.length} cards
        </Text>
      </View>

      <CardStack
        cards={cards}
        expanded={expanded}
        selectedCardId={selectedCardId}
        onCardPress={(card) => {
          setSelectedCardId(card.id);
          onSelectCard?.(card);
        }}
        onToggle={() => setExpanded((value) => !value)}
      />

      <View>
        <Text style={styles.sectionTitle}>Usage by card</Text>
        {cards.map((card) => (
          <View key={card.id} style={styles.usageRow}>
            <View style={styles.usageHeader}>
              <Text style={styles.usageName}>{card.name}</Text>
              <Text style={styles.usagePercent}>{Math.round(card.utilization * 100)}%</Text>
            </View>
            <UsageBar value={card.utilization} />
          </View>
        ))}
      </View>

      <DebtGuardSwitch
        value={debtGuard}
        onValueChange={onDebtGuardChange}
        explainer="On when you carry a balance: picks the card that costs you least, not the one with the most points"
      />

      <View style={styles.chip} accessibilityLabel={`Next due: ${nextDue.date}, ${nextDue.cardName}`}>
        <Text style={styles.chipText}>Next due: {nextDue.date} · {nextDue.cardName}</Text>
      </View>

      <Text style={styles.badge}>Live data · Capital One Nessie</Text>
    </ScrollView>
  );
}

export default memo(WalletScreen);

import React, { memo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { cardArt, useTheme } from '../theme';
import type { FundingOption, FundingRule, Installment } from '../types';
import { formatMoney, formatMoneyWhole } from '../types';
import FundingChip from '../components/FundingChip';
import PrimaryButton from '../components/PrimaryButton';
import Skeleton from '../components/Skeleton';

export type OneCardScreenProps = {
  cardName: string;
  funding: FundingOption;
  onFundingChange: (funding: FundingOption) => void;
  /** Rule for the currently selected funding option. */
  rule: FundingRule;
  checkingBalance: number;
  safetyBuffer: number;
  /** checkingBalance minus safetyBuffer, for the debit rule. */
  availableAfterBuffer: number;
  installments: Installment[];
  purchaseAmount: number;
  simulated: boolean;
  merchantCategoryKept: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};

function OneCardScreen({
  cardName,
  funding,
  onFundingChange,
  rule,
  checkingBalance,
  safetyBuffer,
  availableAfterBuffer,
  installments,
  purchaseAmount,
  simulated,
  merchantCategoryKept,
  loading,
  error,
  onRetry,
}: OneCardScreenProps) {
  const { theme } = useTheme();
  const art = cardArt.flexible;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: {
      padding: theme.spacing.lg,
      paddingBottom: theme.spacing.xxxl,
      gap: theme.spacing.lg,
    },
    heading: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.title,
      fontWeight: theme.fontWeight.extrabold,
      lineHeight: theme.lineHeight.title,
    },
    card: {
      borderRadius: theme.radius.xl,
      overflow: 'hidden',
      minHeight: 188,
      ...theme.shadows.card,
    },
    gradient: {
      flex: 1,
      padding: theme.spacing.xl,
      justifyContent: 'space-between',
      minHeight: 188,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.cardOverlay,
    },
    cardName: {
      color: theme.colors.cardText,
      fontSize: theme.fontSize.subheading,
      fontWeight: theme.fontWeight.bold,
      lineHeight: theme.lineHeight.subheading,
    },
    cardAmount: {
      color: theme.colors.cardText,
      fontSize: theme.fontSize.title,
      fontWeight: theme.fontWeight.extrabold,
      lineHeight: theme.lineHeight.title,
      fontVariant: ['tabular-nums'],
    },
    cardMeta: {
      color: theme.colors.cardTextSecondary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.bodySmall,
      marginTop: theme.spacing.xs,
    },
    badges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    badge: {
      backgroundColor: theme.colors.elevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.full,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      minHeight: 44,
      justifyContent: 'center',
    },
    badgeText: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.semibold,
      lineHeight: theme.lineHeight.bodySmall,
    },
    panel: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.lg,
      padding: theme.spacing.lg,
    },
    panelTitle: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.bold,
      lineHeight: theme.lineHeight.body,
    },
    panelText: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.bodySmall,
      marginTop: theme.spacing.sm,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.bold,
      lineHeight: theme.lineHeight.bodySmall,
    },
    installmentRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      padding: theme.spacing.lg,
      minHeight: 56,
      alignItems: 'center',
    },
    installmentDate: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.semibold,
      lineHeight: theme.lineHeight.bodySmall,
    },
    installmentAmount: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.bold,
      lineHeight: theme.lineHeight.bodySmall,
      fontVariant: ['tabular-nums'],
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
        <Skeleton height={188} borderRadius={theme.radius.xl} />
        <Skeleton height={52} borderRadius={theme.radius.full} />
        <Skeleton height={96} borderRadius={theme.radius.lg} />
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>One Card</Text>

      <View style={styles.card}>
        <LinearGradient colors={art.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
          <View style={styles.overlay} pointerEvents="none" />
          <Text style={styles.cardName}>{cardName}</Text>
          <View>
            <Text style={styles.cardAmount}>{formatMoney(purchaseAmount)}</Text>
            <Text style={styles.cardMeta}>
              Checking {formatMoneyWhole(checkingBalance)} minus {formatMoneyWhole(safetyBuffer)} safety buffer leaves {formatMoneyWhole(availableAfterBuffer)}
            </Text>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.badges}>
        {simulated ? (
          <View style={styles.badge} accessibilityLabel="Simulated card">
            <Text style={styles.badgeText}>Simulated</Text>
          </View>
        ) : null}
        {merchantCategoryKept ? (
          <View style={styles.badge} accessibilityLabel="Merchant category kept">
            <Text style={styles.badgeText}>Merchant category kept</Text>
          </View>
        ) : null}
      </View>

      <FundingChip selected={funding} onSelect={onFundingChange} />

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{rule.title}</Text>
        <Text style={styles.panelText}>{rule.detail}</Text>
      </View>

      {funding === 'installments' ? (
        <View style={{ gap: theme.spacing.md }}>
          <Text style={styles.sectionTitle}>Installment schedule</Text>
          {installments.map((installment) => (
            <View key={installment.id} style={styles.installmentRow}>
              <Text style={styles.installmentDate}>{installment.date}</Text>
              <Text style={styles.installmentAmount}>{formatMoney(installment.amount)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.panelText}>
          Choose 4 Installments above to see the payment schedule for this purchase.
        </Text>
      )}
    </ScrollView>
  );
}

export default memo(OneCardScreen);

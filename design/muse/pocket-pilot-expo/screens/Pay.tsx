import React, { memo, useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../theme';
import type { CreditCardData, PayRecommendation, RankedCard } from '../types';
import CreditCard from '../components/CreditCard';
import DebtGuardSwitch from '../components/DebtGuardSwitch';
import PrimaryButton from '../components/PrimaryButton';
import RankedCardRow from '../components/RankedCardRow';
import Skeleton from '../components/Skeleton';
import StoreChip from '../components/StoreChip';

export type PayScreenProps = {
  stores: string[];
  selectedStore: string;
  onStoreChange: (store: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  amount: string;
  onAmountChange: (amount: string) => void;
  debtGuard: boolean;
  onDebtGuardChange: (value: boolean) => void;
  recommendation: PayRecommendation | null;
  ranked: RankedCard[];
  winningCard: CreditCardData | null;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};

/**
 * Winning card rises out of the stack (spring, ~300ms) when the winner changes;
 * ranked rows for other cards dim slightly. Debt Guard re-runs the pick, so
 * toggling it re-animates the winner to the new card.
 */
function PayScreen({
  stores,
  selectedStore,
  onStoreChange,
  searchQuery,
  onSearchChange,
  amount,
  onAmountChange,
  debtGuard,
  onDebtGuardChange,
  recommendation,
  ranked,
  winningCard,
  loading,
  error,
  onRetry,
}: PayScreenProps) {
  const { theme } = useTheme();
  const rise = useSharedValue(0);

  useEffect(() => {
    // Reset, then spring up, every time the winner changes.
    rise.value = 0;
    rise.value = theme.reduceMotion ? 1 : withSpring(1, { damping: 20, stiffness: 180 });
  }, [recommendation?.winningCardId, rise, theme.reduceMotion]);

  const riseStyle = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [{ translateY: (1 - rise.value) * 24 }, { scale: 0.97 + rise.value * 0.03 }],
  }));

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
    label: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.bold,
      lineHeight: theme.lineHeight.bodySmall,
      marginBottom: theme.spacing.sm,
    },
    input: {
      minHeight: 48,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.spacing.lg,
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.medium,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    note: {
      backgroundColor: theme.colors.elevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.lg,
      padding: theme.spacing.lg,
    },
    noteText: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.semibold,
      lineHeight: theme.lineHeight.bodySmall,
    },
    noteDetail: {
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
    },
    rankedList: { gap: theme.spacing.md },
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
        <Skeleton height={48} borderRadius={theme.radius.md} />
        <Skeleton height={44} borderRadius={theme.radius.full} />
        <Skeleton height={188} borderRadius={theme.radius.xl} />
        <Skeleton height={72} borderRadius={theme.radius.lg} />
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

  if (ranked.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.centerText}>No ranked cards yet.</Text>
        <Text style={styles.centerText}>Pick a store and enter an amount to see the best card for this purchase.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Pay here</Text>

      <View>
        <Text style={styles.label}>Store</Text>
        <TextInput
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder="Search stores"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Search stores"
          style={styles.input}
        />
      </View>

      <View style={styles.chips}>
        {stores.map((store) => (
          <StoreChip
            key={store}
            label={store}
            selected={selectedStore === store}
            onPress={() => onStoreChange(store)}
          />
        ))}
      </View>

      <View>
        <Text style={styles.label}>Amount</Text>
        <TextInput
          value={amount}
          onChangeText={onAmountChange}
          keyboardType="decimal-pad"
          placeholder="$0.00"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Purchase amount"
          style={styles.input}
        />
      </View>

      <DebtGuardSwitch
        value={debtGuard}
        onValueChange={onDebtGuardChange}
        explainer="On when you carry a balance: picks the card that costs you least, not the one with the most points"
      />

      {recommendation && winningCard ? (
        <>
          <Animated.View style={riseStyle}>
            <CreditCard card={winningCard} />
          </Animated.View>
          <View style={styles.note}>
            <Text style={styles.noteText}>{recommendation.headline}</Text>
            <Text style={styles.noteDetail}>{recommendation.detail}</Text>
          </View>
          <View style={styles.note}>
            <Text style={styles.noteText}>{recommendation.storeTypeNote}</Text>
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>
        Ranked by {debtGuard ? 'lowest cost' : 'rewards'}
      </Text>
      <View style={styles.rankedList}>
        {ranked.map((item, index) => (
          <RankedCardRow
            key={item.card.id}
            rank={index + 1}
            ranked={item}
            isWinner={item.card.id === recommendation?.winningCardId}
            dimmed={Boolean(recommendation) && item.card.id !== recommendation?.winningCardId}
          />
        ))}
      </View>
    </ScrollView>
  );
}

export default memo(PayScreen);
